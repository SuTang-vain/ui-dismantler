import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { chromium, type Browser, type Page } from "playwright-core";
import type {
  BrowserQualityReport,
  ComputedStyleSnapshot,
  PixelDiffReport,
  SelectorCoverageReport,
  StyleComparisonReport,
} from "../types.js";

const STYLE_PROPERTIES = [
  "display", "position", "visibility", "opacity", "box-sizing",
  "width", "height", "min-width", "min-height", "max-width", "max-height",
  "top", "right", "bottom", "left", "inset", "transform", "transform-origin",
  "flex-direction", "flex-wrap", "justify-content", "align-items", "align-content", "gap",
  "grid-template-columns", "grid-template-rows", "grid-auto-flow",
  "overflow", "overflow-x", "overflow-y", "z-index",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "background-color", "background-image", "color", "border-top-width", "border-right-width",
  "border-bottom-width", "border-left-width", "border-top-color", "border-radius",
  "box-shadow", "font-size", "font-weight", "line-height", "text-align",
] as const;

interface BrowserSnapshot {
  ok: boolean;
  runtimeErrors: string[];
  selectorCoverage: SelectorCoverageReport;
  styles: ComputedStyleSnapshot[];
  screenshot: Buffer;
}

export interface BrowserQualityOptions {
  width?: number;
  height?: number;
  pixelThreshold?: number;
  selectorCoverageThreshold?: number;
  styleThreshold?: number;
  artifactDir?: string;
  executablePath?: string;
}

function chromeCandidates(): string[] {
  return [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((value): value is string => Boolean(value));
}

async function launchBrowser(executablePath?: string): Promise<Browser> {
  const candidate = executablePath ?? chromeCandidates().find(existsSync);
  if (!candidate) throw new Error("未找到 Chrome/Chromium；可通过 CHROME_PATH 指定浏览器路径");
  return chromium.launch({ executablePath: candidate, headless: true, args: ["--allow-file-access-from-files", "--disable-web-security"] });
}

async function firstExample(libDir: string): Promise<string> {
  const dir = resolve(libDir, "examples");
  const names = (await readdir(dir)).filter((name) => name.endsWith(".html")).sort();
  if (!names.length) throw new Error(`${dir} 下没有 HTML example`);
  return resolve(dir, names[0]);
}

async function waitForSettled(page: Page, rootSelector: string): Promise<void> {
  await page.waitForSelector(rootSelector, { state: "attached", timeout: 5000 });
  await page.waitForFunction((selector) => {
    const root = document.querySelector(selector);
    return Boolean(root && (root.children.length || root.textContent?.trim()));
  }, rootSelector, { timeout: 5000 });
  await page.addStyleTag({ content: `
    *, *::before, *::after { animation-delay: 0s !important; animation-duration: 0s !important; transition: none !important; caret-color: transparent !important; }
    html { scroll-behavior: auto !important; }
    ::-webkit-scrollbar { display: none !important; }
  ` });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  });
  await page.waitForTimeout(100);
}

