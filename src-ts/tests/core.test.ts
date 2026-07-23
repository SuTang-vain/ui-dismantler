import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analyzeHtml } from "../analysis/analyzer.js";
import { computeCoverage, generateScenarios, groupEquivalentInteractions, loadScenarios } from "../evaluation/scenarios.js";
import { evaluateRoundtrip } from "../evaluation/roundtrip.js";
import { validateLibrary } from "../validation/library.js";
import { planComponents, validateComponentPlans } from "../planning/components.js";
import { DISMANTLING_WORKFLOW, runQualityGate } from "../workflow/pipeline.js";
import type { Interaction } from "../types.js";

const root = new URL("../../", import.meta.url).pathname;
const fixture = `${root}benchmark/original.html`;
const library = `${root}benchmark/lib`;
const execFileAsync = promisify(execFile);

test("TypeScript analyzer emits the compatible manifest contract", () => {
  const manifest = analyzeHtml(fixture, { profile: "benchmark" });
  assert.equal(manifest.schemaVersion, "1.0");
  assert.equal(manifest.meta.profile, "benchmark");
  assert.ok(manifest.theme.tokens.length > 0);
  assert.ok(manifest.structure.views.some((view) => view.type === "graph"));
  assert.ok(manifest.interactions.length > 0);
  assert.ok(Array.isArray(manifest.data.contracts));
});

test("TypeScript validator preserves the 9 quality checks", () => {
  const report = validateLibrary(library);
  assert.equal(report.total, 9);
  assert.equal(report.failed, 0);
  assert.equal(report.ok, true);
});

test("candidate scenarios remain review-gated", () => {
  const manifest = analyzeHtml(fixture);
  const document = generateScenarios(manifest);
  assert.equal(document.schemaVersion, "1.0");
  assert.ok(document.scenarios.length > 0);
  assert.equal(document.scenarios.every((scenario) => scenario.candidate === true), true);
  assert.doesNotThrow(() => loadScenarios(document));
});

test("strict interaction equivalence groups repeated instances without collapsing data-driven navigation or pointer protocols", () => {
  const transition = { target: ".item", kind: "class" as const, operation: "add" as const, name: "active", value: "active", confidence: 0.96, source: "item.classList.add('active')" };
  const repeated = [1, 2, 3].map((index): Interaction => ({
    trigger: `.list > button:nth-child(${index})`, event: "click", action: "semantic-control", source: "semantic-control", fingerprint: `click|.list > button:nth-child(${index})|semantic-control`, mutationTargets: [".item"], stateTransitions: [transition],
  }));
  const dataDriven: Interaction = { trigger: ".nav > button:nth-child(1)", event: "click", action: "openPanel", source: "script-assignment", fingerprint: "click|.nav > button:nth-child(1)|openPanel", dataDependencies: ["panels"], mutationTargets: [".panel"], stateTransitions: [transition] };
  const pointer: Interaction = { trigger: ".list > button:nth-child(4)", event: "pointerdown", action: "drag", source: "event-listener", fingerprint: "pointerdown|.list > button:nth-child(4)|drag", mutationTargets: [".item"], stateTransitions: [transition] };
  const grouped = groupEquivalentInteractions([...repeated, dataDriven, pointer]);
  const equivalence = grouped.find((item) => item.group);
  assert.equal(equivalence?.members.length, 3);
  assert.deepEqual(equivalence?.group?.memberFingerprints, repeated.map((item) => item.fingerprint));
  assert.equal(grouped.find((item) => item.representative === dataDriven)?.group, undefined);
  assert.equal(grouped.find((item) => item.representative === pointer)?.group, undefined);
});

test("reviewed equivalence groups expand verified coverage from one representative", () => {
  const interactions: Interaction[] = [1, 2, 3].map((index) => ({ trigger: `.list > button:nth-child(${index})`, event: "click", action: "semantic-control", source: "semantic-control", fingerprint: `click|.list > button:nth-child(${index})|semantic-control` }));
  const fingerprints = interactions.map((item) => item.fingerprint);
  const document = loadScenarios({
    schemaVersion: "1.0",
    equivalenceGroups: [{ id: "interaction-equivalence-1", signature: "strict", event: "click", triggerShape: ".list > button:nth-child(*)", representativeFingerprint: fingerprints[0], memberFingerprints: fingerprints, reason: "Repeated controls share one reviewed state transition." }],
    scenarios: [{ id: "representative", covers: [fingerprints[0]], steps: [{ action: "click", target: ".list > button:nth-child(1)" }], assertions: [{ target: ".detail", visible: true }] }],
  });
  const coverage = computeCoverage(interactions, document, new Set([fingerprints[0]]));
  assert.equal(coverage.eligibleInteractions, 3);
  assert.equal(coverage.declaredCovered, 3);
  assert.equal(coverage.verifiedCovered, 3);
  assert.equal(coverage.verifiedRate, 1);
});

