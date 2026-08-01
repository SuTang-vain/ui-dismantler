import type { SpaRouteShellPlan } from "./spa-route-shell.js";
import type { VisualTargetPlan } from "./visual-target-plan.js";
import { compilePrimitiveDom, materializeElementUiPrimitiveCss, materializePrimitiveCss } from "./primitive-dom-compiler.js";

export interface GeneratedVisualTargetFile { path: string; content: string; lines: number }
export interface GeneratedVisualTargetArtifact {
  schemaVersion: "1.0";
  kind: "generated-visual-target-artifact";
  reviewRequired: true;
  fullGeneratedApplication: true;
  generatedVisualDom: true;
  files: GeneratedVisualTargetFile[];
  metrics: {
    generatedFiles: number;
    generatedLines: number;
    visualBoundaries: number;
    visualOwners: number;
    chartOwners: number;
    templateNodes: number;
    elementUiPrimitives: number;
    responsiveGridNodes: number;
    primitiveDomNodes: number;
    primitiveStyleRules: number;
    primitiveInteractionBindings: number;
    modelCalls: 0;
    manualEdits: 0;
    manualEditedLines: 0;
    repairIterations: 0;
    qualityRuns: 0;
  };
  limitations: string[];
}

function file(path: string, content: string): GeneratedVisualTargetFile {
  const normalized = content.trimStart().replace(/\s+$/, "") + "\n";
  return { path, content: normalized, lines: normalized.split("\n").length - 1 };
}

function hasOwner(plan: VisualTargetPlan, name: string): boolean {
  return plan.owners.some((owner) => owner.componentName.toLowerCase() === name.toLowerCase());
}

function ownerByName(plan: VisualTargetPlan, name: string) {
  return plan.owners.find((owner) => owner.kind !== "chart" && owner.componentName.toLowerCase() === name.toLowerCase());
}
function chartOwnerByName(plan: VisualTargetPlan, name: string) {
  return plan.owners.find((owner) => owner.kind === "chart" && owner.componentName.toLowerCase() === name.toLowerCase());
}
function spanValue(value: string | undefined): number | undefined {
  if (!value) return undefined; const match = value.match(/(?:span\s*:\s*)?(\d+)/); return match ? Number(match[1]) : undefined;
}
function numericAttribute(value: string | boolean | undefined): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/-?\d+(?:\.\d+)?/); return match ? Number(match[0]) : undefined;
}
function dashboardEvidenceCss(plan: VisualTargetPlan): string {
  const rules: string[] = [];
  const panel = ownerByName(plan, "PanelGroup");
  const panelRow = panel?.templateStructure.nodes.find((node) => node.primitive?.kind === "layout-row");
  const panelGutter = numericAttribute(panelRow?.attributes[":gutter"] ?? panelRow?.attributes.gutter);
  if (panelGutter !== undefined) {
    const half = panelGutter / 2;
    const columns = panel?.templateStructure.nodes.filter((node) => node.parentId === panelRow?.id && node.primitive?.kind === "layout-column") ?? [];
    const columnCount = (viewport: "xs" | "sm" | "lg") => {
      const spans = columns.map((node) => spanValue(node.primitive?.responsiveSpans?.[viewport]) ?? spanValue(node.primitive?.responsiveSpans?.sm) ?? 24);
      return Math.max(1, Math.round(24 / Math.min(...spans, 24)));
    };
    rules.push(`.card-panel{display:block;padding:0;text-align:initial}.card-panel-description{display:block;text-align:initial}.panel-group{margin-left:-${half}px;margin-right:-${half}px;margin-bottom:0;gap:0;grid-template-columns:repeat(${columnCount("lg")},minmax(0,1fr))}.panel-group>.card-panel-col{padding-left:${half}px;padding-right:${half}px}@media(max-width:1199px){.panel-group{grid-template-columns:repeat(${columnCount("sm")},minmax(0,1fr))}}@media(max-width:767px){.panel-group{grid-template-columns:repeat(${columnCount("xs")},minmax(0,1fr))}}`);
  }
  const dashboard = ownerByName(plan, "DashboardAdmin");
  const nodes = dashboard?.templateStructure.nodes ?? [];
  const descendants = (parentId: string) => { const ids = new Set([parentId]); for (const node of nodes) if (node.parentId && ids.has(node.parentId)) ids.add(node.id); return nodes.filter((node) => ids.has(node.id) && node.id !== parentId); };
  const chartRows = nodes.filter((node) => node.primitive?.kind === "layout-row").map((node) => ({ node, charts: descendants(node.id).filter((child) => /Chart$/i.test(child.componentName)).length })).filter((item) => item.charts > 0).sort((a, b) => b.charts - a.charts);
  const chartRow = chartRows[0]?.node;
  const chartGutter = numericAttribute(chartRow?.attributes[":gutter"] ?? chartRow?.attributes.gutter);
  if (chartGutter !== undefined) rules.push(`.chart-row{column-gap:${chartGutter}px;row-gap:0}`);
  const bottomRow = nodes.find((node) => node.primitive?.kind === "layout-row" && descendants(node.id).some((child) => child.componentName === "TransactionTable"));
  const bottomGutter = numericAttribute(bottomRow?.attributes[":gutter"] ?? bottomRow?.attributes.gutter);
  const bottomColumns = bottomRow ? nodes.filter((node) => node.parentId === bottomRow.id && node.primitive?.kind === "layout-column") : [];
  const bottomMargin = bottomColumns.map((node) => node.inlineStyle["margin-bottom"]).find(Boolean);
  rules.push(`.chart-row{margin-bottom:0}.dashboard-bottom{align-items:start;gap:0${bottomGutter !== undefined ? `;margin-left:-${bottomGutter / 2}px;margin-right:-${bottomGutter / 2}px` : ""}}`);
  if (bottomGutter !== undefined) {
    const half = bottomGutter / 2;
    const columnRules = bottomColumns.map((node, index) => {
      const right = node.inlineStyle["padding-right"] ?? `${half}px`;
      const margin = node.inlineStyle["margin-bottom"] ?? bottomMargin;
      return `.dashboard-bottom>*:nth-child(${index + 1}){padding-left:${half}px;padding-right:${right}${margin ? `;margin-bottom:${margin}` : ""};min-width:0}`;
    }).join("");
    rules.push(columnRules);
  }
  const todo = ownerByName(plan, "TodoList");
  if (todo?.sourceStyleSheets.some((style) => style.compiledCss)) rules.push(".todoapp{padding:0}.todo-list li{padding:0}");
  const box = ownerByName(plan, "BoxCard");
  if (box?.sourceStyleSheets.some((style) => style.compiledCss)) rules.push(".box-card-component{padding:0;min-height:0;border:1px solid #ebeef5;box-shadow:0 2px 12px 0 rgba(0,0,0,.1)}.box-card-component>.el-card__header{padding:0}.box-card-component>.el-card__body{padding:20px}.box-card-component .box-card-header{margin:0}");
  return rules.join("");
}

