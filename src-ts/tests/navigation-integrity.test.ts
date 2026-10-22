import test from "node:test";
import assert from "node:assert/strict";
import { compareNavigationIntegrity } from "../evaluation/browser.js";
import type { NavigationReferenceSnapshot } from "../types.js";

function link(partial: Partial<NavigationReferenceSnapshot> & Pick<NavigationReferenceSnapshot, "text" | "normalizedTarget">): NavigationReferenceSnapshot {
  return {
    selector: "a",
    href: partial.normalizedTarget,
    kind: "external-url",
    download: null,
    fragmentTargetExists: null,
    ...partial,
  };
}

test("reordered links still match by identity instead of cascading index mismatches", () => {
  const reference = [
    link({ text: "Docs", normalizedTarget: "https://example.com/docs" }),
    link({ text: "Blog", normalizedTarget: "https://example.com/blog" }),
    link({ text: "Contact", normalizedTarget: "https://example.com/contact" }),
  ];
  const generated = [reference[2], reference[0], reference[1]].map((entry) => ({ ...entry }));
  const report = compareNavigationIntegrity(reference, generated);
  assert.equal(report.matched, 3);
  assert.equal(report.rate, 1);
  assert.equal(report.passed, true);
  assert.deepEqual(report.issues, []);
});

test("an inserted link reports one extra entry without disturbing the rest", () => {
  const reference = [
    link({ text: "Docs", normalizedTarget: "https://example.com/docs" }),
    link({ text: "Blog", normalizedTarget: "https://example.com/blog" }),
  ];
  const generated = [
    link({ text: "Home", normalizedTarget: "https://example.com/" }),
    { ...reference[0] },
    { ...reference[1] },
  ];
  const report = compareNavigationIntegrity(reference, generated);
  assert.equal(report.matched, 2);
  assert.equal(report.total, 3);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].reason, "count-mismatch");
  assert.equal(report.issues[0].generated?.normalizedTarget, "https://example.com/");
});

test("a removed link reports one missing entry without disturbing the rest", () => {
  const reference = [
    link({ text: "Docs", normalizedTarget: "https://example.com/docs" }),
    link({ text: "Blog", normalizedTarget: "https://example.com/blog" }),
    link({ text: "Contact", normalizedTarget: "https://example.com/contact" }),
  ];
  const generated = [{ ...reference[0] }, { ...reference[2] }];
  const report = compareNavigationIntegrity(reference, generated);
  assert.equal(report.matched, 2);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].reason, "count-mismatch");
  assert.equal(report.issues[0].reference?.normalizedTarget, "https://example.com/blog");
});

test("a renamed target on the same visible link is one target-mismatch, not two count issues", () => {
  const reference = [
    link({ text: "Skip to main content", normalizedTarget: "#main-content", kind: "fragment", fragmentTargetExists: true }),
    link({ text: "Docs", normalizedTarget: "https://example.com/docs" }),
  ];
  const generated = [
    { ...reference[1] },
    link({ text: "Skip to main content", normalizedTarget: "#sg-main", kind: "fragment", fragmentTargetExists: true }),
  ];
  const report = compareNavigationIntegrity(reference, generated);
  assert.equal(report.matched, 1);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].reason, "target-mismatch");
  assert.equal(report.issues[0].reference?.normalizedTarget, "#main-content");
  assert.equal(report.issues[0].generated?.normalizedTarget, "#sg-main");
});

test("same target with a different kind pairs and reports kind-mismatch", () => {
  const reference = [link({ text: "Assets", normalizedTarget: "https://cdn.example.com/a.webm", kind: "external-url" })];
  const generated = [link({ text: "Assets", normalizedTarget: "https://cdn.example.com/a.webm", kind: "download", download: "" })];
  const report = compareNavigationIntegrity(reference, generated);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].reason, "kind-mismatch");
});

test("fragment target existence is still enforced on matched pairs", () => {
  const reference = [link({ text: "Top", normalizedTarget: "#top", kind: "fragment", fragmentTargetExists: true })];
  const generated = [link({ text: "Top", normalizedTarget: "#top", kind: "fragment", fragmentTargetExists: false })];
  const report = compareNavigationIntegrity(reference, generated);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].reason, "missing-fragment-target");
});

test("duplicate targets pair by text first so the missing entry is the truly absent one", () => {
  const reference = [
    link({ text: "(proof)", normalizedTarget: "https://example.com/blog/post" }),
    link({ text: "Company News Introducing the post", normalizedTarget: "https://example.com/blog/post" }),
  ];
  const generated = [link({ text: "Company News Introducing the post", normalizedTarget: "https://example.com/blog/post" })];
  const report = compareNavigationIntegrity(reference, generated);
  assert.equal(report.matched, 1);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].reason, "count-mismatch");
  assert.equal(report.issues[0].reference?.text, "(proof)");
});

test("transitions remain an ordered stream comparison", () => {
  const reference = [link({ text: "A", normalizedTarget: "https://example.com/a" })];
  const generated = [{ ...reference[0] }];
  const referenceTransitions = [{ method: "pushState" as const, target: "/a", state: "{}" }, { method: "pushState" as const, target: "/b", state: "{}" }];
  const generatedTransitions = [{ method: "pushState" as const, target: "/b", state: "{}" }, { method: "pushState" as const, target: "/a", state: "{}" }];
  const report = compareNavigationIntegrity(reference, generated, referenceTransitions, generatedTransitions);
  assert.equal(report.issues.filter((issue) => issue.reason === "transition-target-mismatch").length, 2);
  assert.equal(report.matched, 1);
});