test("roundtrip score is compatible with the existing benchmark score", async () => {
  const result = await evaluateRoundtrip(fixture, library);
  assert.ok(result.score);
  assert.equal(result.score?.scores.overall, 0.99);
  assert.ok((result.score?.text.textMatchRate ?? 0) >= 0.8);
  assert.ok((result.score?.structure.nodeMatchRate ?? 0) >= 0.7);
});

test("quality gate combines validation, render, structure and text gates when coverage is explicitly disabled", async () => {
  const report = await runQualityGate({ htmlPath: fixture, libDir: library, visual: false, thresholds: { interactionCoverage: null } });
  assert.equal(report.passed, true);
  assert.deepEqual(report.gates.map((gate) => gate.id), ["validation", "render", "overall", "structure", "text"]);
  assert.equal(DISMANTLING_WORKFLOW.length, 7);
});

test("strict quality gate rejects interactions without reviewed scenarios", async () => {
  const report = await runQualityGate({ htmlPath: fixture, libDir: library, visual: false });
  assert.equal(report.passed, false);
  assert.equal(report.gates.find((gate) => gate.id === "scenario-protocol")?.passed, false);
  assert.match(report.gates.find((gate) => gate.id === "scenario-protocol")?.detail ?? "", /未提供 scenarios/);
  assert.equal(report.gates.find((gate) => gate.id === "coverage")?.passed, false);
});

test("candidate-only scenario documents cannot produce a 0/0 pass", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-scenarios-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const scenarioPath = join(dir, "scenarios.json");
  await writeFile(scenarioPath, `${JSON.stringify(generateScenarios(analyzeHtml(fixture)), null, 2)}\n`, "utf8");
  const report = await runQualityGate({ htmlPath: fixture, libDir: library, visual: false, scenarioPath });
  assert.equal(report.passed, false);
  assert.equal(report.gates.find((gate) => gate.id === "scenario-protocol")?.passed, false);
  assert.equal(report.gates.find((gate) => gate.id === "scenarios")?.detail, "0/0 正式场景通过");
  assert.equal(report.gates.find((gate) => gate.id === "scenarios")?.passed, false);
  assert.equal(report.gates.find((gate) => gate.id === "coverage")?.passed, false);
});

test("coverage waivers exclude explicitly unreachable interactions with reasons", () => {
  const interactions: Interaction[] = [
    { trigger: "#visible", event: "click", action: "semantic-control", source: "semantic-control", fingerprint: "click|#visible|semantic-control" },
    { trigger: "#hidden", event: "click", action: "semantic-control", source: "semantic-control", fingerprint: "click|#hidden|semantic-control" },
  ];
  const document = loadScenarios({
    schemaVersion: "1.0",
    coverageWaivers: [{ fingerprint: "click|#hidden|semantic-control", reason: "基线状态不可达" }],
    scenarios: [{ id: "visible", covers: ["click|#visible|semantic-control"], steps: [{ action: "click", target: "#visible" }], assertions: [{ target: "#visible", visible: true }] }],
  });
  const coverage = computeCoverage(interactions, document, new Set(["click|#visible|semantic-control"]));
  assert.equal(coverage.eligibleInteractions, 1);
  assert.equal(coverage.waivedInteractions, 1);
  assert.equal(coverage.verifiedRate, 1);
  assert.equal(coverage.waivers[0].reason, "基线状态不可达");
});


test("component planner turns manifest evidence into reviewable component specs", () => {
  const manifest = analyzeHtml(fixture, { profile: "benchmark" });
  const report = planComponents(manifest, { lineBudget: 1000 });
  assert.equal(report.schemaVersion, "1.0");
  assert.ok(report.components.length > 0);
  assert.equal(report.summary.ready, true);
  assert.ok(report.components.every((component) => component.sourceSelector.length > 0));
  assert.ok(report.components.every((component) => component.sourceSelectors.length > 0));
  assert.ok(report.components.every((component) => component.acceptance.viewports.length === 4));
  assert.ok(report.components.some((component) => component.interactionFingerprints.length > 0));
  assert.equal(report.summary.unownedInteractions, 0);
});

test("component planner blocks dispatch when the complexity budget is exceeded", () => {
  const report = planComponents(analyzeHtml(fixture), { lineBudget: 40 });
  assert.equal(report.summary.ready, false);
  assert.ok(report.issues.some((issue) => issue.code === "complexity-budget"));
});

test("component plan preflight catches missing state and viewport acceptance", () => {
  const report = planComponents(analyzeHtml(fixture), { lineBudget: 1000 });
  const broken = structuredClone(report.components[0]);
  broken.acceptance.states = [];
  broken.acceptance.viewports = [];
  const issues = validateComponentPlans([broken]);
  assert.ok(issues.some((issue) => issue.code === "missing-states"));
  assert.ok(issues.some((issue) => issue.code === "missing-viewports"));
});