async function collectBrowserSnapshot(page: Page, rootSelector: string, url: string, withScreenshot = true): Promise<BrowserSnapshot> {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
  await page.goto(pathToFileURL(url).href, { waitUntil: "load", timeout: 15000 });
  await waitForSettled(page, rootSelector);
  const data = await page.evaluate(({ rootSelector: selector, properties }) => {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`缺少根节点 ${selector}`);

    const stableSelector = (element: Element): string => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const classes = [...element.classList].slice(0, 2).map((name) => `.${CSS.escape(name)}`).join("");
      if (classes) return `${element.tagName.toLowerCase()}${classes}`;
      const parent = element.parentElement;
      if (!parent) return element.tagName.toLowerCase();
      return `${stableSelector(parent)} > ${element.tagName.toLowerCase()}:nth-child(${[...parent.children].indexOf(element) + 1})`;
    };
    const normalizeSelector = (value: string): string => value
      .replace(/::(?:before|after|marker|placeholder|selection|backdrop|first-letter|first-line)/g, "")
      .replace(/:(?:hover|active|focus|focus-visible|focus-within|visited|target|checked|disabled|enabled)/g, "");
    const allSelectors: string[] = [];
    const visitRules = (rules: CSSRuleList): void => {
      for (const rule of [...rules]) {
        if ("cssRules" in rule) {
          try { visitRules((rule as CSSGroupingRule).cssRules); } catch { /* inaccessible stylesheet */ }
        }
        if (rule instanceof CSSStyleRule) allSelectors.push(...rule.selectorText.split(",").map((item) => item.trim()));
      }
    };
    for (const sheet of [...document.styleSheets]) {
      try { visitRules(sheet.cssRules); } catch { /* cross-origin stylesheet */ }
    }

    const sgElements = [...root.querySelectorAll("[class*='sg-']")].filter((element) => [...element.classList].some((name) => name.startsWith("sg-")));
    const classUses = new Map<string, Element[]>();
    for (const element of sgElements) for (const name of element.classList) if (name.startsWith("sg-")) classUses.set(name, [...(classUses.get(name) ?? []), element]);
    const unmatchedClasses = [];
    const inactiveClasses = [];
    for (const [className, elements] of classUses) {
      const candidates = allSelectors.filter((item) => item.includes(`.${className}`));
      if (!candidates.length) {
        unmatchedClasses.push({ selector: `.${className}`, count: elements.length, examples: elements.slice(0, 3).map(stableSelector) });
        continue;
      }
      const active = candidates.some((candidate) => {
        try { return document.querySelector(normalizeSelector(candidate)) !== null; } catch { return false; }
      });
      if (!active) inactiveClasses.push({ selector: `.${className}`, count: elements.length, examples: elements.slice(0, 3).map(stableSelector) });
    }
    const sgSelectors = allSelectors.filter((item) => /(?:[.#]sg-[\w-]+)/.test(item));
    const orphanSgSelectors = sgSelectors.flatMap((cssSelector) => {
      try {
        const count = document.querySelectorAll(normalizeSelector(cssSelector)).length;
        return count ? [] : [{ selector: cssSelector, count: 0, examples: [] }];
      } catch { return []; }
    }).slice(0, 50);
    const sgClassUses = [...classUses.values()].reduce((total, elements) => total + elements.length, 0);
    const unmatchedUses = unmatchedClasses.reduce((total, issue) => total + issue.count, 0);
    const inactiveUses = inactiveClasses.reduce((total, issue) => total + issue.count, 0);
    const mismatchHints = unmatchedClasses.flatMap((issue) => {
      const token = issue.selector.replace(/^\.sg-/, "").split("-").at(-1) ?? "";
      const candidate = orphanSgSelectors.find((orphan) => {
        const normalized = orphan.selector.replace(/[.#]sg-/g, "").toLowerCase();
        return token.length > 2 && new RegExp(`(?:[.#-]|^)${token}(?:[\s.#:[>+~]|$)`).test(normalized);
      });
      if (!candidate) return [];
      return [{
        domClass: issue.selector,
        cssSelector: candidate.selector,
        reason: candidate.selector.includes(`#sg-${token}`) ? "DOM 使用 class，但 CSS 疑似使用了 id" : "DOM/CSS 的 sg- 前缀或修饰类命名不一致",
      }];
    });
    const selectorCoverage = {
      passed: unmatchedClasses.length === 0,
      sgElements: sgElements.length,
      sgClassUses,
      matchedSgClassUses: sgClassUses - unmatchedUses,
      coverageRate: sgClassUses ? (sgClassUses - unmatchedUses) / sgClassUses : 1,
      unmatchedClasses,
      inactiveClasses,
      activeMatchRate: sgClassUses ? (sgClassUses - unmatchedUses - inactiveUses) / sgClassUses : 1,
      orphanSgSelectors,
      mismatchHints,
    };

    const nodes = [root, ...root.querySelectorAll("[id], [class], [style]")].slice(0, 500);
    const styles = nodes.map((element, index) => {
      const computed = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const classes = [...element.classList];
      const semantic = classes.map((name) => name.toLowerCase().replace(/^sg-/, "")).sort().join(".");
      return {
        key: `${element.tagName.toLowerCase()}|${semantic || element.id || index}`,
        tag: element.tagName.toLowerCase(),
        classes,
        selector: stableSelector(element),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        styles: Object.fromEntries(properties.map((property) => [property, computed.getPropertyValue(property).trim()])),
      };
    });
    return { selectorCoverage, styles };
  }, { rootSelector, properties: [...STYLE_PROPERTIES] });
  const screenshot = withScreenshot ? await page.screenshot({ type: "png", fullPage: false, animations: "disabled" }) : Buffer.alloc(0);
  return { ok: true, runtimeErrors: runtimeErrors.slice(0, 20), selectorCoverage: data.selectorCoverage, styles: data.styles, screenshot };
}

function normalizeClasses(values: string[]): Set<string> {
  return new Set(values.map((value) => value.toLowerCase().replace(/^sg-/, "")).filter(Boolean));
}

function suffixTokens(value: string): Set<string> {
  const parts = value.split("-");
  return new Set(parts.map((_, index) => parts.slice(index).join("-")));
}

function classSimilarity(a: string[], b: string[]): number {
  const left = normalizeClasses(a), right = normalizeClasses(b);
  if (!left.size && !right.size) return 0.2;
  if (!left.size || !right.size) return 0;
  const exact = [...left].filter((value) => right.has(value)).length;
  const union = new Set([...left, ...right]).size;
  const leftSuffix = new Set([...left].flatMap((value) => [...suffixTokens(value)]));
  const rightSuffix = new Set([...right].flatMap((value) => [...suffixTokens(value)]));
  const suffix = [...leftSuffix].filter((value) => rightSuffix.has(value)).length;
  return Math.min(1, exact / union + Math.min(0.6, suffix / Math.max(left.size, right.size) * 0.6));
}

function valuesEqual(property: string, left: string, right: string): boolean {
  if (left === right) return true;
  const pixel = /^(-?\d+(?:\.\d+)?)px$/;
  const leftPixel = left.match(pixel), rightPixel = right.match(pixel);
  if (leftPixel && rightPixel) return Math.abs(Number(leftPixel[1]) - Number(rightPixel[1])) <= 1;
  if (property === "transform" && left.startsWith("matrix") && right.startsWith("matrix")) {
    const numbers = (value: string) => [...value.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
    const a = numbers(left), b = numbers(right);
    return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) <= 0.02);
  }
  return false;
}

export function compareComputedStyles(reference: ComputedStyleSnapshot[], generated: ComputedStyleSnapshot[]): StyleComparisonReport {
  const used = new Set<number>();
  let propertyCount = 0, matchingProperties = 0, matched = 0;
  const mismatches: StyleComparisonReport["mismatches"] = [];
  for (const expected of reference) {
    let bestIndex = -1, bestScore = 0;
    generated.forEach((candidate, index) => {
      if (used.has(index)) return;
      const score = classSimilarity(expected.classes, candidate.classes) + (expected.tag === candidate.tag ? 0.35 : 0);
      if (score > bestScore) { bestScore = score; bestIndex = index; }
    });
    if (bestIndex < 0 || bestScore < 0.35) continue;
    used.add(bestIndex); matched += 1;
    const actual = generated[bestIndex];
    for (const property of STYLE_PROPERTIES) {
      propertyCount += 1;
      const left = expected.styles[property] ?? "", right = actual.styles[property] ?? "";
      if (valuesEqual(property, left, right)) matchingProperties += 1;
      else if (mismatches.length < 100) mismatches.push({ key: `${expected.selector} ↔ ${actual.selector}`, property, reference: left, generated: right });
    }
    for (const property of ["x", "y", "width", "height"] as const) {
      propertyCount += 1;
      if (Math.abs(expected.rect[property] - actual.rect[property]) <= 1) matchingProperties += 1;
      else if (mismatches.length < 100) mismatches.push({ key: `${expected.selector} ↔ ${actual.selector}`, property: `rect.${property}`, reference: String(expected.rect[property]), generated: String(actual.rect[property]) });
    }
  }
  return { matched, referenceCount: reference.length, generatedCount: generated.length, propertyCount, matchingProperties, rate: propertyCount ? Number((matchingProperties / propertyCount).toFixed(4)) : 0, mismatches };
}

async function comparePixels(reference: Buffer, generated: Buffer, threshold: number, artifactDir?: string): Promise<PixelDiffReport> {
  const a = PNG.sync.read(reference), b = PNG.sync.read(generated);
  const width = Math.min(a.width, b.width), height = Math.min(a.height, b.height);
  const diff = new PNG({ width, height });
  const differentPixels = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1, includeAA: false });
  const totalPixels = width * height;
  const report: PixelDiffReport = { width, height, differentPixels, totalPixels, diffRate: Number((differentPixels / totalPixels).toFixed(6)), passed: differentPixels / totalPixels <= threshold, threshold };
  if (artifactDir) {
    const dir = resolve(artifactDir); await mkdir(dir, { recursive: true });
    report.referenceImagePath = resolve(dir, "reference.png");
    report.generatedImagePath = resolve(dir, "generated.png");
    report.diffImagePath = resolve(dir, "diff.png");
    await Promise.all([writeFile(report.referenceImagePath, reference), writeFile(report.generatedImagePath, generated), writeFile(report.diffImagePath, PNG.sync.write(diff))]);
  }
  return report;
}

