import test from "node:test";
import assert from "node:assert/strict";
import { compareComputedStyles } from "../evaluation/browser.js";
import type { ComputedStyleSnapshot } from "../types.js";

function snapshot(partial: Partial<ComputedStyleSnapshot> & Pick<ComputedStyleSnapshot, "selector">): ComputedStyleSnapshot {
  return {
    key: partial.selector,
    tag: "div",
    id: "",
    classes: [],
    text: "",
    rect: { x: 0, y: 0, width: 100, height: 40 },
    styles: { display: "block", color: "rgb(0, 0, 0)" },
    ...partial,
  };
}

test("a text-overlapping wrapper must not absorb a small leaf without identity evidence", () => {
  const reference = [
    snapshot({
      selector: "div.intro-badge",
      classes: ["intro-badge"],
      text: "Introducing Jev — intelligence beyond chat, a system one model for machines.",
      rect: { x: 0, y: 0, width: 500, height: 36 },
    }),
  ];
  const generated = [
    snapshot({
      selector: "div.sg-hero-copy",
      classes: ["sg-hero-copy"],
      // Comparable length (86 vs 100 chars) so text pairing would fire without the veto.
      text: "Introducing Jev — intelligence beyond chat, a system one model for machines. Extra words here.",
      rect: { x: 0, y: 0, width: 700, height: 500 },
    }),
  ];
  const report = compareComputedStyles(reference, generated);
  assert.equal(report.matched, 0);
  assert.deepEqual(report.unresolvedReferenceSelectors, ["div.intro-badge"]);
  assert.equal(report.propertyCount, 0);
});

test("a shared id bridges an extreme area ratio because identity is explicit", () => {
  const reference = [snapshot({ selector: "#hero", id: "hero", rect: { x: 0, y: 0, width: 1200, height: 900 } })];
  const generated = [snapshot({ selector: "#sg-hero", id: "sg-hero", rect: { x: 0, y: 0, width: 100, height: 60 } })];
  const report = compareComputedStyles(reference, generated);
  assert.equal(report.matched, 1);
  assert.deepEqual(report.unresolvedReferenceSelectors, []);
});

test("a strong shared class vocabulary bridges an extreme area ratio", () => {
  const reference = [snapshot({ selector: "div.hero.hero-copy", classes: ["hero", "hero-copy"], rect: { x: 0, y: 0, width: 1200, height: 900 } })];
  const generated = [snapshot({ selector: "div.sg-hero.sg-hero-copy", classes: ["sg-hero", "sg-hero-copy"], rect: { x: 0, y: 0, width: 100, height: 60 } })];
  const report = compareComputedStyles(reference, generated);
  assert.equal(report.matched, 1);
});

test("class-aligned trees keep exact mimicry scores and produce no unresolved entries", () => {
  const reference = [
    snapshot({ selector: "div.sg-card", classes: ["sg-card"], styles: { display: "flex", color: "rgb(1, 2, 3)" } }),
    snapshot({ selector: "span.sg-badge", tag: "span", classes: ["sg-badge"] }),
  ];
  const generated = [
    snapshot({ selector: "div.sg-card", classes: ["sg-card"], styles: { display: "flex", color: "rgb(1, 2, 3)" } }),
    snapshot({ selector: "span.sg-badge", tag: "span", classes: ["sg-badge"] }),
  ];
  const report = compareComputedStyles(reference, generated);
  assert.equal(report.matched, 2);
  assert.equal(report.rate, 1);
  assert.deepEqual(report.unresolvedReferenceSelectors, []);
});

test("comparable-length but unrelated text never pairs two nodes", () => {
  const stylesheet = "body{margin:0}.framer-x{display:flex;position:absolute;inset:0}".repeat(3);
  const copy = "We raised a really big Series A led by a16z to build system one models.".repeat(2);
  const reference = [snapshot({ selector: "style.sf-hidden", tag: "style", classes: ["sf-hidden"], text: stylesheet })];
  const generated = [snapshot({ selector: "div.sg-site", classes: ["sg-site"], text: copy })];
  const report = compareComputedStyles(reference, generated);
  assert.equal(report.matched, 0);
  assert.deepEqual(report.unresolvedReferenceSelectors, ["style.sf-hidden"]);
});

test("near-duplicate copy still pairs through containment or word overlap", () => {
  const reference = [snapshot({ selector: "p.headline", tag: "p", classes: ["headline"], text: "Introducing Jev — intelligence beyond chat, a system one model for machines." })];
  const generated = [snapshot({ selector: "div.sg-hero-lead", classes: ["sg-hero-lead"], text: "Introducing Jev — intelligence beyond chat, a system one model for machines. Extra words here." })];
  const report = compareComputedStyles(reference, generated);
  assert.equal(report.matched, 1);
});

test("unresolved reference nodes are reported instead of silently skipped", () => {
  const reference = [
    snapshot({ selector: "div.sg-card", classes: ["sg-card"] }),
    snapshot({ selector: "canvas.sg-demo", tag: "canvas", classes: ["sg-demo"] }),
  ];
  const generated = [snapshot({ selector: "div.sg-card", classes: ["sg-card"] })];
  const report = compareComputedStyles(reference, generated);
  assert.equal(report.matched, 1);
  assert.equal(report.referenceCount, 2);
  assert.deepEqual(report.unresolvedReferenceSelectors, ["canvas.sg-demo"]);
});