test("component planner blocks dispatch when DOM interactions have no component owner", () => {
  const manifest = analyzeHtml(fixture);
  manifest.interactions.push({ trigger: "#outside-all-views", event: "click", action: "semantic-control", source: "semantic-control", fingerprint: "click|#outside-all-views|semantic-control" });
  const report = planComponents(manifest, { lineBudget: 1000 });
  assert.equal(report.summary.ready, false);
  assert.equal(report.summary.unownedInteractions, 1);
  assert.ok(report.issues.some((issue) => issue.code === "unowned-interactions"));
});


test("portfolio analyzer rejects isolated progress SVGs and emits heading-led sections", () => {
  const diegovz = `${root}examples/cases/diegovz-home-0722-ts/planning-fixture.html`;
  const manifest = analyzeHtml(diegovz, { profile: "portfolio" });
  assert.equal(manifest.structure.views.some((view) => view.type === "graph"), false);
  const sections = new Set(manifest.structure.views.filter((view) => view.type === "content-section").map((view) => view.semanticType));
  for (const expected of ["some-projects", "writing", "fragments-of-me", "education", "experience", "readings", "awards-features"]) assert.equal(sections.has(expected), true, `missing ${expected}`);
  const report = planComponents(manifest, { lineBudget: 1000 });
  assert.equal(report.components.some((item) => item.componentName.startsWith("SomeProjects")), true);
  assert.equal(report.components.every((item) => item.interactionFingerprints.length < manifest.interactions.length), true);
  const child = report.components.find((item) => item.parentId);
  assert.ok(child, "specialized widgets should retain their containing section dependency");
});

test("portfolio planner splits repeated items and localized interaction clusters", () => {
  const diegovz = `${root}examples/cases/diegovz-home-0722-ts/planning-fixture.html`;
  const report = planComponents(analyzeHtml(diegovz, { profile: "portfolio" }), { lineBudget: 150 });
  const awardItem = report.components.find((item) => item.id === "awards-features-item");
  const timelineItem = report.components.find((item) => item.id === "timeline-item");
  assert.equal(awardItem?.sourceSelectors.length, 10);
  assert.equal(timelineItem?.sourceSelectors.length, 6);
  assert.equal(awardItem?.parentId, "section-8-awards-features");
  assert.equal(timelineItem?.parentId, "timeline-2");
  assert.equal(timelineItem?.interactionFingerprints.length, 4);
  assert.equal(report.components.find((item) => item.id === "timeline-2")?.interactionFingerprints.length, 0);
  assert.ok(report.components.some((item) => item.id === "fragments-of-me-interactive-shell"));
  assert.ok(report.components.filter((item) => item.id.startsWith("fragments-of-me-bento-slot")).length >= 3);
  assert.equal(new Set(report.components.flatMap((item) => item.interactionFingerprints)).size, analyzeHtml(diegovz, { profile: "portfolio" }).interactions.length);
  assert.equal(report.summary.overBudget, 0);
  assert.equal(report.summary.ready, true);
});

test("interactive encyclopedia analyzer decomposes data-p panels and assigned handlers", () => {
  const ciyu = `${root}examples/cases/ciyu-scrollbar-ts/original.html`;
  const manifest = analyzeHtml(ciyu, { profile: "interactive-encyclopedia" });
  const types = new Set(manifest.structure.views.map((view) => view.type));
  for (const expected of ["app-shell", "content-panel", "story-panel", "relationship-panel", "quiz-panel", "dialog"]) assert.equal(types.has(expected), true, `missing ${expected}`);
  assert.equal(manifest.structure.views.some((view) => view.type === "page-header" && view.selector === "#app"), false);
  const triggers = new Set(manifest.interactions.map((interaction) => interaction.trigger));
  for (const expected of ["#qznext", "#again", ".gnd:not(.center)"]) assert.equal(triggers.has(expected), true, `missing interaction ${expected}`);
  assert.ok(manifest.interactions.some((interaction) => interaction.source === "script-assignment"));

  const report = planComponents(manifest, { lineBudget: 150 });
  for (const expected of ["ApplicationShell", "HomePanel", "StoryPanel", "RelationshipPanel", "QuizPanel", "PopDialog", "RelationshipCanvas", "QuizQuestion"]) assert.equal(report.components.some((component) => component.componentName === expected), true, `missing component ${expected}`);
  assert.equal(report.summary.unownedInteractions, 0);
  assert.equal(report.summary.ready, true);
});


test("AST interaction analysis extracts mutation targets and local data dependencies", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-ast-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "interactive.html");
  await writeFile(html, `<!doctype html><html><body><main id="app"><nav><button class="tab" data-p="details">Details</button></nav><section id="details"><button id="open">Open</button><dialog id="dialog"></dialog><div id="output"></div></section></main><script>const ITEMS=[{label:'one'}];const open=document.querySelector('#open');open.addEventListener('click',()=>{document.getElementById('dialog').classList.add('on');document.querySelector('#output').textContent=ITEMS[0].label});document.querySelectorAll('.tab').forEach(tab=>{tab.onclick=()=>document.getElementById(tab.dataset.p).classList.add('active')})</script></body></html>`);
  const manifest = analyzeHtml(html);
  const open = manifest.interactions.find((interaction) => interaction.trigger === "#open");
  assert.equal(open?.analysis, "ast");
  assert.deepEqual(open?.mutationTargets, ["#dialog", "#output"]);
  assert.deepEqual(open?.dataDependencies, ["ITEMS"]);
  assert.equal(open?.target, "#dialog");
  const tab = manifest.interactions.find((interaction) => interaction.trigger === "button.tab");
  assert.equal(tab?.analysis, "ast");
  assert.deepEqual(tab?.mutationTargets, ["#details"]);
});