export async function evaluateBrowserQuality(htmlPath: string, libDir: string, options: BrowserQualityOptions = {}): Promise<BrowserQualityReport> {
  const width = options.width ?? 1024, height = options.height ?? 768;
  const pixelThreshold = options.pixelThreshold ?? 0.02;
  const selectorThreshold = options.selectorCoverageThreshold ?? 1;
  const styleThreshold = options.styleThreshold ?? 0.98;
  let browser: Browser | undefined;
  try {
    browser = await launchBrowser(options.executablePath);
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
    const referencePage = await context.newPage(), generatedPage = await context.newPage();
    const example = await firstExample(libDir);
    const [reference, generated] = await Promise.all([
      collectBrowserSnapshot(referencePage, "body", resolve(htmlPath)),
      collectBrowserSnapshot(generatedPage, "#mount", example),
    ]);
    const styles = compareComputedStyles(reference.styles, generated.styles);
    const pixels = await comparePixels(reference.screenshot, generated.screenshot, pixelThreshold, options.artifactDir);
    const selectorCoverage = generated.selectorCoverage;
    const score = Number((styles.rate * 0.55 + (1 - pixels.diffRate) * 0.35 + selectorCoverage.coverageRate * 0.1).toFixed(4));
    const passed = selectorCoverage.coverageRate >= selectorThreshold && styles.rate >= styleThreshold && pixels.passed && generated.runtimeErrors.length === 0 && reference.runtimeErrors.length === 0;
    return {
      available: true,
      reference: { ok: reference.ok, runtimeErrors: reference.runtimeErrors, selectorCoverage: reference.selectorCoverage, styles: reference.styles },
      generated: { ok: generated.ok, runtimeErrors: generated.runtimeErrors, selectorCoverage: generated.selectorCoverage, styles: generated.styles },
      selectorCoverage, styles, pixels, score, passed,
    };
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error), passed: false };
  } finally {
    await browser?.close();
  }
}


export async function evaluateLibrarySelectorCoverage(libDir: string, options: Pick<BrowserQualityOptions, "width" | "height" | "executablePath"> = {}): Promise<{ available: boolean; error?: string; coverage?: SelectorCoverageReport; runtimeErrors?: string[] }> {
  let browser: Browser | undefined;
  try {
    browser = await launchBrowser(options.executablePath);
    const context = await browser.newContext({ viewport: { width: options.width ?? 1024, height: options.height ?? 768 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const example = await firstExample(libDir);
    const snapshot = await collectBrowserSnapshot(page, "#mount", example, false);
    return { available: true, coverage: snapshot.selectorCoverage, runtimeErrors: snapshot.runtimeErrors };
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await browser?.close();
  }
}
