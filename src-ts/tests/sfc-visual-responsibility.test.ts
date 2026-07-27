import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analyzeEChartsResponsibilities } from "../planning/echarts-responsibility.js";
import { analyzeSfcVisualResponsibilities } from "../planning/sfc-visual-responsibility.js";

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
    assert.equal(plan.owners.find((owner) => owner.id === plan.boundaries[0].rootOwnerId)?.componentName, "DashboardAdmin");
    assert.equal(plan.boundaries[0].acceptance.styleTargets.includes(".dashboard-editor-container"), true);
    assert.equal(plan.owners.some((owner) => owner.componentName === "PanelGroup"), true);
    assert.equal(plan.owners.some((owner) => owner.kind === "chart" && owner.chart?.chartTypes.includes("line")), true);
    assert.equal(plan.owners.every((owner) => owner.implementationSelector.startsWith("[data-visual-owner=")), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { generateVisualTargetArtifact } from "../planning/visual-target-generator.js";

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

import { analyzeApiFixtureResponsibilities } from "../planning/api-fixture-responsibility.js";
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