test("AST analysis resolves dynamically created interactive class selectors", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-dynamic-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "dynamic.html");
  await writeFile(html, `<!doctype html><html><body><section id="graph"><div id="detail"></div></section><script>function addNode(item,center){const el=document.createElement('div');el.className='node'+(center?' center':'');if(!center)el.onclick=()=>{document.getElementById('detail').textContent=item.name;el.classList.add('on')};document.getElementById('graph').appendChild(el)};addNode({name:'A'},false)</script></body></html>`);
  const interaction = analyzeHtml(html).interactions.find((item) => item.trigger === ".node:not(.center)");
  assert.equal(interaction?.analysis, "ast");
  assert.deepEqual(interaction?.mutationTargets, ["#detail", ".node:not(.center)"]);
});

test("AST analysis emits structured UI state transitions and state-backed scenario assertions", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-states-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "states.html");
  await writeFile(html, `<!doctype html><html><body><button id="open">Open</button><dialog id="modal"></dialog><section id="panel"></section><script>const open=document.querySelector('#open');const modal=document.querySelector('#modal');const panel=document.querySelector('#panel');open.addEventListener('click',()=>{modal.showModal();panel.classList.add('active');panel.setAttribute('aria-expanded','true');panel.hidden=false})</script></body></html>`);
  const manifest = analyzeHtml(html);
  const interaction = manifest.interactions.find((item) => item.trigger === "#open");
  assert.deepEqual(interaction?.stateTransitions?.map((item) => [item.target, item.kind, item.operation, item.name, item.value]), [
    ["#modal", "property", "open", "open", true],
    ["#panel", "class", "add", "active", "active"],
    ["#panel", "attribute", "set", "aria-expanded", "true"],
    ["#panel", "property", "set", "hidden", false],
  ]);
  const scenario = generateScenarios(manifest).scenarios.find((item) => item.covers?.includes(interaction?.fingerprint ?? ""));
  assert.deepEqual(scenario?.assertions, [
    { target: "#modal", attributes: { open: "" } },
    { target: "#panel", classIncludes: ["active"] },
    { target: "#panel", attributes: { "aria-expanded": "true" } },
    { target: "#panel", visible: true },
  ]);
  assert.equal(scenario?.candidate, true);
});

test("AST analysis follows bounded helper chains and object-method handlers", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-calls-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "calls.html");
  await writeFile(html, `<!doctype html><html><body><button id="go">Go</button><section id="panel"></section><script>const byId=id=>document.getElementById(id);function level2(){byId('panel').classList.add('ready')}function level1(){level2()}const actions={open(){level1()}};byId('go').addEventListener('click',actions.open)</script></body></html>`);
  const interaction = analyzeHtml(html).interactions.find((item) => item.trigger === "#go");
  assert.equal(interaction?.analysis, "ast");
  assert.deepEqual(interaction?.mutationTargets, ["#panel"]);
  assert.equal(interaction?.stateTransitions?.some((item) => item.target === "#panel" && item.kind === "class" && item.operation === "add" && item.name === "ready"), true);
});

test("AST analysis resolves delegated closest controls instead of assigning document ownership", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-delegated-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "delegated.html");
  await writeFile(html, `<!doctype html><html><body><nav><button class="tab">One</button><button class="tab">Two</button></nav><section id="panel"></section><script>document.addEventListener('click',event=>{const tab=event.target.closest('.tab');if(!tab)return;document.querySelector('#panel').classList.toggle('active')})</script></body></html>`);
  const interactions = analyzeHtml(html).interactions.filter((item) => item.analysis === "ast");
  assert.equal(interactions.length, 2);
  assert.equal(interactions.every((item) => item.trigger.includes("button:nth-child")), true);
  assert.equal(interactions.every((item) => item.stateTransitions?.some((transition) => transition.target === "#panel" && transition.operation === "toggle")), true);
});