function dashboardGridCss(plan: VisualTargetPlan): string {
  const owner = ownerByName(plan, "DashboardAdmin"); if (!owner) return "";
  const nodes = owner.templateStructure.nodes;
  const descendants = (parentId: string) => { const ids = new Set([parentId]); for (const node of nodes) if (node.parentId && ids.has(node.parentId)) ids.add(node.id); return nodes.filter((node) => ids.has(node.id) && node.id !== parentId); };
  const rows = nodes.filter((node) => node.primitive?.kind === "layout-row");
  const groups = rows.map((row) => nodes.filter((node) => node.parentId === row.id && node.primitive?.kind === "layout-column"));
  const layout = (columns: typeof nodes, viewport: "xs" | "md" | "lg") => {
    const spans = columns.map((node) => spanValue(node.primitive?.responsiveSpans?.[viewport]) ?? spanValue(node.primitive?.responsiveSpans?.sm) ?? 24);
    const unit = Math.min(...spans, 24), count = Math.max(1, Math.round(24 / unit));
    return { count, units: spans.map((span) => Math.max(1, Math.round(span / unit))) };
  };
  const chart = groups.find((columns) => columns.some((column) => descendants(column.id).some((node) => /Chart$/i.test(node.componentName)))) ?? [];
  const bottom = groups.find((columns) => columns.some((column) => descendants(column.id).some((node) => node.componentName === "TransactionTable"))) ?? [];
  const chartDesktop = layout(chart, "lg"), chartTablet = layout(chart, "md"), chartMobile = layout(chart, "xs");
  const bottomDesktop = layout(bottom, "lg"), bottomTablet = layout(bottom, "md"), bottomMobile = layout(bottom, "xs");
  const spans = (selector: string, units: number[]) => units.map((unit, index) => unit > 1 ? `${selector}>*:nth-child(${index + 1}){grid-column:span ${unit}}` : `${selector}>*:nth-child(${index + 1}){grid-column:span 1}`).join("");
  return `.chart-row{grid-template-columns:repeat(${chartDesktop.count},minmax(0,1fr))}${spans(".chart-row", chartDesktop.units)}.dashboard-bottom{grid-template-columns:repeat(${bottomDesktop.count},minmax(0,1fr))}${spans(".dashboard-bottom", bottomDesktop.units)}@media(max-width:1199px){.chart-row{grid-template-columns:repeat(${chartTablet.count},minmax(0,1fr))}${spans(".chart-row", chartTablet.units)}.dashboard-bottom{grid-template-columns:repeat(${bottomTablet.count},minmax(0,1fr))}${spans(".dashboard-bottom", bottomTablet.units)}}@media(max-width:767px){.chart-row{grid-template-columns:repeat(${chartMobile.count},minmax(0,1fr))}${spans(".chart-row", chartMobile.units)}.dashboard-bottom{grid-template-columns:repeat(${bottomMobile.count},minmax(0,1fr))}${spans(".dashboard-bottom", bottomMobile.units)}}`;
}

function dashboardPanelDefinitions(plan: VisualTargetPlan): Array<{ type: string; label: string; value: number; iconClass?: string; icon?: { viewBox: string; markup: string } }> {
  const owner = ownerByName(plan, "PanelGroup"); if (!owner) return [];
  const nodes = owner.templateStructure.nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const descendants = (rootId: string) => { const ids = new Set([rootId]); for (const node of nodes) if (node.parentId && ids.has(node.parentId)) ids.add(node.id); return nodes.filter((node) => ids.has(node.id) && node.id !== rootId); };
  const root = nodes.find((node) => node.primitive?.kind === "layout-row");
  return nodes.filter((node) => node.parentId === root?.id && node.primitive?.kind === "layout-column").map((column) => {
    const owned = descendants(column.id);
    const panel = owned.find((node) => node.classes.includes("card-panel"));
    const action = String(panel?.attributes["@click"] ?? "");
    const type = action.match(/['"]([^'"]+)['"]/)?.[1] ?? "panel";
    const labelNode = owned.find((node) => node.classes.includes("card-panel-text"));
    const label = labelNode?.content.filter((token) => token.kind === "text").map((token) => token.kind === "text" ? token.value : "").join(" ").trim() ?? type;
    const count = owned.find((node) => node.componentName === "CountTo");
    const value = numericAttribute(count?.attributes[":end-val"] ?? count?.attributes["end-val"]) ?? 0;
    const iconNode = owned.find((node) => node.componentName === "SvgIcon" && node.embeddedAssets?.length);
    const iconWrapper = owned.find((node) => node.classes.includes("card-panel-icon-wrapper"));
    const iconClass = iconWrapper?.classes.find((name) => name.startsWith("icon-"));
    const asset = iconNode?.embeddedAssets?.[0];
    return { type, label, value, iconClass, icon: asset ? { viewBox: asset.viewBox, markup: asset.markup } : undefined };
  });
}

