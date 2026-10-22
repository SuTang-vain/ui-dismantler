import test from "node:test";
import assert from "node:assert/strict";
import { scoreRoundtrip } from "../evaluation/roundtrip.js";
import type { RenderResult, RenderTree } from "../types.js";

function render(dom: RenderTree, texts: string[]): RenderResult {
  return { ok: true, mode: "fixture", dom, texts };
}

const multiRootReference: RenderTree = {
  tag: "body",
  children: [
    { tag: "a", text: "Skip to main content" },
    {
      tag: "div",
      children: [{
        tag: "div",
        classes: ["framer-shell"],
        children: [
          { tag: "div", classes: ["framer-nav"], children: [{ tag: "a", text: "Enterprise" }, { tag: "a", text: "Contact us" }] },
          {
            tag: "div",
            classes: ["framer-main"],
            children: [
              { tag: "section", classes: ["framer-hero"], children: [{ tag: "h1", text: "The first public System One Model" }] },
              { tag: "section", classes: ["framer-stats"], children: [{ tag: "p", text: "193.6x Faster, 444.6x Cheaper." }] }
            ]
          }
        ]
      }]
    },
    { tag: "div" },
    { tag: "div" }
  ]
};

const semanticLibrary: RenderTree = {
  tag: "div",
  children: [{
    tag: "div",
    classes: ["sg-site"],
    children: [
      { tag: "a", classes: ["sg-skip"], text: "Skip to main content" },
      { tag: "header", classes: ["sg-header"], children: [{ tag: "a", classes: ["sg-nav-link"], text: "Enterprise" }, { tag: "a", classes: ["sg-btn"], text: "Contact us" }] },
      {
        tag: "main",
        children: [
          { tag: "section", classes: ["sg-hero"], children: [{ tag: "h1", classes: ["sg-hero-title"], text: "The first public System One Model" }] },
          { tag: "section", classes: ["sg-section"], children: [{ tag: "h2", classes: ["sg-section-title"], text: "193.6x Faster, 444.6x Cheaper." }] }
        ]
      }
    ]
  }]
};

const referenceTexts = ["Skip to main content", "Enterprise", "Contact us", "The first public System One Model", "193.6x Faster, 444.6x Cheaper."];

test("multi-root reference keeps every top-level branch instead of collapsing to one node", () => {
  const score = scoreRoundtrip(render(multiRootReference, referenceTexts), render(semanticLibrary, referenceTexts));
  assert.ok(score.structure.refNodes > 1, `expected multiple reference nodes, received ${score.structure.refNodes}`);
  assert.ok(score.structure.refNodes >= referenceTexts.length);
});

test("semantic mode scores content equivalence where class mimicry scores zero", () => {
  const mimicry = scoreRoundtrip(render(multiRootReference, referenceTexts), render(semanticLibrary, referenceTexts));
  const semantic = scoreRoundtrip(render(multiRootReference, referenceTexts), render(semanticLibrary, referenceTexts), { structureMode: "semantic" });
  assert.ok(mimicry.structure.classMatchRate < 0.2, `mimicry class match expected near zero, received ${mimicry.structure.classMatchRate}`);
  assert.ok(mimicry.scores.structure < 0.2, `mimicry structure expected near zero, received ${mimicry.scores.structure}`);
  assert.equal(mimicry.structure.structureMode, "mimicry");
  assert.equal(semantic.structure.structureMode, "semantic");
  assert.equal(semantic.structure.textAnchors, 4);
  assert.equal(semantic.structure.textAnchorMatches, 4);
  assert.equal(semantic.structure.textAnchorCoverage, 1);
  assert.equal(semantic.scores.structure, 1);
});

test("semantic fallback pairs differently nested sections by their visible text", () => {
  const score = scoreRoundtrip(render(multiRootReference, referenceTexts), render(semanticLibrary, referenceTexts), { structureMode: "semantic" });
  assert.ok(score.structure.semanticMatches >= 2, `expected text-anchored section matches, received ${score.structure.semanticMatches}`);
  assert.ok(score.structure.nodeMatchRate > 0);
});

test("class-aligned trees keep exact mimicry scores in both modes", () => {
  const aligned: RenderTree = {
    tag: "div",
    classes: ["sg-site"],
    children: [
      { tag: "h1", classes: ["sg-title"], text: "Title text" },
      { tag: "p", classes: ["sg-copy"], text: "Copy text" }
    ]
  };
  const mimicry = scoreRoundtrip(render(aligned, ["Title text", "Copy text"]), render(aligned, ["Title text", "Copy text"]));
  const semantic = scoreRoundtrip(render(aligned, ["Title text", "Copy text"]), render(aligned, ["Title text", "Copy text"]), { structureMode: "semantic" });
  assert.equal(mimicry.structure.nodeMatchRate, 1);
  assert.equal(mimicry.structure.classMatchRate, 1);
  assert.equal(mimicry.scores.structure, 1);
  assert.equal(mimicry.structure.semanticMatches, 0);
  assert.equal(semantic.scores.structure, 1);
});

test("anchor coverage reports missing content instead of silently passing", () => {
  const partial: RenderTree = {
    tag: "div",
    classes: ["sg-site"],
    children: [{ tag: "h1", classes: ["sg-title"], text: "The first public System One Model" }]
  };
  const score = scoreRoundtrip(render(multiRootReference, referenceTexts), render(partial, ["The first public System One Model"]), { structureMode: "semantic" });
  assert.equal(score.structure.textAnchors, 4);
  assert.equal(score.structure.textAnchorMatches, 1);
  assert.equal(score.structure.textAnchorCoverage, 0.25);
  assert.equal(score.scores.structure, 0.25);
});

test("semantic mode still reports the mimicry numbers for audit", () => {
  const semantic = scoreRoundtrip(render(multiRootReference, referenceTexts), render(semanticLibrary, referenceTexts), { structureMode: "semantic" });
  assert.equal(semantic.structure.nodeMatchRate, Number((semantic.structure.nodeRecall * (1 - semantic.structure.redundancyPenalty)).toFixed(3)));
  assert.equal(semantic.structure.structureMode, "semantic");
});
