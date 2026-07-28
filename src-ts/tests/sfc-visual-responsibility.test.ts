import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analyzeEChartsResponsibilities } from "../planning/echarts-responsibility.js";
import { analyzeSfcVisualResponsibilities } from "../planning/sfc-visual-responsibility.js";
import { analyzeRouterToSfcResponsibilities } from "../planning/router-sfc-responsibility.js";
import { generateGeneratedTargetAutoV2 } from "../planning/generated-target-auto-v2.js";

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "ui-dismantler-sfc-"));
  mkdirSync(join(root, "views", "dashboard", "components"), { recursive: true });
  writeFileSync(join(root, "views", "dashboard", "index.vue"), `<template><main class="dashboard-editor-container"><panel-group @change="setData"/><line-chart :chart-data="lineChartData"/></main></template>
<script>import PanelGroup from './components/PanelGroup'; import LineChart from './components/LineChart'; const lineChartData={newVisitis:{expectedData:[1,2,3],actualData:[3,2,1]}}; export default { name:'DashboardAdmin', components:{PanelGroup,LineChart}, data(){return {lineChartData}}, methods:{setData(){}} }</script>
<style scoped lang="scss">.dashboard-editor-container{padding:32px}@media (max-width:1024px){.dashboard-editor-container{padding:16px}}</style>`);
  writeFileSync(join(root, "views", "dashboard", "components", "PanelGroup.vue"), `<template><button class="card-panel" @click="$emit('change','messages')">Messages</button></template><script>export default { name:'PanelGroup' }</script><style scoped>.card-panel{height:108px}</style>`);
  writeFileSync(join(root, "views", "dashboard", "components", "LineChart.vue"), `<template><div class="chart"/></template><script>import echarts from 'echarts'; require('echarts/theme/macarons'); import resize from './resize'; const animationDuration=3000; export default { mixins:[resize], props:{height:{type:String,default:'350px'},chartData:Object}, watch:{chartData:{handler(v){this.setOptions(v)}}}, mounted(){this.chart=echarts.init(this.$el,'macarons');this.setOptions(this.chartData)}, beforeDestroy(){this.chart.dispose()}, methods:{setOptions({expectedData,actualData}){this.chart.setOption({xAxis:{},yAxis:{},legend:{},series:[{type:'line',data:expectedData},{type:'line',data:actualData,animationDuration}]})}} }</script><style scoped>.chart{height:350px}</style>`);
  return root;
}