function generatedApp(plan: VisualTargetPlan, routePlan: SpaRouteShellPlan): string {
  const compiledPages = Object.fromEntries(([
    ["login", ownerByName(plan, "Login")],
    ["permission", ownerByName(plan, "DirectivePermission")],
    ["switchRoles", ownerByName(plan, "SwitchRoles")],
    ["transactionTable", ownerByName(plan, "TransactionTable")],
    ["boxCard", ownerByName(plan, "BoxCard")],
  ] as const).flatMap(([name, owner]) => owner ? [[name, compilePrimitiveDom(owner.templateStructure, name)] as const] : []));
  const capabilities = {
    dashboard: hasOwner(plan, "DashboardAdmin"), login: hasOwner(plan, "Login"), permission: hasOwner(plan, "DirectivePermission"),
    panelGroup: hasOwner(plan, "PanelGroup"), line: hasOwner(plan, "LineChart"), radar: hasOwner(plan, "RaddarChart"),
    pie: hasOwner(plan, "PieChart"), bar: hasOwner(plan, "BarChart"), table: hasOwner(plan, "TransactionTable"),
    todo: hasOwner(plan, "TodoList"), box: hasOwner(plan, "BoxCard"),
    permissionTags: ownerByName(plan, "DirectivePermission")?.templateStructure.primitiveCounts.tag ?? 0,
    permissionTabs: ownerByName(plan, "DirectivePermission")?.templateStructure.primitiveCounts["tab-pane"] ?? 0,
    nested: plan.boundaries.some((item) => item.route.includes("/nested/")),
  };
  const guard = routePlan.transitions.find((transition) => transition.action === "guard-redirect");
  const chartDefinitions = Object.fromEntries(["LineChart", "RaddarChart", "PieChart", "BarChart"].flatMap((name) => {
    const owner = chartOwnerByName(plan, name); const slice = owner?.chart?.optionSlices[0];
    return owner?.chart && slice?.option ? [[name, { option: slice.option, height: slice.containerHeight, staticBindings: owner.chart.staticBindings, references: slice.references }]] : [];
  }));
  const panelDefinitions = dashboardPanelDefinitions(plan);
  const dashboardBindings = ownerByName(plan, "DashboardAdmin")?.dataCardinality.staticBindings ?? {};
  const todoBindings = ownerByName(plan, "TodoList")?.dataCardinality.staticBindings ?? {};
  const apiFixtureDefinitions = Object.fromEntries(plan.owners.filter((owner) => owner.apiFixtures.length > 0).map((owner) => [owner.componentName, owner.apiFixtures[0]]));
  const boxImage = ownerByName(plan, "BoxCard")?.templateStructure.nodes.find((node) => node.tag === "img" && typeof node.attributes.src === "string")?.attributes.src ?? "";
  const avatarFixture = routePlan.fixtureDependencies.find((fixture) => fixture.resourceType === "image" && fixture.path?.endsWith(".gif"));
  const avatarImage = avatarFixture?.hostname && avatarFixture.path ? `https://${avatarFixture.hostname}${avatarFixture.path}` : "";
  return `(() => {
  const app = document.querySelector('#app');
  const capabilities = ${JSON.stringify(capabilities, null, 2)};
  const chartDefinitions = ${JSON.stringify(chartDefinitions)};
  const panelDefinitions = ${JSON.stringify(panelDefinitions)};
  const dashboardBindings = ${JSON.stringify(dashboardBindings)};
  const todoBindings = ${JSON.stringify(todoBindings)};
  const apiFixtureDefinitions = ${JSON.stringify(apiFixtureDefinitions)};
  const boxImage = ${JSON.stringify(boxImage)};
  const avatarImage = ${JSON.stringify(avatarImage)};
  const guard = ${JSON.stringify(guard ? { from: guard.from, to: guard.to } : null)};
  const tokenKey = 'auto-v1-vue-admin-token';
  const state = { nested: false, menu1: false, permission: false, role: 'admin', lineType: 'newVisitis', charts: [] };
  const route = () => decodeURIComponent(location.hash.replace(/^#/, '') || '/');
  const routePath = () => route().split('?')[0] || '/';
  const routeLabel = (path) => path === '/dashboard' ? 'Dashboard' : path === '/permission/directive' ? 'Directive Permission' : path === '/nested/menu1/menu1-1' ? 'Menu 1-1' : path === '/documentation/index' ? 'Documentation' : path;
  const targetRedirect = () => new URLSearchParams(route().split('?')[1] || '').get('redirect') || '/dashboard';
  const hasToken = () => localStorage.getItem(tokenKey) === 'admin';
  const navigate = (path, replace = false) => {
    const target = path.startsWith('#') ? path : '#' + path;
    if (replace) history.replaceState({ route: target }, '', target); else history.pushState({ route: target }, '', target);
    render();
  };
  const link = (path, label) => '<a href="#' + path + '" class="' + (routePath() === path ? 'router-link-active' : '') + '"><li class="el-menu-item">' + label + '</li></a>';
  const submenu = (id, label, body) => '<div class="el-submenu"><div class="el-submenu__title" data-submenu="' + id + '"><span>' + label + '</span><b>⌄</b></div><ul class="el-menu el-menu--inline ' + (state[id] ? 'is-open' : '') + '">' + body + '</ul></div>';
  const sidebar = () => '<aside class="sidebar-container" data-visual-owner="shell:sidebar"><div class="sidebar-title">Vue Element Admin</div><ul class="el-menu">' +
    link('/dashboard','Dashboard') + link('/documentation/index','Documentation') +
    submenu('permission','Permission',link('/permission/directive','Directive Permission')) +
    submenu('nested','Nested Routes',submenu('menu1','Menu 1',link('/nested/menu1/menu1-1','Menu 1-1'))) + '</ul></aside>';
  const primitivePages = ${JSON.stringify(compiledPages)};
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[character]));
  const primitiveNodeMap = (compilation) => new Map(compilation.nodes.flatMap((node) => [[node.sourceNodeId, node], [node.id, node]]));
  const expressionValue = (expression, context) => expression.split('.').reduce((value, key) => value == null ? undefined : value[key], context);
  const materializeStatic = (value, context = {}) => {
    if (Array.isArray(value)) return value.map((item) => materializeStatic(item, context));
    if (!value || typeof value !== 'object') return value;
    if ('$reference' in value) {
      const path = String(value.$reference).replace(/^this\./, '');
      const resolved = expressionValue(path, context);
      return resolved === undefined ? null : materializeStatic(resolved, context);
    }
    if ('$unsupported' in value) return undefined;
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      const resolved = materializeStatic(item, context);
      if (key.startsWith('$spread:')) { if (resolved && typeof resolved === 'object') Object.assign(output, resolved); continue; }
      if (resolved !== undefined) output[key] = resolved;
    }
    return output;
  };
  const materializedBindings = (bindings) => { const context = { ...bindings }; for (const key of Object.keys(context)) context[key] = materializeStatic(context[key], context); return context; };
  const dashboardData = materializedBindings(dashboardBindings);
  const todoData = Object.values(materializedBindings(todoBindings)).find((value) => Array.isArray(value) && value.some((item) => item && typeof item === 'object' && 'text' in item)) || [];
  const transactionResponsibility = apiFixtureDefinitions.TransactionTable;
  const transactionData = Array.isArray(transactionResponsibility?.fixture?.materializedValue) ? transactionResponsibility.fixture.materializedValue : [];
  const chartHeight = (name, fallback) => chartDefinitions[name]?.height || fallback;
  const chartOption = (name, context = {}) => { const definition = chartDefinitions[name]; return definition ? materializeStatic(definition.option, { ...materializedBindings(definition.staticBindings), ...context }) : {}; };
  const textValue = (value, context) => escapeHtml(value.replace(/{{\s*([^}]+)\s*}}/g, (_, expression) => expressionValue(expression.trim(), context) ?? ''));
  const roleList = (expression) => [...String(expression || '').matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
  const isVisible = (node, context) => {
    const permission = node.attributes['v-permission'];
    if (permission && !roleList(permission).includes(context.role)) return false;
    for (const condition of node.conditions) if (condition.includes('checkPermission') && !roleList(condition).includes(context.role)) return false;
    if (node.renderStrategy === 'dialog' && !context.showDialog) return false;
    return true;
  };
  const styleValue = (node) => Object.entries(node.inlineStyle).map(([name,value]) => name + ':' + value).join(';');
  const actionValue = (compilation, node) => compilation.interactions.find((binding) => binding.sourceNodeId === node.sourceNodeId)?.expression || '';
  const normalAttributes = (node, context) => {
    const values = [];
    for (const [name, raw] of Object.entries(node.attributes)) {
      if (name.startsWith(':') || name.startsWith('v-') || ['content','label','manual','placement','prop','ref','size'].includes(name)) continue;
      if (name === 'type' && ['button','tag','tabs'].includes(node.renderStrategy)) continue;
      const value = raw === true ? name : String(raw);
      values.push(' ' + escapeHtml(name) + '="' + escapeHtml(value) + '"');
    }
    const model = node.attributes['v-model'];
    if (model && node.renderStrategy === 'input') values.push(' value="' + escapeHtml(expressionValue(String(model), context) ?? '') + '"');
    const boundType = node.attributes[':type'];
    if (boundType && node.renderStrategy === 'input') values.push(' type="' + escapeHtml(expressionValue(String(boundType), context) ?? 'text') + '"');
    return values.join('');
  };
  const renderCompilation = (compilation, context, owner) => {
    if (!compilation) return '';
    const byId = primitiveNodeMap(compilation);
    const renderToken = (token) => token.kind === 'text' ? textValue(token.value, context) : renderNode(byId.get(token.nodeId));
    const common = (node, extraClass = '') => {
      const classes = [...node.classes, extraClass].filter(Boolean).join(' ');
      const style = styleValue(node);
      const action = actionValue(compilation, node);
      return ' data-primitive-node="' + node.id + '"' + (classes ? ' class="' + escapeHtml(classes) + '"' : '') + (style ? ' style="' + escapeHtml(style) + '"' : '') + (action ? ' data-action="' + escapeHtml(action) + '"' : '');
    };
    const children = (node) => node.content.map(renderToken).join('');
    const renderNode = (node) => {
      if (!node || !isVisible(node, context)) return '';
      if (node.componentName === 'SvgIcon') {
        const literal = node.attributes['icon-class'];
        const bound = String(node.attributes[':icon-class'] || '');
        const ternary = bound.match(/\\?\\s*['"]([^'"]+)['"]\\s*:\\s*['"]([^'"]+)['"]/);
        const iconName = typeof literal === 'string' ? literal : ternary ? (context.passwordType === 'password' ? ternary[1] : ternary[2]) : '';
        const asset = (node.embeddedAssets || []).find((candidate) => candidate.name === iconName) || (node.embeddedAssets || [])[0];
        if (asset) return '<svg viewBox="' + escapeHtml(asset.viewBox) + '" aria-hidden="true"' + common(node, 'svg-icon') + '>' + asset.markup + '</svg>';
        return '<span' + common(node, 'svg-icon') + '></span>';
      }
      if (node.componentName === 'SwitchRoles') return renderCompilation(primitivePages.switchRoles, context, 'SwitchRoles');
      if (node.componentName === 'SocialSign') return '<div' + common(node, 'social-sign') + '></div>';
      if (node.renderStrategy === 'table') {
        const responsibility = context.tableResponsibility || {};
        const fields = responsibility.renderedFields || [];
        const rows = expressionValue(String(node.attributes[':data'] || ''), context) || [];
        const columnClass = (field) => field.align === 'center' ? ' class="is-center"' : '';
        const colWidth = (field) => field.width ? ' width="' + field.width + '"' : field.minWidth ? ' style="min-width:' + field.minWidth + 'px"' : '';
        const mappedFilter = (field, value) => {
          let output = value;
          for (const filter of field.filters || []) {
            const valueMap = responsibility.filterValueMaps?.[filter];
            if (valueMap && Object.prototype.hasOwnProperty.call(valueMap, output)) output = valueMap[output];
            else if (/thousand/i.test(filter)) output = Number(output || 0).toLocaleString('en-US', { maximumFractionDigits: 20 });
            else if (/order.*no/i.test(filter)) output = String(output ?? '').substring(0, 30);
          }
          return String(field.prefix || '') + String(output ?? '') + String(field.suffix || '');
        };
        const header = fields.map((field) => '<th colspan="1" rowspan="1"' + columnClass(field) + '><div class="cell">' + escapeHtml(field.label || field.field) + '</div></th>').join('');
        const cols = fields.map((field, index) => '<col name="generated-table-column-' + index + '"' + colWidth(field) + '>').join('');
        const body = rows.map((row) => '<tr class="el-table__row">' + fields.map((field) => {
          const raw = row?.[field.field];
          const text = field.tagged ? String(field.prefix || '') + String(raw ?? '') + String(field.suffix || '') : mappedFilter(field, raw);
          const tagType = field.tagged ? (responsibility.filterValueMaps?.[field.filters?.[0]]?.[raw] || raw) : '';
          const content = field.tagged ? '<span class="el-tag el-tag--' + escapeHtml(tagType) + '">' + escapeHtml(text) + '</span>' : escapeHtml(text);
          return '<td rowspan="1" colspan="1"' + columnClass(field) + '><div class="cell">' + content + '</div></td>';
        }).join('') + '</tr>').join('');
        return '<div' + common(node) + '><div class="hidden-columns"></div><div class="el-table__header-wrapper"><table class="el-table__header"><colgroup>' + cols + '</colgroup><thead class="has-gutter"><tr>' + header + '</tr></thead></table></div><div class="el-table__body-wrapper is-scrolling-none"><table class="el-table__body"><colgroup>' + cols + '</colgroup><tbody>' + body + '</tbody></table></div><div class="el-table__column-resize-proxy" style="display:none"></div></div>';
      }
      if (node.renderStrategy === 'table-column') return '';
      if (node.renderStrategy === 'card') {
        const childNodes = node.content.filter((token) => token.kind === 'node').map((token) => byId.get(token.nodeId)).filter(Boolean);
        const headerNodes = childNodes.filter((child) => child.slot === 'header');
        const bodyNodes = childNodes.filter((child) => child.slot !== 'header');
        const header = headerNodes.length ? '<div class="el-card__header">' + headerNodes.map(renderNode).join('') + '</div>' : '';
        return '<div' + common(node) + '>' + header + '<div class="el-card__body">' + bodyNodes.map(renderNode).join('') + '</div></div>';
      }
      if (node.renderStrategy === 'progress') {
        const expression = String(node.attributes[':percentage'] ?? node.attributes.percentage ?? '0');
        const resolved = expressionValue(expression, context);
        const literalPercentage = Number(expression);
        const percentage = Number(resolved ?? (Number.isFinite(literalPercentage) ? literalPercentage : 0));
        return '<div' + common(node) + '><div class="el-progress-bar"><div class="el-progress-bar__outer"><div class="el-progress-bar__inner" style="width:' + percentage + '%"></div></div></div><div class="el-progress__text">' + (node.attributes.status === 'success' ? '✓' : percentage + '%') + '</div></div>';
      }
      if (node.componentName === 'PanThumb') {
        const image = context.avatar || '';
        return '<div' + common(node, 'pan-item') + '><div class="pan-info"><div class="pan-info-roles-container"></div></div><div class="pan-thumb"' + (image ? ' style="background-image:url(' + escapeHtml(image) + ')"' : '') + '></div></div>';
      }
      if (node.componentName === 'Mallki') {
        const text = String(node.attributes.text || 'vue-element-admin');
        const className = String(node.attributes['class-name'] || '');
        return '<a href="#"' + common(node, 'link--mallki ' + className) + '>' + escapeHtml(text) + '<span data-letters="' + escapeHtml(text) + '"></span><span data-letters="' + escapeHtml(text) + '"></span></a>';
      }
      if (node.renderStrategy === 'input') {
        const attributes = normalAttributes(node, context);
        return '<div' + common(node) + '><input class="el-input__inner"' + attributes + '></div>';
      }
      if (node.renderStrategy === 'form-field') return '<div' + common(node) + '><div class="el-form-item__content">' + children(node) + '</div></div>';
      if (node.renderStrategy === 'tooltip') return children(node);
      if (node.renderStrategy === 'button') {
        const action = actionValue(compilation, node);
        const type = action.includes('handleLogin') ? 'submit' : 'button';
        return '<button type="' + type + '"' + common(node) + '>' + children(node).trim() + '</button>';
      }
      if (node.renderStrategy === 'radio-group') return '<div' + common(node) + '>' + children(node) + '</div>';
      if (node.renderStrategy === 'radio-button') {
        const label = String(node.attributes.label || '');
        const active = label === context.role ? ' is-active' : '';
        return '<label' + common(node, active) + ' data-role="' + escapeHtml(label) + '"><span class="el-radio-button__inner">' + escapeHtml(label) + '</span></label>';
      }
      if (node.renderStrategy === 'tag') return '<span' + common(node) + '>' + children(node).trim() + '</span>';
      if (node.renderStrategy === 'tabs') {
        const panes = node.content.filter((token) => token.kind === 'node').map((token) => byId.get(token.nodeId)).filter((pane) => pane && pane.renderStrategy === 'tab-pane' && isVisible(pane, context));
        const header = panes.map((pane, index) => '<div class="el-tabs__item' + (index === 0 ? ' is-active' : '') + '">' + escapeHtml(pane.attributes.label || '') + '</div>').join('');
        const content = panes.length ? '<div class="el-tab-pane">' + children(panes[0]).trim() + '</div>' : '';
        return '<div' + common(node) + '><div class="el-tabs__header"><div class="el-tabs__nav-wrap"><div class="el-tabs__nav">' + header + '</div></div></div><div class="el-tabs__content">' + content + '</div></div>';
      }
      if (node.renderStrategy === 'tab-pane') return '<div' + common(node) + '>' + children(node) + '</div>';
      if (node.renderStrategy === 'dialog') return '<div' + common(node) + '>' + children(node) + '</div>';
      if (node.renderStrategy === 'custom-component') return '<div' + common(node, 'generated-component generated-' + node.componentName.toLowerCase()) + '>' + children(node) + '</div>';
      if (node.renderTag === 'br') return '<br' + common(node) + '>';
      return '<' + node.renderTag + common(node) + normalAttributes(node, context) + '>' + children(node) + '</' + node.renderTag + '>';
    };
    const html = compilation.roots.map((id) => renderNode(byId.get(id))).join('');
    return owner ? html.replace('data-primitive-node=', 'data-visual-owner="' + owner + '" data-primitive-node=') : html;
  };
  const login = () => renderCompilation(primitivePages.login, { loginForm: { username: 'admin', password: '111111' }, passwordType: 'password', role: state.role, showDialog: false }, 'Login');
  const panel = (definition) => '<div class="card-panel-col"><div class="card-panel" data-dashboard-type="' + escapeHtml(definition.type) + '"><div class="card-panel-icon-wrapper ' + escapeHtml(definition.iconClass || '') + '">' + (definition.icon ? '<svg class="svg-icon card-panel-icon" viewBox="' + escapeHtml(definition.icon.viewBox) + '" aria-hidden="true">' + definition.icon.markup + '</svg>' : '') + '</div><div class="card-panel-description"><div class="card-panel-text">' + escapeHtml(definition.label) + '</div><span class="card-panel-num">' + Number(definition.value).toLocaleString('en-US') + '</span></div></div></div>';
  const todoItems = () => todoData.map((todo, index) => '<li class="' + (todo.done ? 'completed' : '') + '"><div class="view"><input id="todo-' + index + '" class="toggle" type="checkbox" ' + (todo.done ? 'checked' : '') + '><label for="todo-' + index + '">' + escapeHtml(todo.text) + '</label><button class="destroy"></button></div></li>').join('');
  const dashboard = () => '<section class="dashboard-container" data-visual-owner="DashboardAdmin"><div class="dashboard-editor-container">' +
    (capabilities.panelGroup ? '<div class="panel-group" data-visual-owner="PanelGroup">' + panelDefinitions.map(panel).join('') + '</div>' : '') +
    (capabilities.line ? '<div class="line-chart-wrapper" style="background:#fff;padding:16px 16px 0;margin-bottom:32px"><div id="auto-line-chart" class="dashboard-chart line-chart" style="height:' + chartHeight('LineChart','350px') + ';width:100%" data-visual-owner="LineChart"></div></div>' : '') +
    '<div class="chart-row">' + (capabilities.radar ? '<div class="chart-wrapper"><div id="auto-radar-chart" class="dashboard-chart" style="height:' + chartHeight('RaddarChart','300px') + ';width:100%" data-visual-owner="RaddarChart"></div></div>' : '') + (capabilities.pie ? '<div class="chart-wrapper"><div id="auto-pie-chart" class="dashboard-chart" style="height:' + chartHeight('PieChart','300px') + ';width:100%" data-visual-owner="PieChart"></div></div>' : '') + (capabilities.bar ? '<div class="chart-wrapper"><div id="auto-bar-chart" class="dashboard-chart" style="height:' + chartHeight('BarChart','300px') + ';width:100%" data-visual-owner="BarChart"></div></div>' : '') + '</div>' +
    '<div class="dashboard-bottom">' +
    (capabilities.table ? '<div class="dashboard-bottom-col">' + renderCompilation(primitivePages.transactionTable, { list: transactionData, tableResponsibility: transactionResponsibility }, 'TransactionTable') + '</div>' : '') +
    (capabilities.todo ? '<div class="dashboard-bottom-col"><section class="todoapp" data-visual-owner="TodoList"><header class="header"><input class="new-todo" placeholder="Todo List"></header><section class="main"><input id="toggle-all" class="toggle-all" type="checkbox"><label for="toggle-all">Mark all as complete</label><ul class="todo-list">' + todoItems() + '</ul></section><footer class="footer"><span class="todo-count"><strong>3</strong> items left</span><ul class="filters"><li><a class="selected">All</a></li><li><a>Active</a></li><li><a>Completed</a></li></ul></footer></section></div>' : '') +
    (capabilities.box ? '<div class="dashboard-bottom-col">' + renderCompilation(primitivePages.boxCard, { avatar: avatarImage, boxImage }, 'BoxCard') + '</div>' : '') + '</div></div></section>';
  const permission = () => renderCompilation(primitivePages.permission, { role: state.role, roles: '[ \"' + state.role + '\" ]', switchRoles: state.role, showDialog: false }, 'DirectivePermission');
  const page = () => { const path = routePath(); if (path === '/dashboard') return dashboard(); if (path === '/permission/directive') return permission(); if (path === '/nested/menu1/menu1-1') return '<section class="nested-page"><h2>Menu 1-1</h2></section>'; if (path === '/documentation/index') return '<section class="documentation-page"><h2>Documentation</h2></section>'; return '<section><h2>Not Found</h2></section>'; };
  const disposeCharts = () => { for (const chart of state.charts) chart.dispose?.(); state.charts = []; };
  const initChart = (id, option) => { const node = document.getElementById(id); if (!node || !window.echarts) return; const chart = window.echarts.init(node, 'macarons'); chart.setOption(option); state.charts.push(chart); };
  const initCharts = () => { disposeCharts(); if (routePath() !== '/dashboard') return;
    const lineData = dashboardData.lineChartData?.[state.lineType] || {};
    initChart('auto-line-chart', chartOption('LineChart', lineData));
    initChart('auto-radar-chart', chartOption('RaddarChart'));
    initChart('auto-pie-chart', chartOption('PieChart'));
    initChart('auto-bar-chart', chartOption('BarChart'));
  };
  const bind = () => {
    app.querySelectorAll('a[href]').forEach((anchor) => anchor.addEventListener('click', (event) => { event.preventDefault(); navigate(anchor.getAttribute('href')); }));
    app.querySelectorAll('[data-submenu]').forEach((node) => node.addEventListener('click', () => { state[node.dataset.submenu] = !state[node.dataset.submenu]; render(); }));
    app.querySelectorAll('[data-dashboard-type]').forEach((node) => node.addEventListener('click', () => { state.lineType = node.dataset.dashboardType; initCharts(); }));
    app.querySelectorAll('[data-role]').forEach((node) => node.addEventListener('click', () => { state.role = node.dataset.role; render(); }));
    app.querySelector('.show-pwd')?.addEventListener('click', () => { const input = app.querySelector("input[placeholder='Password']"); input.type = input.type === 'password' ? 'text' : 'password'; input.focus(); });
    app.querySelectorAll('[data-action*="showDialog"]').forEach((node) => node.addEventListener('click', () => { state.showDialog = true; render(); }));
    app.querySelector('.login-form')?.addEventListener('submit', (event) => { event.preventDefault(); const user = app.querySelector("input[placeholder='Username']").value; const password = app.querySelector("input[placeholder='Password']").value; if (user === 'admin' && password.length >= 6) { localStorage.setItem(tokenKey,'admin'); navigate(targetRedirect(), true); } });
  };
  const render = () => { const path = routePath(); if (guard && path !== '/login' && !hasToken()) { navigate('/login?redirect=' + encodeURIComponent(path), true); return; } disposeCharts(); app.innerHTML = path === '/login' ? login() : '<div class="app-shell">' + sidebar() + '<div class="app-body"><header class="app-header"><span>' + escapeHtml(routeLabel(path)) + '</span><span>admin</span></header><main class="app-main app-main-' + path.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'') + '">' + page() + '</main></div></div>'; bind(); requestAnimationFrame(initCharts); };
  addEventListener('hashchange', render); addEventListener('popstate', render); addEventListener('resize', () => state.charts.forEach((chart) => chart.resize?.())); render();
})();`;
}

