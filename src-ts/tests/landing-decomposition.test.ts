import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzeHtml } from "../analysis/analyzer.js";
import { planComponents } from "../planning/components.js";

function landingPage(): string {
  const section = (heading: string, copy: string, controls = ""): string =>
    `<div class="block"><div class="head"><h2>${heading}</h2></div><div class="copy"><p>${copy}</p>${controls}</div></div>`;
  const filler = "This paragraph carries enough visible copy for the section to count as a content region. ".repeat(2);
  return `<!doctype html><html lang="en"><head><style>:root{--brand:#123456}body{margin:0}</style></head><body>
    <div class="app">
      <div class="site-nav"><a href="/one">Enterprise</a><a href="/two">Docs</a><a href="/three">Pricing</a><a href="/four">Contact</a></div>
      <div class="content">
        ${section("We took the opposite research direction", filler, '<a href="/proof">proof</a>')}
        ${section("193.6x Faster, 444.6x Cheaper.", filler, '<button type="button">Compare</button>')}
        ${section("Pricing that scales", filler)}
        ${section("Come Build With Us", filler, '<a href="/jobs">Open roles</a>')}
        <div class="block" aria-label="Pricing table"><p>${filler}${filler}</p></div>
      </div>
      <div class="site-foot"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/accessibility">Accessibility</a></div>
    </div>
    <section id="consent" aria-label="Cookie consent"><p>With your permission we track usage for improving our applications.</p><div><button type="button">Reject</button><button type="button">Accept</button></div></section>
  </body></html>`;
}

async function manifestFor(html: string) {
  const directory = await mkdtemp(join(tmpdir(), "ui-dismantler-landing-"));
  const path = join(directory, "page.html");
  await writeFile(path, html, "utf8");
  return analyzeHtml(path);
}

test("heading-led landing pages decompose into content sections instead of one page shell", async () => {
  const manifest = await manifestFor(landingPage());
  const views = manifest.structure.views;
  const sections = views.filter((view) => view.type === "content-section");
  assert.ok(sections.length >= 4, `expected at least 4 content sections, received ${sections.length}: ${views.map((view) => view.type).join(",")}`);
  assert.equal(views.some((view) => view.type === "page-header"), true);
  assert.equal(views.some((view) => view.type === "page-footer"), true);
  assert.equal(views.some((view) => view.type === "page-overlay"), true);
  assert.equal(new Set(views.map((view) => view.selector)).size, views.length);
});

test("landing decomposition leaves no interaction unowned and the plan is dispatch ready", async () => {
  const manifest = await manifestFor(landingPage());
  const plan = planComponents(manifest);
  assert.equal(plan.summary.unownedInteractions, 0, JSON.stringify(plan.issues));
  assert.equal(plan.summary.ready, true);
  assert.ok(plan.components.length >= 6, `expected at least 6 components, received ${plan.components.length}`);
  const overlay = plan.components.find((component) => component.sourceSelector.includes("consent"));
  assert.ok(overlay, "consent overlay must become its own component");
  assert.ok(overlay!.interactionFingerprints.length >= 2);
});

test("heading-less blocks take their name from aria-label and long headings stay bounded", async () => {
  const manifest = await manifestFor(landingPage());
  const plan = planComponents(manifest);
  const pricing = plan.components.find((component) => component.sourceSelector.includes("framer") === false && component.componentName === "PricingTable");
  assert.ok(pricing, `expected aria-labelled section to be named PricingTable, received ${plan.components.map((component) => component.componentName).join(",")}`);
  const bounded = plan.components.every((component) => component.componentName.length <= 32);
  assert.ok(bounded, `component names must stay bounded: ${plan.components.map((component) => component.componentName).join(",")}`);
});

test("semantic section markup keeps the existing section path without duplicate views", async () => {
  const html = landingPage().replace('<div class="content">', '<div class="content"><section id="hero-block"><h1>Hero title</h1><p>Hero copy that is long enough to be treated as a real section.</p></section>');
  const manifest = await manifestFor(html);
  const selectors = manifest.structure.views.map((view) => view.selector);
  assert.equal(new Set(selectors).size, selectors.length);
  assert.equal(selectors.filter((selector) => selector.includes("hero-block")).length, 1);
  const sections = manifest.structure.views.filter((view) => view.type === "content-section");
  assert.ok(sections.length >= 3, `expected the remaining heading blocks to decompose, received ${sections.length}`);
});

test("default CSS budget reads large inline styles instead of truncating them", async () => {
  const padding = Array.from({ length: 6000 }, (_, index) => `.filler-${index}{padding:${index % 40}px}`).join("");
  const html = landingPage().replace("</head>", `<style>${padding}:root{--late-token:#abcdef}</style></head>`);
  const manifest = await manifestFor(html);
  assert.equal(manifest.warnings.some((warning) => warning.includes("CSS") && warning.includes("跳过")), false, manifest.warnings.join(" | "));
  const names = manifest.theme.tokens.map((token) => token.name);
  assert.ok(names.includes("brand"), `expected brand token, received ${names.slice(0, 12).join(",")}`);
  assert.ok(names.some((name) => name.includes("late-token") || name === "abcdef"), `expected late token, received ${names.slice(-6).join(",")}`);
});