test("delegated receiver uses closest controls and prunes unrelated guarded helper calls", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-delegated-branches-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "delegated.html");
  await writeFile(html, `<!doctype html><html><body><nav class="nav"><button class="nav-btn" data-view="one">One</button><button class="nav-btn" data-view="two">Two</button></nav><section id="view-one"></section><section id="view-two"></section><dialog id="modal"></dialog><script>const modal=document.querySelector('#modal');function closeModal(){modal.close()}function switchView(name){document.getElementById('view-'+name).classList.add('active');if(name==='modal')closeModal()}document.querySelector('.nav').addEventListener('click',event=>{const btn=event.target.closest('.nav-btn');if(btn)switchView(btn.getAttribute('data-view'))})</script></body></html>`);
  const manifest = analyzeHtml(html, { profile: "delegated-branches" });
  const nav = manifest.interactions.filter((item) => item.trigger.startsWith("nav.nav > button"));
  assert.equal(nav.length, 2);
  assert.equal(manifest.interactions.some((item) => item.trigger === "nav.nav"), false);
  assert.equal(nav.every((item) => item.mutationTargets?.includes("#modal") === false), true);
});

test("pointer registrations remain unsupported candidates instead of fake clicks", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-pointer-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "pointer.html");
  await writeFile(html, `<!doctype html><html><body><div id="card"></div><script>const card=document.querySelector('#card');card.addEventListener('pointerup',event=>{if(Math.abs(event.clientX)>35)card.classList.add('moved')})</script></body></html>`);
  const manifest = analyzeHtml(html, { profile: "pointer" });
  const scenario = generateScenarios(manifest).scenarios.find((item) => item.covers?.includes(manifest.interactions[0].fingerprint));
  assert.equal(scenario?.steps.length, 0);
  assert.match(scenario?.label ?? "", /unsupported-pointer/);
  assert.match(scenario?.notes?.[0] ?? "", /禁止降级为 click/);
});

test("data-view applications decompose shell panels graph and modal boundaries", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-app-views-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "application.html");
  await writeFile(html, `<!doctype html><html><body><div id="app-container"><main class="stage"><section class="view" id="view-costars"><div class="graph-wrap" id="costarGraphWrap"><button class="node">Actor</button></div></section><section class="view" id="view-works"><button data-next-work>Next</button></section><section class="view" id="view-identity"><button id="photoCard">Photo</button></section><div class="modal" id="modal"><button class="modal-close">Close</button></div></main><nav class="nav"><button class="nav-btn" data-view="costars">Costars</button><button class="nav-btn" data-view="works">Works</button><button class="nav-btn" data-view="identity">Identity</button></nav></div></body></html>`);
  const manifest = analyzeHtml(html, { profile: "application-views" });
  const ids = new Set(manifest.structure.views.map((view) => view.id));
  for (const id of ["application-shell", "panel-view-costars", "panel-view-works", "panel-view-identity", "dialog-modal"]) assert.equal(ids.has(id), true, `missing ${id}`);
  assert.equal(manifest.structure.views.some((view) => view.componentCandidates?.some((candidate) => candidate.type === "relationship-canvas")), true);
});

test("data-tab controls map to data-view application panels", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-data-tab-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "tabs.html");
  await writeFile(html, `<!doctype html><html><body><div id="app"><div class="tabs"><button class="tab-btn" data-tab="graph">Graph</button><button class="tab-btn" data-tab="works">Works</button></div><main><div class="view" data-view="graph"><div class="graph-wrap" id="graphWrap"><div class="graph-canvas" id="graphCanvas"></div></div></div><div class="view" data-view="works"><div class="works-viewport" id="worksGrid"></div></div></main></div></body></html>`);
  const manifest = analyzeHtml(html, { profile: "data-tab-views" });
  const types = new Set(manifest.structure.views.map((view) => view.type));
  for (const expected of ["app-shell", "relationship-panel", "works-panel"]) assert.equal(types.has(expected), true, `missing ${expected}`);
  assert.equal(manifest.structure.views.some((view) => view.type === "page-header" && view.selector === "#app"), false);
  assert.equal(manifest.structure.views.some((view) => view.componentCandidates?.some((candidate) => candidate.type === "relationship-canvas")), true);
});

test("single graph applications decompose graph event controls and modal", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-compound-graph-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "compound.html");
  await writeFile(html, `<!doctype html><html><body><div id="app-container"><div class="graph-wrap" id="graphWrap"><div class="graph-canvas" id="graphCanvas"><button class="node">Node</button></div></div><div class="event-bar"><div id="eventBtns"><button class="event-btn" data-i="0">Event</button></div></div><div class="modal-overlay" id="modalOverlay"><button class="modal-close">Close</button></div></div></body></html>`);
  const manifest = analyzeHtml(html, { profile: "compound-graph" });
  const types = new Set(manifest.structure.views.map((view) => view.type));
  for (const expected of ["app-shell", "relationship-canvas", "event-controls", "dialog"]) assert.equal(types.has(expected), true, `missing ${expected}`);
  assert.equal(manifest.structure.views.some((view) => view.type === "page-header" && view.selector === "#app-container"), false);
});

