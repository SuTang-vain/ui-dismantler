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
<script>import PanelGroup from './components/PanelGroup'; import LineChart from './components/LineChart'; export default { name:'DashboardAdmin', components:{PanelGroup,LineChart}, data(){return {lineChartData:{}}}, methods:{setData(){}} }</script>
<style scoped lang="scss">.dashboard-editor-container{padding:32px}@media (max-width:1024px){.dashboard-editor-container{padding:16px}}</style>`);
  writeFileSync(join(root, "views", "dashboard", "components", "PanelGroup.vue"), `<template><button class="card-panel" @click="$emit('change','messages')">Messages</button></template><script>export default { name:'PanelGroup' }</script><style scoped>.card-panel{height:108px}</style>`);
  writeFileSync(join(root, "views", "dashboard", "components", "LineChart.vue"), `<template><div class="chart"/></template><script>import echarts from 'echarts'; require('echarts/theme/macarons'); import resize from './resize'; export default { mixins:[resize], props:{chartData:Object}, watch:{chartData:{handler(v){this.setOptions(v)}}}, mounted(){this.chart=echarts.init(this.$el,'macarons');this.setOptions(this.chartData)}, beforeDestroy(){this.chart.dispose()}, methods:{setOptions({expectedData,actualData}){this.chart.setOption({xAxis:{},yAxis:{},legend:{},series:[{type:'line',data:expectedData},{type:'line',data:actualData}]})}} }</script><style scoped>.chart{height:350px}</style>`);
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
    assert.equal(dashboard.styles[0].scoped, true);
    assert.deepEqual(dashboard.styles[0].mediaQueries, ["(max-width:1024px)"]);
    const line = graph.components.find((item) => item.componentName === "LineChart");
    assert.equal(line?.chartResponsibilityIds.length, 1);
    assert.equal(line?.runtimeDependencies.includes("echarts"), true);
    assert.equal(graph.reviewRequired, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
