import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { extractRootVariables, parseCssRules } from "../core/css.js";
import type { Manifest, ValidationReport, ValidationResult } from "../types.js";

const GENERIC_CLASSES = new Set([
  "tab", "member", "modal", "view", "panel", "avatar", "arrow", "dot", "frame", "carousel", "timeline", "story", "detail", "relation",
  "card", "btn", "button", "icon", "title", "subtitle", "kicker", "badge", "chip", "tag", "label", "value", "head", "header", "body", "foot", "footer", "content", "overlay", "wrap", "wrapper", "container", "grid", "row", "col", "cell", "item", "list", "section", "nav", "bar", "cover", "photo", "img", "image", "thumb", "thumbnail", "video", "prev", "next", "close",
]);
const SEMANTIC_BASE_CLASSES = new Set(["sg-arrow", "sg-prev", "sg-next", "sg-dots", "sg-dot", "sg-tl-prev", "sg-tl-next", "sg-tl-dot", "sg-tl-dots"]);
const DYNAMIC_PREFIXES = ["sg-is-", "sg-tab-", "sg-panel-", "sg-rel-", "sg-mdm-", "sg-member-modal-", "sg-tl-page-label", "sg-work-story-"];

function files(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && pattern.test(entry.name)).map((entry) => join(dir, entry.name));
}
function read(paths: string[]): string { return paths.map((path) => readFileSync(path, "utf8")).join("\n"); }
function classesFromSelectors(css: string): Set<string> {
  return new Set([...css.matchAll(/\.(sg-[a-z][\w-]*)/gi)].map((match) => match[1]));
}
function classesFromJs(js: string): Set<string> {
  const patterns = [
    /el\(\s*['"][a-z]+['"]\s*,\s*['"]([^'"]*sg-[\w-]+[^'"]*)['"]/g,
    /class\s*=\s*['"]([^'"]*sg-[\w-]+[^'"]*)['"]/g,
    /classList\.(?:add|remove|toggle)\(\s*['"]([^'"]*)['"]/g,
    /querySelector(?:All)?\(\s*['"]\.([^'".\s]+)['"]/g,
    /className\s*[:=]\s*['"]([^'"]*sg-[\w-]+[^'"]*)['"]/g,
    /setAttribute\(\s*['"]class['"]\s*,\s*['"]([^'"]*)['"]/g,
  ];
  const result = new Set<string>();
  for (const pattern of patterns) for (const match of js.matchAll(pattern)) for (const token of match[1].matchAll(/(sg-[a-z][\w-]*)/g)) result.add(token[1]);
  return result;
}

export class LibraryValidator {
  readonly dir: string;
  readonly cssFiles: string[];
  readonly jsFiles: string[];
  readonly htmlFiles: string[];
  readonly css: string;
  readonly js: string;
  private results: ValidationResult[] = [];

  constructor(dir: string) {
    this.dir = resolve(dir);
    this.cssFiles = files(join(this.dir, "src"), /\.css$/i);
    this.jsFiles = files(join(this.dir, "src"), /\.js$/i);
    this.htmlFiles = files(join(this.dir, "examples"), /\.html?$/i);
    this.css = read(this.cssFiles);
    this.js = read(this.jsFiles);
  }

  run(): ValidationReport {
    this.results = [];
    if (!this.cssFiles.length) return this.failure("未找到 src/*.css");
    if (!this.jsFiles.length) return this.failure("未找到 src/*.js");
    this.checkNaming();
    this.checkVariables();
    this.checkDataSeparation();
    this.checkResponsive();
    this.checkA11y();
    this.checkTheme();
    this.checkNoDependencies();
    this.checkDocs();
    this.checkClassAlignment();
    const passed = this.results.filter((item) => item.passed).length;
    return { target: this.dir, passed, failed: this.results.length - passed, total: this.results.length, ok: passed === this.results.length, results: this.results };
  }

  private record(id: string, name: string, passed: boolean, detail: string): void { this.results.push({ id, name, passed, detail }); }
  private failure(detail: string): ValidationReport { return { target: this.dir, passed: 0, failed: 1, total: 1, ok: false, results: [{ id: "filesystem", name: "组件库文件结构", passed: false, detail }] }; }

  private checkNaming(): void {
    const issues: string[] = [];
    for (const rule of parseCssRules(this.css)) {
      for (const part of rule.selector.split(",")) {
        const subject = part.trim().split(/[\s>+~]+/).at(-1) ?? "";
        for (const match of subject.matchAll(/\.([a-z][\w-]*)/gi)) if (GENERIC_CLASSES.has(match[1].toLowerCase())) issues.push(`无前缀类 .${match[1]}（应改为 .sg-${match[1]}）`);
      }
    }
    if (!/(?:global|window)\.\w+\s*=/.test(this.js)) issues.push("JS 未暴露全局对象 window.<LibName>");
    for (const html of this.htmlFiles) for (const match of readFileSync(html, "utf8").matchAll(/id=["']([^"']+)["']/g)) if (match[1] !== "mount" && !match[1].startsWith("sg-")) issues.push(`DOM id '${match[1]}' 缺 sg- 前缀（${html.split("/").at(-1)}）`);
    this.record("naming", "1. 命名前缀", !issues.length, issues.slice(0, 3).join("；") || "所有类名/id/全局对象均带 sg- 前缀");
  }

  private checkVariables(): void {
    const vars = extractRootVariables(this.css);
    const required = ["--sg-primary", "--sg-ink", "--sg-muted", "--sg-line", "--sg-paper"];
    const issues = required.filter((name) => !(name in vars)).map((name) => `缺少核心变量 ${name}`);
    for (const name of Object.keys(vars)) if (/^--(?:primary|text-main|bg-white|accent-color)$/.test(name)) issues.push(`存在未归一化变量 ${name}`);
    this.record("variables", "2. CSS 变量归一化", !issues.length, issues.join("；") || "核心主题变量齐全且已归一化");
  }

  private checkDataSeparation(): void {
    const issues: string[] = [];
    if (!/(?:mount|create)\s*\([^)]*[,)]/.test(this.js)) issues.push("JS 未体现 mount/create 数据入口");
    const hugeLiteral = /(?:const|let|var)\s+\w+\s*=\s*\[\s*\{[\s\S]{1200,}\]/.test(this.js);
    if (hugeLiteral) issues.push("JS 内含疑似硬编码大数据数组，应从 mount(options.data) 注入");
    if (this.js.includes("document.write")) issues.push("不应使用 document.write 注入数据");
    this.record("data-separation", "3. 数据与逻辑分离", !issues.length, issues.join("；") || "渲染逻辑接受外部数据且未发现大段内嵌数据");
  }

  private checkResponsive(): void {
    const mediaCount = (this.css.match(/@media\b/gi) ?? []).length;
    const widths = [...this.css.matchAll(/max-width\s*:\s*(\d+(?:\.\d+)?)px/gi)].map((match) => Number(match[1]));
    const heights = [...this.css.matchAll(/max-height\s*:\s*(\d+(?:\.\d+)?)px/gi)].map((match) => Number(match[1]));
    const hasWise = widths.some((value) => value <= 500);
    const hasExtreme = widths.some((value) => value <= 320) || heights.some((value) => value <= 380);
    const passed = hasWise && hasExtreme;
    this.record("responsive", "4. 响应式三档", passed, passed ? `含 ${mediaCount} 个 @media 断点（max-width: ${[...new Set(widths)].sort((a, b) => a - b).join(", ")}）` : `${hasWise ? "" : "缺少 WISE 断点（≤500px）"}${!hasWise && !hasExtreme ? "；" : ""}${hasExtreme ? "" : "缺少极端断点（≤320px 或高度≤380px）"}`);
  }

  private checkA11y(): void {
    const issues: string[] = [];
    for (const html of this.htmlFiles) {
      const source = readFileSync(html, "utf8");
      if (!/<html[^>]*\blang=["']/i.test(source)) issues.push(`${html.split("/").at(-1)} 缺少 html[lang]`);
      if (/<img\b(?![^>]*\balt=)[^>]*>/i.test(source)) issues.push(`${html.split("/").at(-1)} 存在 img 缺少 alt`);
      if (/<button\b[^>]*>\s*<\/button>/i.test(source) && !/aria-label=/i.test(source)) issues.push(`${html.split("/").at(-1)} 存在无标签 button`);
    }
    const accessibilitySource = this.js + read(this.htmlFiles);
    const hasTabInteraction = /(?:data-tab|aria-selected|aria-controls|role=["'](?:tab|tabpanel)|\btabpanel\b|[.#]sg-(?:tabs?|tab-[\w-]+))/i.test(accessibilitySource);
    if (hasTabInteraction && !/aria-(?:selected|controls|labelledby)|role=["'](?:tab|tabpanel)/i.test(accessibilitySource)) issues.push("Tab/Panel 交互缺少 ARIA 关联");
    if (/(?:modal|dialog)/i.test(this.js) && !/aria-(?:modal|label|labelledby)|role=["']dialog/i.test(accessibilitySource)) issues.push("Modal 交互缺少 dialog ARIA 语义");
    this.record("a11y", "5. A11y", !issues.length, issues.join("；") || "发现基础语言、图片、控件与复合交互可访问性标记");
  }

  private checkTheme(): void {
    const issues: string[] = [];
    if (!/--sg-[\w-]+\s*:/.test(this.css)) issues.push("CSS 未定义 --sg-* 主题变量");
    const rootBlocks = [...this.css.matchAll(/:root[^{}]*\{[^{}]*\}/gi)].map((match) => [match.index ?? 0, (match.index ?? 0) + match[0].length] as const);
    for (const match of this.css.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
      const index = match.index ?? 0;
      if (rootBlocks.some(([start, end]) => index >= start && index <= end)) continue;
      const declarationStart = Math.max(this.css.lastIndexOf(";", index), this.css.lastIndexOf("{", index));
      const declarationPrefix = this.css.slice(declarationStart + 1, index);
      if (/--sg-[\w-]+\s*:\s*$/i.test(declarationPrefix)) continue;
      const lineStart = this.css.lastIndexOf("\n", index) + 1;
      const lineEnd = this.css.indexOf("\n", index);
      const line = this.css.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
      if (/var\([^)]*,\s*#[0-9a-f]{3,8}/i.test(line)) continue;
      issues.push(`硬编码颜色 ${match[0]}（应走变量）`);
      if (issues.length >= 5) break;
    }
    this.record("theme", "6. 主题可定制", !issues.length, issues.join("；") || "所有颜色经变量，无硬编码 #hex（:root 与 var fallback 除外）");
  }

  private checkNoDependencies(): void {
    const issues: string[] = [];
    if (/(?:^|\n)\s*(?:import|require)\s*\(/m.test(this.js) || /(?:^|\n)\s*import\s+.+\s+from\s+["'][^./]/m.test(this.js)) issues.push("src/*.js 含第三方运行时依赖");
    if (this.htmlFiles.some((path) => /<script[^>]+src=["']https?:/i.test(readFileSync(path, "utf8")))) issues.push("example 依赖远程脚本");
    this.record("no-deps", "7. 零依赖", !issues.length, issues.join("；") || "组件库运行时无需第三方依赖");
  }

  private checkDocs(): void {
    const readme = join(this.dir, "README.md");
    const spec = join(this.dir, "docs", "设计规范.md");
    const issues: string[] = [];
    if (!existsSync(readme)) issues.push("缺少 README.md"); else if (!readFileSync(readme, "utf8").includes("mount")) issues.push("README.md 缺少 mount API");
    if (!existsSync(spec)) issues.push("缺少 docs/设计规范.md"); else if (!readFileSync(spec, "utf8").includes("主题色")) issues.push("设计规范.md 缺少主题色章节");
    this.record("docs", "8. 文档完备", !issues.length, issues.join("；") || "README.md + docs/设计规范.md 齐全");
  }

  private checkClassAlignment(): void {
    const defined = classesFromSelectors(this.css);
    const used = classesFromJs(this.js);
    const orphans = [...used].filter((name) => !defined.has(name) && !SEMANTIC_BASE_CLASSES.has(name) && !DYNAMIC_PREFIXES.some((prefix) => name.startsWith(prefix))).sort();
    this.record("class-alignment", "9. 类名对齐", !orphans.length, orphans.length ? orphans.slice(0, 5).map((name) => `JS 引用 .${name} 但 CSS 未定义`).join("；") : "JS 引用的 sg-* 类名均在 CSS 中定义");
  }
}

export function validateLibrary(dir: string): ValidationReport { return new LibraryValidator(dir).run(); }

export function appendRuntimeSelectorCheck(
  report: ValidationReport,
  coverage: import("../types.js").SelectorCoverageReport | null,
): ValidationReport {
  const result = coverage
    ? {
        id: "selector-runtime",
        name: "10. 选择器实际命中",
        passed: coverage.passed,
        detail: coverage.passed
          ? `所有需匹配的 sg-* DOM 类均有实际规则（${(coverage.coverageRate * 100).toFixed(1)}%）${coverage.exemptClasses.length ? `；运行时状态标记豁免：${coverage.exemptClasses.map((item) => item.selector).join("、")}` : ""}`
          : `未命中类：${coverage.unmatchedClasses.map((item) => `${item.selector} ×${item.count}`).join("；")}${coverage.mismatchHints.length ? `；疑似错配：${coverage.mismatchHints.map((hint) => `${hint.domClass} ↔ ${hint.cssSelector}（${hint.reason}）`).join("；")}` : ""}`,
      }
    : {
        id: "selector-runtime",
        name: "10. 选择器实际命中",
        passed: false,
        detail: "未执行真实浏览器选择器命中检查",
      };
  const sourceHookExemptions = new Set((coverage?.exemptClasses ?? []).filter((item) => item.reason === "source-unstyled-hook").map((item) => item.selector));
  const reconciled = report.results.map((item) => {
    if (item.id !== "class-alignment" || item.passed || !sourceHookExemptions.size) return item;
    const missing = [...item.detail.matchAll(/JS 引用 (\.sg-[A-Za-z0-9_-]+) 但 CSS 未定义/g)].map((match) => match[1]);
    if (!missing.length || !missing.every((selector) => sourceHookExemptions.has(selector))) return item;
    return { ...item, passed: true, detail: `JS/CSS 对齐；以下类经源页面无样式证据审计豁免：${missing.join("、")}` };
  });
  const results = [...reconciled, result];
  const passed = results.filter((item) => item.passed).length;
  return { ...report, results, passed, failed: results.length - passed, total: results.length, ok: passed === results.length };
}