test("aria-controlled tab applications ignore entry buttons as panels and split member and works controls", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-star-group-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "star-group.html");
  await writeFile(html, `<!doctype html><html><body><main class="card"><nav class="tab-bar"><button id="tab-members" aria-controls="panel-members">Members</button><button id="tab-works" aria-controls="panel-works">Works</button></nav><div class="entry"><button data-tab="tab-members">Members</button><button data-tab="tab-works">Works</button></div><section class="view" id="panel-members" role="tabpanel"><div class="member-stage"><div class="member-grid"><button class="member" data-member="a">A</button><button class="member" data-member="b">B</button></div><button class="carousel-prev">Prev</button><button class="carousel-next">Next</button></div></section><section class="view works-view" id="panel-works" role="tabpanel"><div class="ws-scroll-wrap"><button class="ws-prev">Prev</button><div id="works-carousel" class="works-carousel"></div><button class="ws-next">Next</button></div><button id="ws-story-cta">Story</button><div id="work-story-panel"><button id="ws-story-close">Close</button></div></section></main><div id="member-modal" class="modal-overlay" role="dialog"><button id="member-modal-close">Close</button></div><script>document.querySelectorAll('.member').forEach(member=>member.addEventListener('click',()=>member.classList.add('selected')));document.querySelector('.ws-next').addEventListener('click',()=>{});document.querySelector('.ws-prev').addEventListener('click',()=>{});document.querySelector('#works-carousel').addEventListener('mouseenter',()=>{});document.querySelector('#works-carousel').addEventListener('mouseleave',()=>{});document.querySelector('#member-modal-close').addEventListener('click',()=>document.querySelector('#member-modal').classList.remove('open'));</script></body></html>`);
  const manifest = analyzeHtml(html, { profile: "star-group" });
  assert.equal(manifest.structure.views.some((view) => view.selector === "#tab-members" || view.selector === "#tab-works"), false);
  const report = planComponents(manifest, { lineBudget: 150 });
  const names = new Set(report.components.map((component) => component.componentName));
  for (const name of ["MemberGrid", "MemberControl", "WorksExplorer", "WorkCardControl", "WorkCarouselControls", "MemberModalDialog"]) assert.equal(names.has(name), true, `missing ${name}`);
  assert.equal(report.summary.unownedInteractions, 0);
  assert.equal(report.summary.overBudget, 0);
  assert.equal(report.summary.ready, true);
});

test("gesture lifecycle registrations count as one implementation behavior", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-gesture-budget-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "gesture.html");
  await writeFile(html, `<!doctype html><html><body><div id="app"><div class="tabs"><button data-tab="cast">Cast</button><button data-tab="profile">Profile</button></div><div class="view" data-view="cast"><div class="cast-grid"><button class="story-btn active">Story</button></div></div><div class="view" data-view="profile"></div></div><script>const story=document.querySelector('.story-btn');story.addEventListener('mousedown',()=>{});story.addEventListener('touchstart',()=>{});story.addEventListener('pointerdown',()=>{});story.addEventListener('pointermove',()=>{});story.addEventListener('pointerup',()=>{});story.addEventListener('pointercancel',()=>{});</script></body></html>`);
  const report = planComponents(analyzeHtml(html, { profile: "gesture-budget" }), { lineBudget: 150 });
  const gesture = report.components.find((component) => component.componentName === "StoryGestureSurface");
  assert.equal(gesture?.interactionFingerprints.length, 6);
  assert.equal(gesture?.complexity.reasons.some((reason) => reason.includes("1 类实现行为")), true);
  assert.equal(gesture?.complexity.overBudget, false);
});

test("SVG geometry analysis emits layout renderer label and animation responsibilities", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-svg-geometry-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "geometry.html");
  await writeFile(html, `<!doctype html><html><body><div id="app-container"><div id="graphWrap" class="graph-wrap"><div id="graphCanvas" class="graph-canvas"><svg class="family"></svg><button class="node">Node</button></div></div><div id="eventBtns"><button class="event-btn" data-i="0">Event</button></div><div id="modalOverlay" class="modal"><button class="modal-close">Close</button></div></div><script>
  const wrap=document.querySelector('#graphWrap');const svg=document.querySelector('svg');const node=document.querySelector('.node');
  wrap.addEventListener('pointerdown',()=>{});node.addEventListener('mousedown',()=>{});
  function permute(items,index){if(index===items.length)return items;for(let cursor=index;cursor<items.length;cursor++){for(let other=cursor+1;other<items.length;other++){Math.hypot(cursor,other)}}return permute(items,index+1)}
  const x=Math.cos(1)*100;const y=Math.sin(1)*100;wrap.getBoundingClientRect();
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');const bg=document.createElementNS('http://www.w3.org/2000/svg','rect');const text=document.createElementNS('http://www.w3.org/2000/svg','text');
  path.setAttribute('d',\`M 0 0 L \${x} \${y}\`);text.getComputedTextLength();const overlapClearance=Math.max(x,y);svg.append(path,bg,text);
  function sync(){path.setAttribute('data-clearance',String(overlapClearance));requestAnimationFrame(sync)}requestAnimationFrame(sync);
  </script></body></html>`);
  const report = planComponents(analyzeHtml(html, { profile: "svg-geometry" }), { lineBudget: 150 });
  const names = new Set(report.components.map((component) => component.componentName));
  for (const name of ["GraphLayout", "EdgeRenderer", "EdgeLabelPlacement", "GraphAnimationLoop"]) assert.equal(names.has(name), true, `missing ${name}`);
  assert.equal(report.summary.ready, true);
  assert.equal(report.components.every((component) => !component.complexity.overBudget), true);
  const geometryComponents = report.components.filter((component) => ["GraphLayout", "EdgeRenderer", "EdgeLabelPlacement", "GraphAnimationLoop"].includes(component.componentName));
  assert.equal(geometryComponents.every((component) => component.interactionFingerprints.length === 0), true);
  assert.equal(report.components.find((component) => component.componentName === "RelationshipCanvas")?.interactionFingerprints.some((item) => item.startsWith("pointerdown|#graphWrap")), true);
  const animation = report.components.find((component) => component.componentName === "GraphAnimationLoop");
  assert.equal(animation?.complexity.estimatedLines, 40);
  assert.equal(animation?.complexity.reasons.some((reason) => reason.includes("animation-loop 调用簇")), true);
});