test("ECharts responsibility extractor captures type theme data and lifecycle ownership", () => {
  const root = fixture();
  try {
    const graph = analyzeEChartsResponsibilities(root);
    assert.equal(graph.metrics.chartFiles, 1);
    assert.equal(graph.components.length, 1);
    const chart = graph.components[0];
    assert.equal(chart.componentName, "LineChart");
    assert.deepEqual(chart.themes, ["macarons"]);
    assert.deepEqual(chart.chartTypes, ["line"]);
    assert.equal(chart.capabilities.initializesChart, true);
    assert.equal(chart.capabilities.updatesOptions, true);
    assert.equal(chart.optionSlices.length, 1);
    assert.equal(chart.optionSlices[0].seriesCount, 2);
    assert.equal(chart.optionSlices[0].literalDataArrays, 0);
    assert.equal(chart.optionSlices[0].containerHeight, "350px");
    assert.deepEqual(chart.optionSlices[0].references, ["actualData", "animationDuration", "expectedData"]);
    assert.equal(chart.staticBindings.animationDuration, 3000);
    assert.equal(chart.optionSlices[0].option !== undefined, true);
    assert.equal(chart.capabilities.watchesData, true);
    assert.equal(chart.capabilities.resizesChart, true);
    assert.equal(chart.capabilities.disposesChart, true);
    assert.equal(chart.dataSources.includes("expectedData"), true);
    assert.equal(graph.blockers.length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("SFC visual responsibility graph preserves component style interaction and chart boundaries", () => {
  const root = fixture();
  try {
    const graph = analyzeSfcVisualResponsibilities(root);
    assert.equal(graph.metrics.components, 3);
    assert.equal(graph.metrics.chartComponents, 1);
    assert.equal(graph.metrics.interactiveComponents >= 2, true);
    const dashboard = graph.components.find((item) => item.componentName === "DashboardAdmin");
    assert.ok(dashboard);
    assert.deepEqual(dashboard.childComponents, ["LineChart", "PanelGroup"]);
    assert.deepEqual(dashboard.bindings.events, ["change"]);
    assert.equal(graph.metrics.staticDataBindings > 0, true);
    assert.deepEqual(dashboard.dataCardinality.cardinalities.find((item) => item.path === "lineChartData.newVisitis.expectedData"), { path: "lineChartData.newVisitis.expectedData", count: 3, source: "module-static-binding" });
    assert.equal(dashboard.styles[0].scoped, true);
    assert.deepEqual(dashboard.styles[0].mediaQueries, ["(max-width:1024px)"]);
    const line = graph.components.find((item) => item.componentName === "LineChart");
    assert.equal(line?.chartResponsibilityIds.length, 1);
    assert.equal(line?.runtimeDependencies.includes("echarts"), true);
    assert.equal(graph.reviewRequired, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { generateVisualTargetPlan } from "../planning/visual-target-plan.js";
import type { SpaRouteShellPlan } from "../planning/spa-route-shell.js";

test("visual target planner derives reviewed page/component/chart boundaries without coupling implementation selectors", () => {
  const root = fixture();
  try {
    const graph = analyzeSfcVisualResponsibilities(root);
    const routePlan: SpaRouteShellPlan = {
      schemaVersion: "1.0", kind: "spa-route-shell-plan", reviewRequired: true, generatedCode: false,
      source: { mode: "reference-generated", configScenarios: 1, reportIncluded: true, reportPassed: true },
      routes: [{
        route: "/#/dashboard", pattern: "/#/dashboard", scenarios: ["dashboard"], entry: true, final: true,
        assertions: [{ scenarioId: "dashboard", visibleSelector: ".dashboard-editor-container", visibleText: "Dashboard" }],
        visualStates: [{ scenarioId: "dashboard", anchor: ".dashboard-editor-container", region: ".dashboard-editor-container", styleTargets: [".dashboard-editor-container"], viewports: ["desktop", "mobile"] }],
      }],
      transitions: [], selectorMappings: [], fixtureDependencies: [],
      capabilities: { historyBack: false, historyForward: false, reload: false, dynamicInputRoutes: false, roleSpecificSelectors: false, reviewedVisualStates: 1 },
      measurementTemplate: { modelCalls: null, generationMs: null, manualEdits: null, manualEditedLines: null, repairIterations: null, qualityRuns: null },
      reviewReasons: [],
    };
    const plan = generateVisualTargetPlan(graph, routePlan);
    assert.equal(plan.metrics.boundaries, 1);
    assert.equal(plan.metrics.unresolvedRoutes, 0);
    assert.equal(plan.metrics.chartOwners, 1);
    assert.equal(plan.metrics.canvasProfileProposals, 1);
    assert.equal(plan.boundaries[0].resourceProfileProposal.profile, "canvas");
    assert.equal(plan.boundaries[0].resourceProfileProposal.confidence, 0.96);
    assert.equal(plan.boundaries[0].resourceProfileProposal.reviewRequired, true);
    assert.equal(plan.boundaries[0].resourceProfileProposal.evidence.some((item) => item.kind === "echarts-owner"), true);
    assert.equal(plan.owners.find((owner) => owner.id === plan.boundaries[0].rootOwnerId)?.componentName, "DashboardAdmin");
    assert.equal(plan.boundaries[0].acceptance.styleTargets.includes(".dashboard-editor-container"), true);
    assert.equal(plan.owners.some((owner) => owner.componentName === "PanelGroup"), true);
    assert.equal(plan.owners.some((owner) => owner.kind === "chart" && owner.chart?.chartTypes.includes("line")), true);
    assert.equal(plan.owners.every((owner) => owner.implementationSelector.startsWith("[data-visual-owner=")), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { generateVisualTargetArtifact } from "../planning/visual-target-generator.js";

test("visual target planner prefers router-to-SFC ownership over route acceptance heuristics", () => {
  const root = fixture();
  try {
    mkdirSync(join(root, "router"), { recursive: true });
    writeFileSync(join(root, "router", "index.js"), `import DashboardAdmin from '../views/dashboard/index.vue'
const routes=[{path:'/dashboard',name:'Dashboard',component:DashboardAdmin}]
export default routes`);
    const graph = analyzeSfcVisualResponsibilities(root);
    const routerGraph = analyzeRouterToSfcResponsibilities(root);
    const routePlan: SpaRouteShellPlan = {
      schemaVersion: "1.0", kind: "spa-route-shell-plan", reviewRequired: true, generatedCode: false,
      source: { mode: "reference-generated", configScenarios: 1, reportIncluded: true, reportPassed: true },
      routes: [{ route: "/#/dashboard", pattern: "/#/dashboard", scenarios: ["dashboard"], entry: true, final: true,
        assertions: [{ scenarioId: "dashboard", visibleSelector: ".not-source-owned", visibleText: "Dashboard" }],
        visualStates: [{ scenarioId: "dashboard", anchor: ".not-source-owned", region: ".not-source-owned", styleTargets: [".not-source-owned"], viewports: ["desktop"] }] }],
      transitions: [], selectorMappings: [], fixtureDependencies: [],
      capabilities: { historyBack: false, historyForward: false, reload: false, dynamicInputRoutes: false, roleSpecificSelectors: false, reviewedVisualStates: 1 },
      measurementTemplate: { modelCalls: null, generationMs: null, manualEdits: null, manualEditedLines: null, repairIterations: null, qualityRuns: null }, reviewReasons: [],
    };
    const plan = generateVisualTargetPlan(graph, routePlan, routerGraph);
    assert.equal(plan.metrics.unresolvedRoutes, 0);
    assert.equal(plan.owners.find((owner) => owner.id === plan.boundaries[0].rootOwnerId)?.sourceFile, "views/dashboard/index.vue");
    assert.equal(plan.source.routerSfcGraphKind, "router-to-sfc-responsibility-graph");
    assert.equal(plan.reviewReasons.some((reason) => reason.includes("router-to-import-to-SFC")), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("generated-target-auto-v2 consumes router and responsibility evidence without claiming Gold+", () => {
  const root = fixture();
  try {
    mkdirSync(join(root, "router"), { recursive: true });
    writeFileSync(join(root, "router", "index.js"), `import DashboardAdmin from '../views/dashboard/index.vue'
const routes=[{path:'/dashboard',name:'Dashboard',component:DashboardAdmin}]
export default routes`);
    const graph = analyzeSfcVisualResponsibilities(root);
    const routerSfc = analyzeRouterToSfcResponsibilities(root);
    const routePlan: SpaRouteShellPlan = {
      schemaVersion: "1.0", kind: "spa-route-shell-plan", reviewRequired: true, generatedCode: false,
      source: { mode: "reference-generated", configScenarios: 1, reportIncluded: true, reportPassed: true },
      routes: [{ route: "/#/dashboard", pattern: "/#/dashboard", scenarios: ["dashboard"], entry: true, final: true, assertions: [], visualStates: [{ scenarioId: "dashboard", styleTargets: [], viewports: ["desktop"] }] }],
      transitions: [], selectorMappings: [], fixtureDependencies: [], capabilities: { historyBack: false, historyForward: false, reload: false, dynamicInputRoutes: false, roleSpecificSelectors: false, reviewedVisualStates: 1 },
      measurementTemplate: { modelCalls: null, generationMs: null, manualEdits: null, manualEditedLines: null, repairIterations: null, qualityRuns: null }, reviewReasons: [],
    };
    const plan = generateVisualTargetPlan(graph, routePlan, routerSfc);
    const manualReport = { passed: true, navigationIntegrity: { rate: 1 }, visualMatrix: { worstComputedStyle: 1, worstPixelDiff: 0.01, stabilityFailures: 0 }, runtimeErrors: 0, requiredNetworkFailures: 0, telemetry: { activeHandlesAfterClose: { totalBlockingHandles: 0 } } };
    const artifact = generateGeneratedTargetAutoV2({ routePlan, visualPlan: plan, routerSfc, sfcVisual: graph, spaAuth: { metrics: { chains: 1 } }, transportProxy: { metrics: { routes: 1 } } }, { manualQualityReport: manualReport, manualEditedLines: 17, repairIterations: 2, generationMs: 3.5 });
    assert.equal(artifact.kind, "generated-target-auto-v2");
    assert.equal(artifact.fullGeneratedApplication, false);
    assert.equal(artifact.metrics.routeEntries, 1);
    assert.equal(artifact.metrics.visualOwners > 0, true);
    assert.equal(artifact.metrics.generatedVisualNodes > artifact.metrics.visualOwners, true);
    assert.equal(artifact.metrics.generatedInteractionBindings > 0, true);
    assert.equal(artifact.source.routerSfcGraphKind, "router-to-sfc-responsibility-graph");
    assert.equal(artifact.source.sfcVisualMetrics?.components, graph.metrics.components);
    assert.equal(artifact.costComparison.manualReviewedTarget.manualEditedLines, 17);
    assert.equal(artifact.costComparison.autoV2FirstPass.manualEditedLines, 0);
    assert.equal(artifact.qualityComparison.comparable, false);
    assert.equal(artifact.qualityComparison.routeComparable, false);
    assert.equal(artifact.files.find((file) => file.path === "public/app.js")?.content.includes("data-visual-owner"), true);
    assert.equal(artifact.files.find((file) => file.path === "public/app.js")?.content.includes("data-primitive-node"), true);
    const server = artifact.files.find((file) => file.path === "server.mjs")?.content ?? "";
    assert.equal(server.indexOf("const body=await readFile(path)") >= 0, true);
    assert.equal(server.indexOf("const body=await readFile(path)") < server.indexOf("res.writeHead(200"), true);
    assert.equal(artifact.limitations.some((item) => item.includes("does not claim visual equivalence")), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("visual target generator emits a runnable review-only target without importing the reviewed implementation", () => {
  const root = fixture();
  try {
    const graph = analyzeSfcVisualResponsibilities(root);
    const routePlan: SpaRouteShellPlan = {
      schemaVersion: "1.0", kind: "spa-route-shell-plan", reviewRequired: true, generatedCode: false,
      source: { mode: "reference-generated", configScenarios: 1, reportIncluded: true, reportPassed: true },
      routes: [{ route: "/#/dashboard", pattern: "/#/dashboard", scenarios: ["dashboard"], entry: true, final: true, assertions: [{ scenarioId: "dashboard", visibleSelector: ".dashboard-editor-container" }], visualStates: [{ scenarioId: "dashboard", region: ".dashboard-editor-container", styleTargets: [".dashboard-editor-container"] }] }],
      transitions: [], selectorMappings: [], fixtureDependencies: [], capabilities: { historyBack: false, historyForward: false, reload: false, dynamicInputRoutes: false, roleSpecificSelectors: false, reviewedVisualStates: 1 },
      measurementTemplate: { modelCalls: null, generationMs: null, manualEdits: null, manualEditedLines: null, repairIterations: null, qualityRuns: null }, reviewReasons: [],
    };
    const plan = generateVisualTargetPlan(graph, routePlan);
    const artifact = generateVisualTargetArtifact(plan, routePlan);
    assert.equal(artifact.fullGeneratedApplication, true);
    assert.equal(artifact.generatedVisualDom, true);
    assert.equal(artifact.metrics.modelCalls, 0);
    assert.equal(artifact.metrics.manualEditedLines, 0);
    assert.equal(artifact.files.some((item) => item.path === "public/app.js" && item.content.includes("data-visual-owner")), true);
    assert.equal(artifact.files.some((item) => item.content.includes("generated-target/public/app.js")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("SFC template structure preserves Element UI primitives order inline styles and responsive spans", () => {
  const root = fixture();
  try {
    const graph = analyzeSfcVisualResponsibilities(root);
    const dashboard = graph.components.find((item) => item.componentName === "DashboardAdmin");
    assert.ok(dashboard);
    assert.deepEqual(dashboard.templateStructure.componentOrder.slice(0, 2), ["PanelGroup", "LineChart"]);
    const chartNode = dashboard.templateStructure.nodes.find((node) => node.componentName === "LineChart");
    assert.ok(chartNode);
    assert.equal(graph.metrics.templateNodes > 0, true);
    const panel = graph.components.find((item) => item.componentName === "PanelGroup");
    assert.equal(panel?.templateStructure.nodes.some((node) => node.attributes["@click"] !== undefined), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { analyzeSfcTemplateStructure } from "../planning/sfc-template-structure.js";
import { compilePrimitiveDom, materializePrimitiveCss } from "../planning/primitive-dom-compiler.js";

test("template structure preserves ordered literal text around primitive children", () => {
  const structure = analyzeSfcTemplateStructure(`<template><div><span>Only <el-tag type="info">admin</el-tag> can see this</span></div></template>`);
  const span = structure.nodes.find((node) => node.tag === "span");
  assert.ok(span);
  assert.deepEqual(span.content.map((token) => token.kind), ["text", "node", "text"]);
  assert.equal(span.content[0].kind === "text" && span.content[0].value.trim(), "Only");
  assert.equal(span.content[2].kind === "text" && span.content[2].value.trim(), "can see this");
});

test("primitive DOM compiler maps Element UI structure inline styles interactions and responsive spans", () => {
  const structure = analyzeSfcTemplateStructure(`<template><el-form class="login-form"><el-form-item><el-input v-model="form.name" placeholder="Name" /></el-form-item><el-button type="primary" style="width:100%" @click.native.prevent="submit">Login</el-button><el-row><el-col :xs="24" :lg="8"><el-tag type="info">A</el-tag></el-col></el-row></el-form></template>`);
  const compilation = compilePrimitiveDom(structure);
  assert.equal(compilation.metrics.compiledNodes, structure.nodes.length);
  assert.equal(compilation.nodes.find((node) => node.primitiveKind === "form")?.renderTag, "form");
  assert.equal(compilation.nodes.find((node) => node.primitiveKind === "input")?.renderStrategy, "input");
  assert.equal(compilation.nodes.find((node) => node.primitiveKind === "button")?.classes.includes("el-button--primary"), true);
  assert.deepEqual(compilation.nodes.find((node) => node.primitiveKind === "layout-column")?.responsiveSpans, { xs: 24, lg: 8 });
  assert.equal(compilation.interactions.some((binding) => binding.event === "click" && binding.expression === "submit" && binding.modifiers.includes("prevent")), true);
  assert.equal(compilation.styleRules.some((rule) => rule.provenance === "source-inline-style" && rule.declarations.width === "100%"), true);
  assert.match(materializePrimitiveCss(compilation), /@media \(min-width:1200px\)/);
});

test("SFC visual analysis embeds local SvgIcon geometry without filename-specific generator rules", () => {
  const root = mkdtempSync(join(tmpdir(), "ui-dismantler-svg-"));
  try {
    mkdirSync(join(root, "src", "icons", "svg"), { recursive: true });
    mkdirSync(join(root, "src", "views"), { recursive: true });
    writeFileSync(join(root, "src", "icons", "svg", "user.svg"), `<svg width="130" height="130"><path d="M1 2h3z"/></svg>`);
    writeFileSync(join(root, "src", "views", "Login.vue"), `<template><div><svg-icon icon-class="user" /></div></template><script>export default { name:'Login' }</script><style>.login{padding:20px}</style>`);
    const graph = analyzeSfcVisualResponsibilities(root);
    const icon = graph.components[0].templateStructure.nodes.find((node) => node.componentName === "SvgIcon");
    assert.equal(graph.metrics.embeddedSvgAssets, 1);
    assert.equal(graph.metrics.compiledStyleSheets, 1);
    assert.equal(graph.components[0].styles[0].compileStatus, "raw-css");
    assert.equal(graph.components[0].styles[0].compiledCss, ".login{padding:20px}");
    assert.deepEqual(icon?.embeddedAssets?.[0], { kind: "svg", name: "user", sourcePath: "src/icons/svg/user.svg", viewBox: "0 0 130 130", markup: '<path d="M1 2h3z"/>' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { analyzeApiFixtureResponsibilities, analyzeTransportProxyResponsibilities } from "../planning/api-fixture-responsibility.js";
import type { SpaRouterContractConfig } from "../evaluation/spa-router.js";

test("nested Vue templates preserve every Element UI table column and bind reviewed API fixtures", () => {
  const root = mkdtempSync(join(tmpdir(), "ui-dismantler-api-fixture-"));
  try {
    mkdirSync(join(root, "src", "views"), { recursive: true });
    mkdirSync(join(root, "src", "api"), { recursive: true });
    mkdirSync(join(root, "src", "utils"), { recursive: true });
    writeFileSync(join(root, ".env.development"), `VUE_APP_BASE_API = '/dev-api'\nVUE_APP_PROXY_TARGET = 'https://dev.example.test'\n`);
    writeFileSync(join(root, ".env.production"), `VUE_APP_BASE_API = '/prod-api'\nVUE_APP_PROXY_TARGET = 'https://prod.example.test'\n`);
    writeFileSync(join(root, "vue.config.js"), `const apiPrefix = process.env.VUE_APP_BASE_API; module.exports={devServer:{proxy:{[apiPrefix]:{target:process.env.VUE_APP_PROXY_TARGET,pathRewrite:{['^' + apiPrefix]:''}}}}}`);
    writeFileSync(join(root, "src", "utils", "request.js"), `export default createClient({ baseURL: process.env.VUE_APP_BASE_API })`);
    writeFileSync(join(root, "src", "api", "orders.js"), `import request from '@/utils/request'\nexport function fetchOrders(){ return request({ url:'/api/orders', method:'get' }) }`);
    writeFileSync(join(root, "src", "views", "Orders.vue"), `<template><el-table :data="list" style="width:100%;padding-top:15px"><el-table-column label="Order" min-width="200"><template slot-scope="scope">{{ scope.row.order_no | orderNoFilter }}</template></el-table-column><el-table-column label="Price" width="195" align="center"><template slot-scope="scope">¥{{ scope.row.price | toThousandFilter }}</template></el-table-column><el-table-column label="Status" width="100" align="center"><template slot-scope="{row}"><el-tag :type="row.status | statusFilter">{{ row.status }}</el-tag></template></el-table-column></el-table></template><script>import { fetchOrders } from '@/api/orders'; export default { name:'Orders', filters:{ statusFilter(status){ const map={success:'success',pending:'danger'}; return map[status] }, orderNoFilter(value){ return value.substring(0,30) } }, data(){return {list:null}}, created(){this.load()}, methods:{load(){fetchOrders().then(response => { this.list=response.data.items.slice(0,8) })}} }</script>`);
    const graph = analyzeSfcVisualResponsibilities(root);
    const orders = graph.components.find((item) => item.componentName === "Orders");
    assert.ok(orders);
    assert.equal(orders.templateStructure.primitiveCounts["table-column"], 3);
    const config: SpaRouterContractConfig = {
      schemaVersion: "1.0", baseUrl: "http://127.0.0.1:3000", scenarios: [],
      fixtures: [{ path: "/api/orders", pathMode: "transport-suffix", method: "GET", resourceType: "xhr", body: { data: { items: [
        { order_no: "A", price: 1234, status: "success" }, { order_no: "B", price: 5678, status: "pending" },
      ] } } }],
    };
    const api = analyzeApiFixtureResponsibilities(root, config, graph.components);
    assert.equal(api.metrics.matchedFixtures, 1);
    assert.equal(api.metrics.transportPrefixesInferred, 2);
    assert.equal(api.metrics.runtimeSelectionsInferred, 2);
    assert.equal(api.metrics.proxyRoutesInferred, 2);
    assert.equal(api.metrics.proxyTargetsInferred, 2);
    assert.equal(api.metrics.proxyRewriteRulesInferred, 2);
    assert.deepEqual(api.responsibilities[0].apiCall.transportPrefixes, [
      { value: "/dev-api", source: ".env.development:VUE_APP_BASE_API" },
      { value: "/prod-api", source: ".env.production:VUE_APP_BASE_API" },
    ]);
    assert.deepEqual(api.responsibilities[0].apiCall.transportPathCandidates, ["/dev-api/api/orders", "/prod-api/api/orders"]);
    assert.deepEqual(api.responsibilities[0].apiCall.runtimeSelections.map((item) => [item.environment, item.value]), [["development", "/dev-api"], ["production", "/prod-api"]]);
    assert.deepEqual(api.responsibilities[0].apiCall.proxyRoutes.map((item) => ({ environment: item.environment, target: item.targetCandidates[0], rewrite: item.rewritePattern, upstream: item.upstreamPathCandidate })), [
      { environment: "development", target: "https://dev.example.test", rewrite: "^/dev-api", upstream: "/api/orders" },
      { environment: "production", target: "https://prod.example.test", rewrite: "^/prod-api", upstream: "/api/orders" },
    ]);
    assert.equal(api.responsibilities[0].consumption.targetBinding, "list");
    assert.equal(api.responsibilities[0].consumption.responsePath, "data.items");
    assert.equal(api.responsibilities[0].consumption.sliceLimit, 8);
    assert.deepEqual(api.responsibilities[0].renderedFields.map((field) => field.field), ["order_no", "price", "status"]);
    assert.deepEqual(api.responsibilities[0].filterValueMaps.statusFilter, { success: "success", pending: "danger" });
    assert.equal(Array.isArray(api.responsibilities[0].fixture.materializedValue), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("visual resource planner proposes reviewed WebGL and DOM profiles from responsibility evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "ui-dismantler-resource-profile-"));
  try {
    mkdirSync(join(root, "src", "views"), { recursive: true });
    writeFileSync(join(root, "src", "views", "Scene.vue"), `<template><main class="scene"><canvas ref="surface"></canvas></main></template><script>export default { name:'Scene', mounted(){const gl=this.$refs.surface.getContext('webgl2'); const draw=()=>{gl.clear(gl.COLOR_BUFFER_BIT);requestAnimationFrame(draw)};draw()} }</script><style>.scene{height:100vh}</style>`);
    writeFileSync(join(root, "src", "views", "About.vue"), `<template><main class="about"><h1>About</h1></main></template><script>export default { name:'About' }</script><style>.about{padding:20px}</style>`);
    const graph = analyzeSfcVisualResponsibilities(root);
    assert.equal(graph.metrics.canvasResourceComponents, 1);
    assert.equal(graph.metrics.webglResourceComponents, 1);
    assert.equal(graph.metrics.frameDrivenComponents, 1);
    const createRoutePlan = (route: string, selector: string): SpaRouteShellPlan => ({
      schemaVersion: "1.0", kind: "spa-route-shell-plan", reviewRequired: true, generatedCode: false,
      source: { mode: "reference-generated", configScenarios: 1, reportIncluded: true, reportPassed: true },
      routes: [{ route, pattern: route, scenarios: [route], entry: true, final: true, assertions: [{ scenarioId: route, visibleSelector: selector }], visualStates: [{ scenarioId: route, region: selector, styleTargets: [selector] }] }],
      transitions: [], selectorMappings: [], fixtureDependencies: [], capabilities: { historyBack: false, historyForward: false, reload: false, dynamicInputRoutes: false, roleSpecificSelectors: false, reviewedVisualStates: 1 },
      measurementTemplate: { modelCalls: null, generationMs: null, manualEdits: null, manualEditedLines: null, repairIterations: null, qualityRuns: null }, reviewReasons: [],
    });
    const scenePlan = generateVisualTargetPlan(graph, createRoutePlan("/#/scene", ".scene"));
    assert.equal(scenePlan.boundaries[0].resourceProfileProposal.profile, "canvas");
    assert.equal(scenePlan.boundaries[0].resourceProfileProposal.confidence, 0.99);
    assert.equal(scenePlan.boundaries[0].resourceProfileProposal.evidence.some((item) => item.kind === "webgl-context"), true);
    assert.equal(scenePlan.boundaries[0].resourceProfileProposal.evidence.some((item) => item.kind === "request-animation-frame"), true);
    const aboutPlan = generateVisualTargetPlan(graph, createRoutePlan("/#/about", ".about"));
    assert.equal(aboutPlan.boundaries[0].resourceProfileProposal.profile, "dom");
    assert.equal(aboutPlan.boundaries[0].resourceProfileProposal.reviewRequired, true);
    assert.equal(aboutPlan.boundaries[0].resourceProfileProposal.evidence.some((item) => item.kind === "dom-structure"), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Vite proxy responsibility keeps browser prefix separate from reviewed upstream rewrite evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "ui-dismantler-vite-proxy-"));
  try {
    mkdirSync(join(root, "src", "views"), { recursive: true });
    mkdirSync(join(root, "src", "api"), { recursive: true });
    mkdirSync(join(root, "src", "utils"), { recursive: true });
    writeFileSync(join(root, ".env.development"), `VITE_API_PREFIX=/api\nVITE_API_TARGET=https://vite-api.example.test\n`);
    writeFileSync(join(root, "vite.config.ts"), `import { defineConfig, loadEnv } from 'vite'; export default defineConfig(({mode})=>{const env=loadEnv(mode,process.cwd(),'');return {server:{proxy:{[env.VITE_API_PREFIX]:{target:env.VITE_API_TARGET,changeOrigin:true,secure:false,ws:true,rewrite:path=>path.replace(/^\\/api/,'/v1'),configure(proxy,options){}}}}}})`);
    writeFileSync(join(root, "src", "utils", "request.ts"), `export default createClient({ baseURL: import.meta.env.VITE_API_PREFIX })`);
    writeFileSync(join(root, "src", "api", "orders.ts"), `import request from '@/utils/request'; export function fetchOrders(){ return request({url:'/orders',method:'get'}) }`);
    writeFileSync(join(root, "src", "views", "Orders.vue"), `<template><div>{{ list.length }}</div></template><script>import { fetchOrders } from '@/api/orders'; export default {name:'Orders',data(){return {list:[]}},created(){fetchOrders().then(response=>{this.list=response.data.items})}}</script>`);
    const graph = analyzeSfcVisualResponsibilities(root);
    const config: SpaRouterContractConfig = { schemaVersion: "1.0", baseUrl: "http://127.0.0.1:3000", scenarios: [], fixtures: [{ path: "/api/orders", method: "GET", body: { data: { items: [] } } }] };
    const api = analyzeApiFixtureResponsibilities(root, config, graph.components);
    assert.equal(api.metrics.proxyRoutesInferred, 1);
    const route = api.responsibilities[0].apiCall.proxyRoutes[0];
    assert.deepEqual(api.responsibilities[0].apiCall.transportPathCandidates, ["/api/orders"]);
    assert.equal(route.framework, "vite");
    assert.equal(route.requestPrefix, "/api");
    assert.deepEqual(route.targetCandidates, ["https://vite-api.example.test"]);
    assert.equal(route.changeOrigin, true);
    assert.equal(route.secure, false);
    assert.equal(route.ws, true);
    assert.equal(route.configureHook, true);
    assert.equal(route.rewriteKind, "rewrite-callback");
    assert.equal(route.rewritePattern, "^/api");
    assert.equal(route.upstreamPathCandidate, "/v1/orders");
    assert.equal(api.responsibilities[0].apiCall.transportPathCandidates.includes(route.upstreamPathCandidate ?? ""), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Webpack proxy arrays preserve context router and bypass evidence without changing fixture paths", () => {
  const root = mkdtempSync(join(tmpdir(), "ui-dismantler-webpack-proxy-"));
  try {
    mkdirSync(join(root, "src", "views"), { recursive: true });
    mkdirSync(join(root, "src", "api"), { recursive: true });
    mkdirSync(join(root, "src", "utils"), { recursive: true });
    writeFileSync(join(root, ".env.development"), `APP_API_PREFIX=/api\nAPP_API_TARGET=https://webpack-api.example.test\nAPP_ROUTER_TARGET=https://router.example.test\n`);
    writeFileSync(join(root, "webpack.config.js"), `module.exports={devServer:{proxy:[{context:['/api','/auth'],target:process.env.APP_API_TARGET,router(req){return process.env.APP_ROUTER_TARGET},changeOrigin:true,pathRewrite(path){return path.replace(/^\\/api/,'')},bypass(req){return false}}]}}`);
    writeFileSync(join(root, "src", "utils", "request.js"), `export default createClient({ baseURL: process.env.APP_API_PREFIX })`);
    writeFileSync(join(root, "src", "api", "orders.js"), `import request from '@/utils/request'; export function fetchOrders(){ return request({url:'/orders',method:'get'}) }`);
    writeFileSync(join(root, "src", "views", "Orders.vue"), `<template><div>{{ list.length }}</div></template><script>import { fetchOrders } from '@/api/orders'; export default {name:'Orders',data(){return {list:[]}},created(){fetchOrders().then(response=>{this.list=response.data.items})}}</script>`);
    const graph = analyzeSfcVisualResponsibilities(root);
    const config: SpaRouterContractConfig = { schemaVersion: "1.0", baseUrl: "http://127.0.0.1:3000", scenarios: [], fixtures: [{ path: "/api/orders", method: "GET", body: { data: { items: [] } } }] };
    const api = analyzeApiFixtureResponsibilities(root, config, graph.components);
    const route = api.responsibilities[0].apiCall.proxyRoutes[0];
    assert.equal(route.framework, "webpack");
    assert.deepEqual(route.contextCandidates, ["/api", "/auth"]);
    assert.deepEqual(route.targetCandidates, ["https://webpack-api.example.test"]);
    assert.deepEqual(route.routerCandidates, ["https://router.example.test"]);
    assert.equal(route.bypassHook, true);
    assert.equal(route.rewriteKind, "rewrite-callback");
    assert.equal(route.upstreamPathCandidate, "/orders");
    assert.deepEqual(api.responsibilities[0].apiCall.transportPathCandidates, ["/api/orders"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("scope-aware proxy AST keeps sibling Vite routes from cross-binding targets rewrites and hooks", () => {
  const root = mkdtempSync(join(tmpdir(), "ui-dismantler-vite-proxy-scope-"));
  try {
    mkdirSync(join(root, "src", "views"), { recursive: true });
    mkdirSync(join(root, "src", "api"), { recursive: true });
    mkdirSync(join(root, "src", "utils"), { recursive: true });
    writeFileSync(join(root, ".env.development"), `VITE_API_PREFIX=/api\nVITE_API_TARGET=https://api.example.test\nVITE_AUTH_PREFIX=/auth\nVITE_AUTH_TARGET=https://auth.example.test\n`);
    writeFileSync(join(root, "vite.config.ts"), `import { defineConfig, loadEnv } from 'vite'; export default defineConfig(({mode})=>{const env=loadEnv(mode,process.cwd(),'');return {server:{proxy:{[env.VITE_API_PREFIX]:{target:env.VITE_API_TARGET,changeOrigin:true,rewrite:path=>path.replace(/^\\/api/,'/v2')},[env.VITE_AUTH_PREFIX]:{target:env.VITE_AUTH_TARGET,secure:false,ws:true,configure(proxy){}}}}}})`);
    writeFileSync(join(root, "src", "utils", "request.ts"), `export default createClient({ baseURL: import.meta.env.VITE_API_PREFIX })`);
    writeFileSync(join(root, "src", "api", "orders.ts"), `import request from '@/utils/request'; export function fetchOrders(){ return request({url:'/orders',method:'get'}) }`);
    writeFileSync(join(root, "src", "views", "Orders.vue"), `<template><div>{{ list.length }}</div></template><script>import { fetchOrders } from '@/api/orders'; export default {name:'Orders',data(){return {list:[]}},created(){fetchOrders().then(response=>{this.list=response.data.items})}}</script>`);
    const graph = analyzeSfcVisualResponsibilities(root);
    const config: SpaRouterContractConfig = { schemaVersion: "1.0", baseUrl: "http://127.0.0.1:3000", scenarios: [], fixtures: [{ path: "/api/orders", method: "GET", body: { data: { items: [] } } }] };
    const api = analyzeApiFixtureResponsibilities(root, config, graph.components);
    assert.equal(api.metrics.proxyRoutesInferred, 1);
    assert.equal(api.metrics.proxyAstRoutesInferred, 1);
    assert.equal(api.metrics.proxyFallbackRoutesInferred, 0);
    const route = api.responsibilities[0].apiCall.proxyRoutes[0];
    assert.equal(route.analysisMode, "scope-ast");
    assert.deepEqual(route.analysisDiagnostics, []);
    assert.deepEqual(route.contextCandidates, ["/api"]);
    assert.deepEqual(route.targetCandidates, ["https://api.example.test"]);
    assert.equal(route.rewritePattern, "^/api");
    assert.equal(route.upstreamPathCandidate, "/v2/orders");
    assert.equal(route.secure, undefined);
    assert.equal(route.ws, undefined);
    assert.equal(route.configureHook, false);
    assert.equal(route.targetCandidates.includes("https://auth.example.test"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("unsupported TypeScript proxy syntax emits auditable regex fallback diagnostics", () => {
  const root = mkdtempSync(join(tmpdir(), "ui-dismantler-proxy-fallback-"));
  try {
    mkdirSync(join(root, "src", "views"), { recursive: true });
    mkdirSync(join(root, "src", "api"), { recursive: true });
    mkdirSync(join(root, "src", "utils"), { recursive: true });
    writeFileSync(join(root, "vite.config.ts"), `type Config = { server: unknown }; const config: Config = {server:{proxy:{'/api':{target:'https://fallback.example.test',rewrite:path=>path.replace(/^\\/api/,'')}}}}; export default config`);
    writeFileSync(join(root, "src", "utils", "request.ts"), `export default createClient({ baseURL: '/api' })`);
    writeFileSync(join(root, "src", "api", "orders.ts"), `import request from '@/utils/request'; export function fetchOrders(){ return request({url:'/orders',method:'get'}) }`);
    writeFileSync(join(root, "src", "views", "Orders.vue"), `<template><div>{{ list.length }}</div></template><script>import { fetchOrders } from '@/api/orders'; export default {name:'Orders',data(){return {list:[]}},created(){fetchOrders().then(response=>{this.list=response.data.items})}}</script>`);
    const graph = analyzeSfcVisualResponsibilities(root);
    const config: SpaRouterContractConfig = { schemaVersion: "1.0", baseUrl: "http://127.0.0.1:3000", scenarios: [], fixtures: [{ path: "/api/orders", method: "GET", body: { data: { items: [] } } }] };
    const api = analyzeApiFixtureResponsibilities(root, config, graph.components);
    assert.equal(api.metrics.proxyRoutesInferred, 1);
    assert.equal(api.metrics.proxyAstRoutesInferred, 0);
    assert.equal(api.metrics.proxyFallbackRoutesInferred, 1);
    assert.ok(api.metrics.proxyParseDiagnostics >= 2);
    const route = api.responsibilities[0].apiCall.proxyRoutes[0];
    assert.equal(route.analysisMode, "regex-fallback");
    assert.ok(route.analysisDiagnostics.some((item) => item.includes("Acorn module parse failed:")));
    assert.deepEqual(route.targetCandidates, ["https://fallback.example.test"]);
    assert.equal(route.rewritePattern, "^/api");
    assert.equal(api.responsibilities[0].apiCall.transportPathCandidates.includes(route.upstreamPathCandidate ?? ""), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("proxy AST resolves imported spread maps factory returns and shared route options", () => {
  const root = mkdtempSync(join(tmpdir(), "ui-dismantler-proxy-import-factory-"));
  try {
    mkdirSync(join(root, "config"), { recursive: true });
    mkdirSync(join(root, "src", "views"), { recursive: true });
    mkdirSync(join(root, "src", "api"), { recursive: true });
    mkdirSync(join(root, "src", "utils"), { recursive: true });
    writeFileSync(join(root, ".env.development"), `VITE_API_PREFIX=/api\nVITE_API_TARGET=https://api.example.test\n`);
    writeFileSync(join(root, "config", "proxy.js"), `const shared={changeOrigin:true,secure:false}; export function createApiProxy(env){return {[env.VITE_API_PREFIX]:{...shared,target:env.VITE_API_TARGET,rewrite:path=>path.replace(/^\\/api/,'/v3')}}}`);
    writeFileSync(join(root, "vite.config.js"), `import {defineConfig,loadEnv} from 'vite'; import {createApiProxy} from './config/proxy.js'; export default defineConfig(({mode})=>{const env=loadEnv(mode,process.cwd(),''); return {server:{proxy:{...createApiProxy(env),'/health':{target:'https://health.example.test',ws:true}}}}})`);
    writeFileSync(join(root, "src", "utils", "request.js"), `export default createClient({ baseURL: import.meta.env.VITE_API_PREFIX })`);
    writeFileSync(join(root, "src", "api", "orders.js"), `import request from '@/utils/request'; export function fetchOrders(){ return request({url:'/orders',method:'get'}) }`);
    writeFileSync(join(root, "src", "views", "Orders.vue"), `<template><div>{{ list.length }}</div></template><script>import { fetchOrders } from '@/api/orders'; export default {name:'Orders',data(){return {list:[]}},created(){fetchOrders().then(response=>{this.list=response.data.items})}}</script>`);
    const graph = analyzeSfcVisualResponsibilities(root);
    const config: SpaRouterContractConfig = { schemaVersion: "1.0", baseUrl: "http://127.0.0.1:3000", scenarios: [], fixtures: [{ path: "/api/orders", method: "GET", body: { data: { items: [] } } }] };
    const api = analyzeApiFixtureResponsibilities(root, config, graph.components);
    assert.equal(api.metrics.proxyRoutesInferred, 1);
    const route = api.responsibilities[0].apiCall.proxyRoutes[0];
    assert.equal(route.analysisMode, "scope-ast");
    assert.equal(route.source, "config/proxy.js");
    assert.equal(route.configSource, "vite.config.js");
    assert.deepEqual(route.scopeSources, ["config/proxy.js"]);
    assert.deepEqual(route.contextCandidates, ["/api"]);
    assert.deepEqual(route.targetCandidates, ["https://api.example.test"]);
    assert.equal(route.changeOrigin, true);
    assert.equal(route.secure, false);
    assert.equal(route.ws, undefined);
    assert.equal(route.rewritePattern, "^/api");
    assert.equal(route.upstreamPathCandidate, "/v3/orders");
    assert.equal(route.targetCandidates.includes("https://health.example.test"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("proxy AST resolves an imported default proxy object without broad sibling evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "ui-dismantler-proxy-import-default-"));
  try {
    mkdirSync(join(root, "config"), { recursive: true });
    mkdirSync(join(root, "src", "views"), { recursive: true });
    mkdirSync(join(root, "src", "api"), { recursive: true });
    mkdirSync(join(root, "src", "utils"), { recursive: true });
    writeFileSync(join(root, "config", "proxy.js"), `const routes={'/api':{target:'https://api.example.test',changeOrigin:true},'/auth':{target:'https://auth.example.test',secure:false}}; export default routes`);
    writeFileSync(join(root, "vite.config.js"), `import {defineConfig} from 'vite'; import routes from './config/proxy.js'; export default defineConfig({server:{proxy:routes}})`);
    writeFileSync(join(root, "src", "utils", "request.js"), `export default createClient({ baseURL: '/api' })`);
    writeFileSync(join(root, "src", "api", "orders.js"), `import request from '@/utils/request'; export function fetchOrders(){ return request({url:'/orders',method:'get'}) }`);
    writeFileSync(join(root, "src", "views", "Orders.vue"), `<template><div>{{ list.length }}</div></template><script>import { fetchOrders } from '@/api/orders'; export default {name:'Orders',data(){return {list:[]}},created(){fetchOrders().then(response=>{this.list=response.data.items})}}</script>`);
    const graph = analyzeSfcVisualResponsibilities(root);
    const config: SpaRouterContractConfig = { schemaVersion: "1.0", baseUrl: "http://127.0.0.1:3000", scenarios: [], fixtures: [{ path: "/api/orders", method: "GET", body: { data: { items: [] } } }] };
    const api = analyzeApiFixtureResponsibilities(root, config, graph.components);
    assert.equal(api.metrics.proxyRoutesInferred, 1);
    const route = api.responsibilities[0].apiCall.proxyRoutes[0];
    assert.equal(route.source, "config/proxy.js");
    assert.deepEqual(route.targetCandidates, ["https://api.example.test"]);
    assert.equal(route.secure, undefined);
    assert.equal(route.targetCandidates.includes("https://auth.example.test"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("proxy graph preserves router and bypass conditional return branches as audit evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "ui-dismantler-proxy-decisions-"));
  try {
    mkdirSync(join(root, "src", "views"), { recursive: true });
    mkdirSync(join(root, "src", "api"), { recursive: true });
    mkdirSync(join(root, "src", "utils"), { recursive: true });
    writeFileSync(join(root, ".env.development"), `APP_API_PREFIX=/api\nAPP_API_TARGET=https://api.example.test\nAPP_TENANT_TARGET=https://tenant.example.test\n`);
    writeFileSync(join(root, "webpack.config.js"), `module.exports={devServer:{proxy:[{context:'/api',target:process.env.APP_API_TARGET,router(req){if(req.headers.host==='tenant.example.test') return process.env.APP_TENANT_TARGET; return process.env.APP_API_TARGET},bypass(req){if(req.headers.accept==='text/html') return '/index.html'; return false}}]}}`);
    writeFileSync(join(root, "src", "utils", "request.js"), `export default createClient({ baseURL: process.env.APP_API_PREFIX })`);
    writeFileSync(join(root, "src", "api", "orders.js"), `import request from '@/utils/request'; export function fetchOrders(){ return request({url:'/orders',method:'get'}) }`);
    writeFileSync(join(root, "src", "views", "Orders.vue"), `<template><div>{{ list.length }}</div></template><script>import { fetchOrders } from '@/api/orders'; export default {name:'Orders',data(){return {list:[]}},created(){fetchOrders().then(response=>{this.list=response.data.items})}}</script>`);
    const graph = analyzeSfcVisualResponsibilities(root);
    const config: SpaRouterContractConfig = { schemaVersion: "1.0", baseUrl: "http://127.0.0.1:3000", scenarios: [], fixtures: [{ path: "/api/orders", method: "GET", body: { data: { items: [] } } }] };
    const api = analyzeApiFixtureResponsibilities(root, config, graph.components);
    const route = api.responsibilities[0].apiCall.proxyRoutes[0];
    assert.deepEqual(route.routerCandidates, ["https://tenant.example.test", "https://api.example.test"]);
    assert.deepEqual(route.routerDecisionBranches, [
      { condition: "req.headers.host==='tenant.example.test'", rawOutcome: "process.env.APP_TENANT_TARGET", outcomeKind: "environment", outcomeCandidates: ["https://tenant.example.test"] },
      { condition: "default", rawOutcome: "process.env.APP_API_TARGET", outcomeKind: "environment", outcomeCandidates: ["https://api.example.test"] },
    ]);
    assert.deepEqual(route.bypassDecisionBranches, [
      { condition: "req.headers.accept==='text/html'", rawOutcome: "'/index.html'", outcomeKind: "literal", outcomeCandidates: ["/index.html"] },
      { condition: "default", rawOutcome: "false", outcomeKind: "boolean", outcomeCandidates: ["false"] },
    ]);
    assert.equal(route.bypassHook, true);
    assert.equal(api.responsibilities[0].apiCall.transportPathCandidates.includes("/index.html"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("project transport graph materializes Vite template prefixes without requiring component fixtures", () => {
  const root = mkdtempSync(join(tmpdir(), "ui-dismantler-project-proxy-"));
  try {
    writeFileSync(join(root, ".env.development"), `VITE_BASE_PATH=/console\nVITE_API_TARGET=https://dev-api.example.test\n`);
    writeFileSync(join(root, ".env.production"), `VITE_BASE_PATH=/\nVITE_API_TARGET=\n`);
    writeFileSync(join(root, "vite.config.js"), `import {defineConfig,loadEnv} from 'vite'; export default defineConfig(({mode})=>{const env=loadEnv(mode,process.cwd(),'');return {server:{proxy:{[\`${'${env.VITE_BASE_PATH || \'\'}'}/api\`]:{target:env.VITE_API_TARGET || 'http://localhost:8090',changeOrigin:true,ws:true,bypass:req=>false}}}}})`);
    const graph = analyzeTransportProxyResponsibilities(root);
    assert.equal(graph.metrics.configFiles, 1);
    assert.equal(graph.metrics.proxyScopes, 1);
    assert.equal(graph.metrics.routes, 2);
    assert.equal(graph.metrics.astRoutes, 2);
    assert.equal(graph.metrics.dynamicContextsMaterialized, 1);
    assert.equal(graph.metrics.fallbackRoutes, 0);
    assert.equal(graph.metrics.diagnostics, 0);
    assert.deepEqual(graph.routes.map((route) => ({ environment: route.environment, prefix: route.requestPrefix, target: route.targetCandidates[0] })), [
      { environment: "development", prefix: "/console/api", target: "https://dev-api.example.test" },
      { environment: "production", prefix: "/api", target: "http://localhost:8090" },
    ]);
    assert.deepEqual(graph.routes[0].bypassDecisionBranches, [
      { condition: "default", rawOutcome: "false", outcomeKind: "boolean", outcomeCandidates: ["false"] },
    ]);
    assert.equal(graph.routes.every((route) => route.configSource === "vite.config.js"), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Composition API await assignments and Axios method helpers bind reviewed fixtures without identifier whitelists", () => {
  const root = mkdtempSync(join(tmpdir(), "ui-dismantler-composition-api-"));
  try {
    mkdirSync(join(root, "src", "views"), { recursive: true });
    mkdirSync(join(root, "src", "api"), { recursive: true });
    writeFileSync(join(root, "src", "api", "request.js"), `export default axios.create({baseURL:'/api'})`);
    writeFileSync(join(root, "src", "api", "profiles.js"), `import request from './request'; export const fetchRecords = () => request.get('/profiles'); export const createRecord = data => request.post('/profiles', data);`);
    writeFileSync(join(root, "src", "views", "Profiles.vue"), `<template><main><article v-for="record in records" :key="record.id">{{ record.name }}</article></main><script setup>import {ref,onMounted} from 'vue'; import {fetchRecords} from '../api/profiles'; const records=ref([]); async function load(){const response=await fetchRecords(); records.value=response.data || []} onMounted(load)</script><style>article{padding:1rem}</style>`);
    writeFileSync(join(root, "src", "views", "LazyProfiles.vue"), `<template><main>{{ records.length }}</main><script setup>import {ref} from 'vue'; const records=ref([]); async function load(){const { fetchRecords: loadRecords } = await import('../api/profiles'); const payload=await loadRecords(); records.value=payload.data}</script>`);
    const graph = analyzeSfcVisualResponsibilities(root);
    const config: SpaRouterContractConfig = {
      schemaVersion: "1.0", baseUrl: "http://127.0.0.1:3000", scenarios: [],
      fixtures: [{ path: "/profiles", pathMode: "transport-suffix", method: "GET", body: { success: true, data: [{ id: "reviewed", name: "Reviewed Profile" }] } }],
    };
    const api = analyzeApiFixtureResponsibilities(root, config, graph.components);
    assert.equal(api.metrics.importedApiCalls, 5);
    assert.equal(api.metrics.matchedEndpoints, 2);
    assert.equal(api.metrics.matchedFixtures, 2);
    assert.equal(api.metrics.materializedBindings, 2);
    assert.deepEqual(api.responsibilities.map((item) => [item.componentName, item.apiCall.method, item.apiCall.path, item.consumption.targetBinding, item.consumption.responsePath]), [
      ["LazyProfiles", "GET", "/profiles", "records", "data"],
      ["Profiles", "GET", "/profiles", "records", "data"],
    ]);
    assert.deepEqual(api.responsibilities[0].fixture.materializedValue, [{ id: "reviewed", name: "Reviewed Profile" }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("visual target root ownership uses reviewed source structure for root and camel-cased routes", () => {
  const root = mkdtempSync(join(tmpdir(), "ui-dismantler-route-owner-"));
  try {
    mkdirSync(join(root, "src", "views"), { recursive: true });
    writeFileSync(join(root, "src", "views", "ThemeInput.vue"), `<template><main class="theme-input-container"><h1>Star Map Agent</h1></main></template><script setup>const ready=true</script><style scoped>.theme-input-container{min-height:100vh}</style>`);
    writeFileSync(join(root, "src", "views", "ModelProfiles.vue"), `<template><main class="profiles-container"><h1>Profiles</h1></main></template><script setup>const ready=true</script><style scoped>.profiles-container{min-height:100vh}</style>`);
    const graph = analyzeSfcVisualResponsibilities(root);
    const routePlan: SpaRouteShellPlan = {
      schemaVersion: "1.0", kind: "spa-route-shell-plan", reviewRequired: true, generatedCode: false,
      source: { mode: "reference-generated", configScenarios: 2, reportIncluded: true, reportPassed: true },
      routes: [
        { route: "/", pattern: "/", scenarios: ["home"], entry: true, final: true, assertions: [{ scenarioId: "home", visibleSelector: ".theme-input-container", visibleText: "Star Map Agent" }], visualStates: [{ scenarioId: "home", region: ".theme-input-container", styleTargets: [".theme-input-container"] }] },
        { route: "/profiles", pattern: "/profiles", scenarios: ["profiles"], entry: true, final: true, assertions: [{ scenarioId: "profiles", visibleSelector: ".profiles-container" }], visualStates: [{ scenarioId: "profiles", region: ".profiles-container", styleTargets: [".profiles-container"] }] },
      ],
      transitions: [], selectorMappings: [], fixtureDependencies: [],
      capabilities: { historyBack: false, historyForward: false, reload: false, dynamicInputRoutes: false, roleSpecificSelectors: false, reviewedVisualStates: 2 },
      measurementTemplate: { modelCalls: 0, generationMs: 0, manualEdits: 0, manualEditedLines: 0, repairIterations: 0, qualityRuns: 0 }, reviewReasons: [],
    };
    const plan = generateVisualTargetPlan(graph, routePlan);
    assert.equal(plan.metrics.unresolvedRoutes, 0);
    assert.deepEqual(plan.boundaries.map((boundary) => [boundary.route, plan.owners.find((owner) => owner.id === boundary.rootOwnerId)?.componentName]), [
      ["/", "ThemeInput"], ["/profiles", "ModelProfiles"],
    ]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