function generatedStyles(plan: VisualTargetPlan): string {
  const selectedOwners = ["Login", "DirectivePermission", "SwitchRoles", "DashboardAdmin", "PanelGroup", "TransactionTable", "TodoList", "BoxCard", "PanThumb", "Mallki"].flatMap((name) => {
    const owner = ownerByName(plan, name); return owner ? [owner] : [];
  });
  const compilations = selectedOwners.map((owner) => compilePrimitiveDom(owner.templateStructure, owner.componentName));
  const primitiveCss = compilations.map(materializePrimitiveCss).join("");
  const elementUiPrimitiveCss = compilations.map(materializeElementUiPrimitiveCss).join("");
  const sourceCss = selectedOwners.flatMap((owner) => owner.sourceStyleSheets.flatMap((style) => style.compiledCss ? [style.compiledCss] : [])).join("\n");
  return `*{box-sizing:border-box}html,body,#app{margin:0;height:100%;min-height:100%;font-family:"Helvetica Neue",Helvetica,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",Arial,sans-serif;color:#000;line-height:1.15}body{background:#f0f2f5}button{font:inherit}.login-container{min-height:100%;width:100%;background:#2d3a4b;overflow:hidden}.login-form{position:relative;width:520px;height:493.828125px;max-width:100%;padding:160px 35px 0;margin:0 auto;overflow:hidden}.title{margin:0 auto 40px;text-align:center;font-size:26px;color:#eee}.el-form-item{position:relative;display:block;height:auto;margin-bottom:22px;border:1px solid rgba(255,255,255,.12);border-radius:5px;background:rgba(0,0,0,.12)}.el-form-item__content{display:block;position:relative;font-size:14px;line-height:36px}.el-input__inner{width:100%;font-family:sans-serif;font-size:14px;line-height:36px}.svg-container{width:54px;flex:none;text-align:center;color:#889aa4}.svg-icon{width:1em;height:1em;vertical-align:-.15em;fill:currentColor;overflow:hidden}.el-form-item input{flex:1;height:45px;border:0;outline:0;background:transparent;color:#fff;padding:12px 5px}.show-pwd{border:0;background:transparent;color:#889aa4;padding:12px 18px;cursor:pointer}.el-button{font-size:14px;line-height:1;border:1px solid #dcdfe6;border-radius:4px;background:#fff;color:#606266;padding:10px 20px;cursor:pointer}.el-button--primary{background:#1890ff;border-color:#1890ff;color:#fff}.login-submit{width:100%;margin-bottom:30px}.tips{font-size:14px;color:#fff;margin-bottom:10px}.tips span:first-child{margin-right:16px}.thirdparty-button{position:absolute;right:35px;bottom:6px}.app-shell{min-height:100vh;display:flex}.sidebar-container{width:210px;flex:none;background:#304156;color:#bfcbd9;min-height:100vh}.sidebar-title{height:50px;display:flex;align-items:center;padding:0 20px;color:#fff;font-weight:700}.el-menu{list-style:none;margin:0;padding:0}.el-menu a{color:inherit;text-decoration:none}.el-menu-item,.el-submenu__title{min-height:56px;display:flex;align-items:center;padding:0 20px;cursor:pointer}.el-submenu__title{justify-content:space-between}.el-menu-item:hover,.el-submenu__title:hover,.router-link-active .el-menu-item{background:#263445;color:#409eff}.el-menu--inline{display:none;background:#1f2d3d}.el-menu--inline.is-open{display:block}.el-menu--inline .el-menu-item,.el-menu--inline .el-submenu__title{padding-left:40px}.el-menu--inline .el-menu--inline .el-menu-item{padding-left:60px}.app-body{flex:1;min-width:0}.app-header{height:84px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#fff;box-shadow:0 1px 4px rgba(0,21,41,.08)}.app-main{position:relative;min-height:calc(100vh - 84px);overflow:hidden;background:transparent;color:#000;line-height:1.15}.dashboard-editor-container{padding:32px;background:#f0f2f5;min-height:calc(100vh - 84px)}.panel-group{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-bottom:32px}.card-panel{width:100%;height:108px;border:0;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 20px;box-shadow:0 2px 12px rgba(0,0,0,.04)}.card-panel-icon-wrapper{font-size:44px;color:#40c9c6}.card-panel-description{display:flex;flex-direction:column;text-align:left}.card-panel-text{color:#8c8c8c;font-weight:700}.card-panel-num{margin-top:12px;font-size:20px;color:#666}.line-chart-wrapper,.chart-card,.transaction-table,.todoapp,.box-card-component{background:#fff}.line-chart-wrapper{padding:16px 16px 0;margin-bottom:32px}.line-chart{height:350px}.chart-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:32px;margin-bottom:32px}.chart-card{padding:16px}.chart-card .dashboard-chart{height:300px}.dashboard-bottom{display:grid;grid-template-columns:2fr 1fr 1fr;gap:32px}.todoapp{padding:18px}.new-todo{width:100%;border:0;border-bottom:1px solid #ddd;padding:12px;font-size:18px}.todo-list{list-style:none;padding:0}.todo-list li{padding:10px;border-bottom:1px solid #eee}.todo-list .completed{text-decoration:line-through;color:#aaa}.footer{padding-top:10px}.app-container{padding:20px;background:transparent;min-height:100%}.role-switch{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:15px}.role-switch>div{width:100%;margin-bottom:5px}.el-radio-group{display:inline-block;line-height:1;font-size:0;vertical-align:middle}.el-radio-button{position:relative;display:inline-block;font-size:0;line-height:1}.el-radio-button__inner{display:inline-block;line-height:1;white-space:nowrap;vertical-align:middle;background:#fff;border:1px solid #dcdfe6;border-left:0;color:#606266;text-align:center;box-sizing:border-box;outline:0;margin:0;padding:10px 20px;font-weight:500;font-size:14px;border-radius:0;cursor:pointer}.el-radio-button:first-child .el-radio-button__inner{border-left:1px solid #dcdfe6;border-radius:4px 0 0 4px}.el-radio-button:last-child .el-radio-button__inner{border-radius:0 4px 4px 0}.el-radio-button.is-active .el-radio-button__inner{color:#fff;background-color:#409eff;border-color:#409eff;box-shadow:-1px 0 0 0 #409eff}.el-tag{background-color:#ecf5ff;display:inline-block;height:28px;padding:0 10px;line-height:26px;font-size:12px;color:#409eff;border:1px solid #d9ecff;border-radius:4px;white-space:nowrap}.el-tag--info{background-color:#f4f4f5;border-color:#e9e9eb;color:#909399}.el-tag--success{background-color:#f0f9eb;border-color:#e1f3d8;color:#67c23a}.el-tag--danger{background-color:#fef0f0;border-color:#fde2e2;color:#f56c6c}.permission-tag{height:24px;padding:0 8px;line-height:22px}.app-container aside{padding:8px 24px;margin-bottom:20px;border-left:2px solid #e6e6e6;background:#eef1f6;color:#2c3e50;font-size:16px;line-height:32px}.el-tabs--border-card{background:#fff;border:1px solid #dcdfe6;box-shadow:0 2px 4px 0 rgba(0,0,0,.12),0 0 6px 0 rgba(0,0,0,.04)}.el-tabs--border-card>.el-tabs__header{background-color:#f5f7fa;border-bottom:1px solid #e4e7ed;margin:0}.el-tabs__nav{display:flex}.el-tabs__item{height:38px;line-height:38px;padding:0 20px;font-size:14px;color:#909399;border-right:1px solid #dcdfe6;cursor:pointer}.el-tabs__item.is-active{color:#409eff;background-color:#fff;border-bottom-color:#fff}.el-tabs--border-card>.el-tabs__content{padding:15px}.el-tab-pane{font-size:16px}.permission-groups{margin-top:30px}.permission-row{margin-bottom:15px}.permission-alert{width:320px;margin-top:15px;background:#f0f9eb;color:#67c23a;padding:8px 16px;border-radius:4px;display:inline-block}.permission-sourceCode{margin-left:15px}.permission-tag{margin:0 4px}.permission-check{margin-top:60px}.permission-check aside{padding:8px 24px;margin-bottom:20px;background:#eef1f6;color:#2c3e50;line-height:32px}.permission-tabs{width:550px;border:1px solid #dcdfe6;background:#fff}.permission-tabs button{border:0;border-right:1px solid #dcdfe6;border-bottom:1px solid #dcdfe6;background:#f5f7fa;padding:12px 20px}.permission-tabs .active{color:#409eff;background:#fff;border-bottom-color:#fff}.permission-tab-content{padding:24px}.app-main-permission-directive,.app-main-nested-menu1-menu1-1,.app-main-documentation-index{background:#fff}.nested-page,.documentation-page{padding:32px;background:#fff;margin:32px}
@media(max-width:1024px){.dashboard-editor-container{padding:16px}.panel-group{grid-template-columns:repeat(2,1fr)}.chart-row{grid-template-columns:1fr}.dashboard-bottom{grid-template-columns:1fr}.chart-card .dashboard-chart{height:280px}}
@media(max-width:991px){.sidebar-container{display:none}.app-body{width:100%}}
@media(max-width:600px){.login-form{padding-top:160px}.thirdparty-button{display:none}.sidebar-container{display:none}.sidebar-title{font-size:13px;padding:0 10px}.el-menu-item,.el-submenu__title{padding:0 10px;font-size:13px}.dashboard-editor-container{padding:10px}.panel-group{grid-template-columns:1fr;gap:10px}.card-panel{height:88px}.line-chart{height:280px}.app-container{padding:16px}}
${dashboardGridCss(plan)}
${primitiveCss}
${elementUiPrimitiveCss}
${sourceCss}
${dashboardEvidenceCss(plan)}`;
}