test("multi-graph pages scope geometry responsibilities to referenced regions", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-svg-regions-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "regions.html");
  await writeFile(html, `<!doctype html><html><body><div id="app"><nav><button data-tab="a">A</button><button data-tab="b">B</button></nav><main><section class="view" data-view="a"><div id="graphA" class="graph-wrap"><div id="graphACanvas" class="graph-canvas"><svg></svg></div></div></section><section class="view" data-view="b"><div id="graphB" class="graph-wrap"><div id="graphBCanvas" class="graph-canvas"><svg></svg></div></div></section></main></div><script>const graphA=document.querySelector('#graphA');const svgA=graphA.querySelector('svg');function layoutA(items,index){for(let a=0;a<items.length;a++)for(let b=0;b<items.length;b++)Math.hypot(a,b);Math.cos(index);Math.sin(index);return index<items.length?layoutA(items,index+1):items}const pathA=document.createElementNS('http://www.w3.org/2000/svg','path');const textA=document.createElementNS('http://www.w3.org/2000/svg','text');const bgA=document.createElementNS('http://www.w3.org/2000/svg','rect');pathA.setAttribute('d','M 0 0 L 1 1');textA.getComputedTextLength();svgA.append(pathA,textA,bgA);function syncA(){requestAnimationFrame(syncA)}requestAnimationFrame(syncA);</script></body></html>`);
  const report = planComponents(analyzeHtml(html, { profile: "multi-graph-regions" }), { lineBudget: 150 });
  assert.equal(report.components.filter((component) => component.componentName.startsWith("EdgeRenderer")).length, 1);
  assert.equal(report.components.find((component) => component.componentName === "EdgeRenderer")?.sourceSelector.startsWith("#graphACanvas"), true);
  assert.equal(report.components.some((component) => component.sourceSelector.startsWith("#graphBCanvas") && component.componentName.startsWith("EdgeRenderer")), false);
});

test("external graph scripts participate in geometry planning", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-svg-external-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "geometry.html");
  await writeFile(join(dir, "graph.js"), `const svg=document.querySelector('svg');function arrange(items,index){for(let a=0;a<items.length;a++)for(let b=0;b<items.length;b++)Math.hypot(a,b);return index<items.length?arrange(items,index+1):items}Math.cos(1);Math.sin(1);const path=document.createElementNS('http://www.w3.org/2000/svg','path');const text=document.createElementNS('http://www.w3.org/2000/svg','text');const bg=document.createElementNS('http://www.w3.org/2000/svg','rect');path.setAttribute('d','M 0 0 L 1 1');text.getComputedTextLength();function sync(){requestAnimationFrame(sync)}requestAnimationFrame(sync);`);
  await writeFile(html, `<!doctype html><html><body><div id="app"><div id="graphWrap" class="graph-wrap"><div id="graphCanvas" class="graph-canvas"><svg></svg></div></div><div id="eventBtns"><button data-i="0">Event</button></div><dialog id="modal"></dialog></div><script src="graph.js"></script></body></html>`);
  const report = planComponents(analyzeHtml(html, { profile: "external-svg-geometry" }), { lineBudget: 150 });
  assert.equal(report.components.some((component) => component.componentName === "EdgeRenderer"), true);
  assert.equal(report.components.some((component) => component.componentName === "GraphAnimationLoop"), true);
});

test("malformed scripts retain bounded regex interaction fallback", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-malformed-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "malformed.html");
  await writeFile(html, `<!doctype html><html><body><button id="broken">Broken</button><script>document.getElementById('broken').addEventListener('click',()=>{</script></body></html>`);
  const interaction = analyzeHtml(html).interactions.find((item) => item.event === "click" && item.trigger === "event-listener");
  assert.equal(interaction?.analysis, "regex");
  assert.equal(interaction?.confidence, 0.25);
});