function generatedIndex(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vue Element Admin Auto v1</title><link rel="stylesheet" href="/styles.css"></head><body><div id="app"></div><script src="/vendor/echarts.min.js"></script><script src="/vendor/macarons.js"></script><script src="/app.js"></script></body></html>`;
}

function generatedServer(): string {
  return `import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { extname, join } from 'node:path'; import { fileURLToPath } from 'node:url';
const root=join(fileURLToPath(new URL('.',import.meta.url)),'public'); const port=Number(process.env.PORT||9529); const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
createServer(async(req,res)=>{try{const pathname=new URL(req.url||'/', 'http://localhost').pathname; const path=join(root,pathname==='/'?'index.html':pathname); const body=await readFile(path); res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream','cache-control':'no-store'});res.end(body)}catch{const body=await readFile(join(root,'index.html'));res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(body)}}).listen(port,'127.0.0.1',()=>console.log('auto visual target http://127.0.0.1:'+port));`;
}

export function generateVisualTargetArtifact(plan: VisualTargetPlan, routePlan: SpaRouteShellPlan): GeneratedVisualTargetArtifact {
  if (plan.unresolved.length > 0) throw new Error(`visual target plan has ${plan.unresolved.length} unresolved route(s)`);
  const files = [file("public/index.html", generatedIndex()), file("public/app.js", generatedApp(plan, routePlan)), file("public/styles.css", generatedStyles(plan)), file("server.mjs", generatedServer())];
  return {
    schemaVersion: "1.0", kind: "generated-visual-target-artifact", reviewRequired: true, fullGeneratedApplication: true, generatedVisualDom: true, files,
    metrics: (() => {
      const compilations = ["Login", "DirectivePermission", "SwitchRoles", "TransactionTable", "BoxCard"].flatMap((name) => {
        const owner = ownerByName(plan, name); return owner ? [compilePrimitiveDom(owner.templateStructure)] : [];
      });
      return { generatedFiles: files.length, generatedLines: files.reduce((sum, item) => sum + item.lines, 0), visualBoundaries: plan.metrics.boundaries, visualOwners: plan.metrics.owners, chartOwners: plan.metrics.chartOwners, templateNodes: plan.owners.reduce((sum, owner) => sum + owner.templateStructure.nodes.length, 0), elementUiPrimitives: plan.owners.reduce((sum, owner) => sum + owner.templateStructure.nodes.filter((node) => node.primitive).length, 0), responsiveGridNodes: plan.owners.reduce((sum, owner) => sum + owner.templateStructure.responsiveGridNodes, 0), primitiveDomNodes: compilations.reduce((sum, item) => sum + item.metrics.compiledNodes, 0), primitiveStyleRules: compilations.reduce((sum, item) => sum + item.styleRules.length, 0), primitiveInteractionBindings: compilations.reduce((sum, item) => sum + item.interactions.length, 0), modelCalls: 0, manualEdits: 0, manualEditedLines: 0, repairIterations: 0, qualityRuns: 0 };
    })(),
    limitations: [
      "the target is a deterministic first-pass visual scaffold generated from responsibility ownership, not copied from the reviewed target",
      "acceptance selectors are preserved only for quality evaluation; data-visual-owner selectors remain the implementation ownership boundary",
      "selected Element UI primitives are compiled from template/style evidence; unsupported primitives remain explicit review boundaries",
      "static data and ECharts option slices are consumed when safely representable; unsupported expressions remain explicit review boundaries",
      "the first Semantic Gold+ run must be recorded before any manual repair",
    ],
  };
}