test("analyzer budgets oversized styles and skips non-executable archive scripts", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-budget-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "archive.html");
  await writeFile(html, `<!doctype html><html><head><style>:root{--ink:#111}${".card{color:#111}".repeat(500)}</style><script type="application/ld+json">{"broken":</script></head><body><main><h1>Archive</h1><p>Full DOM stays available.</p></main></body></html>`);
  const manifest = analyzeHtml(html, { maxCssBytes: 400, maxStyleBytes: 400, maxScriptBytes: 100 });
  assert.match(manifest.warnings.join(" "), /CSS 分析预算生效/);
  assert.match(manifest.warnings.join(" "), /非可执行 script/);
  assert.equal(manifest.structure.views.some((view) => view.details.text === "Archive"), true);
});

test("self-contained transpiler preserves application JSON and rewrites ID references and object keys", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-idrefs-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "idrefs.html");
  const out = join(dir, "lib");
  await writeFile(html, `<!doctype html><html><head><style>:root{--primary:#6487fa;--ink:#111;--muted:#777;--line:#ddd;--paper:#fff}.panel{display:block}</style></head><body><button id="tab-one" data-tab="tab-one" aria-controls="panel-one">One</button><section id="panel-one" class="panel" aria-labelledby="tab-one"></section><script type="application/json" id="works-data">[{"title":"One"}]</script><script>var memberList=[{name:'One'}];var panels={'tab-one':document.getElementById('panel-one')};document.querySelector('[data-tab]').onclick=function(){panels[this.dataset.tab].classList.add('active')};var data=JSON.parse(document.getElementById('works-data').textContent);</script></body></html>`);
  const metricsPath = join(dir, "transpile-metrics.json");
  const { stdout } = await execFileAsync(process.execPath, [`${root}scripts/transpile_self_contained_case.mjs`, html, out, "IdRefFixture", "idrefs", "--metrics-out", metricsPath]);
  const summary = JSON.parse(stdout);
  const metrics = JSON.parse(await readFile(metricsPath, "utf8"));
  assert.ok(summary.telemetry.timing.totalMs > 0);
  assert.equal(metrics.telemetry.workload.ids >= 3, true);
  assert.equal(metrics.telemetry.workload.executableScripts, 1);
  const js = await readFile(join(out, "src", "idrefs.js"), "utf8");
  assert.match(js, /data-tab="sg-tab-one"/);
  assert.match(js, /aria-controls="sg-panel-one"/);
  assert.match(js, /aria-labelledby="sg-tab-one"/);
  assert.match(js, /"sg-tab-one"\s*:\s*document\.getElementById\("sg-panel-one"\)/);
  assert.match(js, /var memberList = \(options && options\.memberList\) \|\| \[/);
  assert.match(js, /<\\\/script>/);
  assert.match(js, /id="sg-works-data"/);
});

test("self-contained transpiler ignores JSON-LD and supports pages without asset directories", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-transpile-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "static.html");
  const out = join(dir, "lib");
  await writeFile(html, `<!doctype html><html><head><style>:root{--ink:#111}.card{color:var(--ink)}</style><script type="application/ld+json">{"@context":"https://schema.org"}</script></head><body><main class="card">Static</main></body></html>`);
  const { stdout } = await execFileAsync(process.execPath, [`${root}scripts/transpile_self_contained_case.mjs`, html, out, "StaticFixture", "static"]);
  const summary = JSON.parse(stdout);
  assert.equal(summary.skippedScripts, 1);
  assert.equal(summary.executableScripts, 0);
  assert.equal(summary.assetsCopied, false);
  assert.equal(summary.scriptParseWarning, null);
  assert.match(await readFile(join(out, "src", "static.js"), "utf8"), /StaticFixture/);
});

test("self-contained transpiler preserves id-linked data attributes and rewrites assets", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-linked-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "linked.html");
  const out = join(dir, "lib");
  await writeFile(html, `<!doctype html><html><head><style>:root{--primary:#6487fa}.panel{display:none}.panel.on{display:block}@media(max-width:320px){.panel{font-size:12px}}</style></head><body><div id="app"><span data-p="home">Home</span><section class="panel on" id="home"><img src="images/cover.webp" alt="cover"></section></div><script>var QS=[{t:'${"x".repeat(1300)}'}];document.querySelectorAll('[data-p]').forEach(function(n){n.onclick=function(){document.getElementById(n.dataset.p).classList.add('on')}})</script></body></html>`);
  const { stdout } = await execFileAsync(process.execPath, [`${root}scripts/transpile_self_contained_case.mjs`, html, out, "LinkedFixture", "linked"]);
  assert.equal(JSON.parse(stdout).scriptParseWarning, null);
  const js = await readFile(join(out, "src", "linked.js"), "utf8");
  assert.match(js, /data-p="sg-home"/);
  assert.match(js, /src="\.\.\/assets\/cover\.webp"/);
  assert.match(js, /options\.questions/);
  assert.match(js, /role="tab"/);
  assert.match(js, /role="tabpanel"/);
});
