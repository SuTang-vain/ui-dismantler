#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, cpSync, existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import * as csstree from 'css-tree';
import { parse as parseJs } from 'acorn';
import { simple as walkJs } from 'acorn-walk';

const [sourceArg, outArg, globalName = 'DismantledLibrary', fileStem = 'dismantled'] = process.argv.slice(2);
if (!sourceArg || !outArg) {
  console.error('usage: node scripts/transpile_self_contained_case.mjs <source.html> <lib-dir> [GlobalName] [file-stem]');
  process.exit(2);
}
const sourcePath = resolve(sourceArg);
const outDir = resolve(outArg);
const source = readFileSync(sourcePath, 'utf8');
const dom = new JSDOM(source);
const document = dom.window.document;
const cssSource = [...document.querySelectorAll('style')].map((node) => node.textContent || '').join('\n');
const executableScriptType = (type) => {
  const normalized = (type || '').trim().toLowerCase().split(';')[0];
  return !normalized || normalized === 'module' || /^(?:text|application)\/(?:java|ecma)script$/.test(normalized);
};
const scriptNodes = [...document.querySelectorAll('script:not([src])')];
const executableScripts = scriptNodes.filter((node) => executableScriptType(node.getAttribute('type')));
const skippedScripts = scriptNodes.length - executableScripts.length;
const scriptSource = executableScripts.map((node) => node.textContent || '').join('\n;\n');

let cssAst;
try { cssAst = csstree.parse(cssSource, { positions: true, parseValue: true, parseCustomProperty: true }); }
catch (error) {
  console.warn(`WARN: CSS parser recovered from archive stylesheet: ${error.message}`);
  cssAst = csstree.parse(cssSource, { positions: true, parseValue: false, parseCustomProperty: false, onParseError: () => {} });
}
const classNames = new Set();
const idNames = new Set();
for (const match of scriptSource.matchAll(/getElementById\(\s*['"]([^'"]+)['"]|id=["']([^"']+)["']/g)) idNames.add(match[1] || match[2]);
for (const match of scriptSource.matchAll(/classList\.(?:add|remove|toggle|contains)\(\s*['"]([^'"]+)['"]/g)) classNames.add(match[1]);
csstree.walk(cssAst, (node) => {
  if (node.type === 'ClassSelector') classNames.add(node.name);
  if (node.type === 'IdSelector') idNames.add(node.name);
});
for (const element of document.querySelectorAll('[class]')) for (const name of element.classList) classNames.add(name);
for (const element of document.querySelectorAll('[id]')) idNames.add(element.id);
const semanticEnumClasses = new Set([...scriptSource.matchAll(/\btype\s*:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]));
for (const name of semanticEnumClasses) classNames.delete(name);

const prefixed = (name) => name.startsWith('sg-') ? name : `sg-${name}`;
const classMap = new Map([...classNames].map((name) => [name, prefixed(name)]));
const idMap = new Map([...idNames].map((name) => [name, prefixed(name)]));

for (const element of document.querySelectorAll('[class]')) element.setAttribute('class', [...element.classList].map((name) => classMap.get(name) || name).join(' '));
for (const element of document.querySelectorAll('[id]')) element.id = idMap.get(element.id) || element.id;
for (const element of document.querySelectorAll('[data-tab], [data-target], [aria-controls], [aria-labelledby], [for], [href^="#"]')) {
  for (const attribute of ['data-tab', 'data-target', 'aria-controls', 'aria-labelledby', 'for', 'href']) {
    const raw = element.getAttribute(attribute);
    if (!raw) continue;
    const rewritten = raw.split(/\s+/).map((value) => {
      const hash = value.startsWith('#');
      const key = hash ? value.slice(1) : value;
      const mapped = idMap.get(key);
      return mapped ? `${hash ? '#' : ''}${mapped}` : value;
    }).join(' ');
    element.setAttribute(attribute, rewritten);
  }
}
for (const element of document.querySelectorAll('[data-p]')) {
  const value = element.getAttribute('data-p');
  if (value && idMap.has(value)) element.setAttribute('data-p', idMap.get(value));
}
for (const element of document.querySelectorAll('[data-group]')) {
  const value = element.getAttribute('data-group');
  if (value && idMap.has(value)) element.setAttribute('data-group', idMap.get(value));
}
for (const element of document.querySelectorAll('[src]')) {
  const value = element.getAttribute('src');
  if (value) element.setAttribute('src', value.replace(/^(?:\.\/)?(?:image|images)\//, '../assets/'));
}
for (const tabs of document.querySelectorAll(`.${classMap.get('tabs') || 'sg-tabs'}`)) tabs.setAttribute('role', 'tablist');
for (const button of document.querySelectorAll(`.${classMap.get('tabs') || 'sg-tabs'} [data-tab]`)) {
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-controls', `sg-view-${button.getAttribute('data-tab')}`);
  button.setAttribute('aria-selected', button.classList.contains(classMap.get('active') || 'sg-active') ? 'true' : 'false');
}
for (const view of document.querySelectorAll(`.${classMap.get('view') || 'sg-view'}[data-view]`)) {
  view.setAttribute('role', 'tabpanel');
  view.id = `sg-view-${view.getAttribute('data-view')}`;
}
for (const tabs of document.querySelectorAll(`.${classMap.get('works-tabs') || 'sg-works-tabs'}`)) tabs.setAttribute('role', 'tablist');
for (const button of document.querySelectorAll(`.${classMap.get('works-tabs') || 'sg-works-tabs'} [data-cat]`)) button.setAttribute('role', 'tab');
for (const nav of document.querySelectorAll('[data-p]')) {
  nav.setAttribute('role', 'tab');
  const panelId = nav.getAttribute('data-p');
  if (panelId) nav.setAttribute('aria-controls', panelId);
}
for (const nav of document.querySelectorAll('[data-p]')) {
  const panel = document.getElementById(nav.getAttribute('data-p') || '');
  if (panel) panel.setAttribute('role', 'tabpanel');
}
for (const dialog of document.querySelectorAll('.pop[id], .modal[id], [role="dialog"]')) {
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  if (!dialog.hasAttribute('aria-label') && !dialog.hasAttribute('aria-labelledby')) dialog.setAttribute('aria-label', document.title || '详情');
}
for (const script of [...document.scripts]) {
  const type = (script.getAttribute('type') || '').trim().toLowerCase().split(';')[0];
  if (executableScriptType(type) || type !== 'application/json' || !script.id) script.remove();
}
for (const style of [...document.querySelectorAll('style')]) style.remove();
const template = [...document.body.children].map((element) => element.outerHTML).join('\n');

csstree.walk(cssAst, (node) => {
  if (node.type === 'ClassSelector' && classMap.has(node.name)) node.name = classMap.get(node.name);
  if (node.type === 'IdSelector' && idMap.has(node.name)) node.name = idMap.get(node.name);
});
let css = csstree.generate(cssAst);
css = css.replace(/--(?!sg-)([a-zA-Z][\w-]*)/g, '--sg-$1');
const semanticColors = new Map([
  ['#6487fa', '--sg-primary'], ['#4268e8', '--sg-primary-dark'], ['#e8eeff', '--sg-primary-soft'],
  ['#f8f8f8', '--sg-bg'], ['#ffffff', '--sg-card'], ['#1e1f24', '--sg-text'], ['#848691', '--sg-sub'], ['#b7b9c1', '--sg-weak'],
]);
const rootMatch = css.match(/^:root\{([^}]*)\}/);
if (rootMatch) {
  const tail = css.slice(rootMatch[0].length);
  const extraColors = new Map();
  for (const match of tail.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const color = match[0].toLowerCase();
    if (!semanticColors.has(color)) extraColors.set(color, `--sg-color-${color.slice(1)}`);
  }
  const variables = [...extraColors].map(([color, name]) => `${name}:${color}`).join(';');
  const aliasList = [];
  if (!rootMatch[1].includes('--sg-ink:')) aliasList.push('--sg-ink:var(--sg-text, #1e1f24)');
  if (!rootMatch[1].includes('--sg-muted:')) aliasList.push('--sg-muted:var(--sg-sub, #848691)');
  if (!rootMatch[1].includes('--sg-paper:')) aliasList.push('--sg-paper:var(--sg-card, #ffffff)');
  if (!rootMatch[1].includes('--sg-line:')) aliasList.push('--sg-line:var(--sg-border, rgba(100,135,250,0.16))');
  aliasList.push('--sg-white:var(--sg-card, #ffffff)');
  const aliases = aliasList.join(';');
  let rewrittenTail = tail;
  for (const [color, variable] of [...semanticColors, ...extraColors]) rewrittenTail = rewrittenTail.replace(new RegExp(color, 'gi'), `var(${variable})`);
  css = `:root{${rootMatch[1]};${aliases}${variables ? `;${variables}` : ''}}${rewrittenTail}`;
}
css = `#mount{display:contents}.sg-library-host{width:100%;height:100%}#sg-app-container.sg-is-large-canvas{--sg-canvas-mode:large}\n${css}\n@media(max-width:500px){#sg-app-container{font-size:14px}}@media(max-width:320px),(max-height:380px){#sg-app-container{font-size:12px}}\n`;

const dynamicIdPrefixes = new Map();
for (const [original, mapped] of idMap) {
  const split = original.lastIndexOf('-');
  if (split > 0) dynamicIdPrefixes.set(original.slice(0, split + 1), mapped.slice(0, mapped.lastIndexOf('-') + 1));
}
const dynamicClassPrefixes = new Map();
for (const [original, mapped] of classMap) {
  const split = original.lastIndexOf('-');
  if (split > 0) dynamicClassPrefixes.set(original.slice(0, split + 1), mapped.slice(0, mapped.lastIndexOf('-') + 1));
}
const tokenPairs = [...new Map([...idMap, ...classMap, ...dynamicIdPrefixes, ...dynamicClassPrefixes])].sort((a, b) => b[0].length - a[0].length);
function transformString(input) {
  let value = input.replace(/(?:^|\.\/)(?:image|images)\//g, '../assets/').replace(/--(?!sg-)([a-zA-Z][\w-]*)/g, '--sg-$1');
  for (const [before, after] of tokenPairs) {
    const escaped = before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    value = value.replace(new RegExp(`(^|[^\\w-])${escaped}(?=$|[^\\w-])`, 'g'), (_, lead) => `${lead}${after}`);
  }
  return value;
}

let jsAst = null;
let scriptParseWarning = null;
if (scriptSource.trim()) {
  try { jsAst = parseJs(scriptSource, { ecmaVersion: 'latest', sourceType: 'script' }); }
  catch (error) { scriptParseWarning = error.message; }
}
const edits = [];
if (jsAst) walkJs(jsAst, {
  Property(node) {
    if (node.computed || node.key?.type !== 'Literal' || typeof node.key.value !== 'string') return;
    const next = transformString(node.key.value);
    if (next !== node.key.value) edits.push({ start: node.key.start, end: node.key.end, text: JSON.stringify(next) });
  },
  Literal(node) {
    if (typeof node.value !== 'string') return;
    const next = transformString(node.value);
    if (next !== node.value) edits.push({ start: node.start, end: node.end, text: JSON.stringify(next) });
  },
  TemplateElement(node) {
    const original = node.value.raw;
    const next = transformString(original);
    if (next !== original) edits.push({ start: node.start, end: node.end, text: next.replace(/`/g, '\\`').replace(/\$\{/g, '\\${') });
  },
});
let transformedScript = scriptSource;
for (const edit of edits.sort((a, b) => b.start - a.start)) transformedScript = transformedScript.slice(0, edit.start) + edit.text + transformedScript.slice(edit.end);
const dataBindings = new Map([
  ['galleries', 'galleries'],
  ['facts', 'facts'],
  ['tags', 'tags'],
  ['works', 'works'],
  ['costars', 'costars'],
  ['edges', 'edges'],
  ['chars', 'chars'],
  ['storyModules', 'storyModules'],
  ['ALL_EDGES', 'allEdges'],
  ['NODES', 'nodes'],
  ['CENTER', 'center'],
  ['COLORS', 'colors'],
  ['NODE_IMG', 'nodeImages'],
  ['NOTE', 'notes'],
  ['QS', 'questions'],
  ['memberList', 'memberList'],
]);
for (const [name, optionName] of dataBindings) {
  const declaration = new RegExp(`\\b(?:var|let|const)\\s+${name}\\s*=\\s*([\\[{])`);
  transformedScript = transformedScript.replace(declaration, (_match, opening) => `var ${name} = (options && options.${optionName}) || ${opening}`);
}

transformedScript = transformedScript.replace(/var slots = \[([\s\S]*?)\n\s*\];/, 'var slots = Array.of($1\n              );');

const runtimeBodyClasses = [...scriptSource.matchAll(/document\.body\.classList\.add\(\s*['\"]([^'\"]+)['\"]/g)].map((match) => classMap.get(match[1]) || prefixed(match[1]));
const escapedTemplate = template.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/<\/script/gi, '<\\/script');
const libraryJs = `/* Parser-backed decomposition from ${basename(sourcePath)}. */\n(function(global){\n  'use strict';\n  var TEMPLATE = \`${escapedTemplate}\`;\n  function mount(root, options) {\n    if (!root) throw new Error('mount root is required');\n    ${runtimeBodyClasses.map((name) => `    root.classList.add('${name}');`).join('\n')}\n    root.innerHTML = TEMPLATE;\n${transformedScript.split('\n').map((line) => `    ${line.replace(/\s+$/, '')}`).join('\n')}\n    return { root: root, destroy: function(){ root.innerHTML = ''; } };\n  }\n  function create(options) {\n    var root = document.createElement('div');\n    root.className = 'sg-library-host';\n    mount(root, options || {});\n    return root;\n  }\n  global.${globalName} = { mount: mount, create: create };\n})(window);\n`;

mkdirSync(resolve(outDir, 'src'), { recursive: true });
mkdirSync(resolve(outDir, 'examples'), { recursive: true });
mkdirSync(resolve(outDir, 'docs'), { recursive: true });
mkdirSync(resolve(outDir, 'assets'), { recursive: true });
const assetSource = ['image', 'images'].map((name) => resolve(dirname(sourcePath), name)).find((path) => existsSync(path));
if (assetSource) cpSync(assetSource, resolve(outDir, 'assets'), { recursive: true });
writeFileSync(resolve(outDir, 'src', `${fileStem}.css`), css);
writeFileSync(resolve(outDir, 'src', `${fileStem}.js`), libraryJs);
const pageTitle = document.title || globalName;
const example = `<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${pageTitle}</title><link rel="stylesheet" href="../src/${fileStem}.css"></head><body><div id="mount"></div><script src="../src/${fileStem}.js"></script><script>${globalName}.mount(document.getElementById('mount'));</script></body></html>\n`;
writeFileSync(resolve(outDir, 'examples', `${fileStem}.html`), example);
writeFileSync(resolve(outDir, 'examples', 'template.html'), example.replace(`${globalName}.mount(document.getElementById('mount'))`, `${globalName}.mount(document.getElementById('mount'), {})`));
const readmePath = resolve(outDir, 'README.md');
if (!existsSync(readmePath)) writeFileSync(readmePath, `# ${pageTitle}组件库\n\n从自包含 HTML 页面通过 TypeScript visual quality gates 工具链拆分出的零依赖组件库。\n\n## 快速开始\n\n\`\`\`html\n<link rel="stylesheet" href="src/${fileStem}.css">\n<div id="mount"></div>\n<script src="src/${fileStem}.js"></script>\n<script>${globalName}.mount(document.getElementById('mount'));</script>\n\`\`\`\n\n## API\n\n- \`${globalName}.mount(root, options)\`：挂载到指定容器；识别出的业务数据可通过 \`options\` 覆盖。\n- \`${globalName}.create(options)\`：创建并返回独立组件容器。\n\n## 主题定制\n\n可覆盖 \`--sg-primary\`、\`--sg-ink\`、\`--sg-muted\`、\`--sg-line\`、\`--sg-paper\` 等 CSS 变量。\n`);
const specPath = resolve(outDir, 'docs', '设计规范.md');
if (!existsSync(specPath)) writeFileSync(specPath, `# 设计规范\n\n## 主题色\n\n组件颜色统一通过 \`--sg-*\` CSS 变量管理。核心变量包括主色 \`--sg-primary\`、正文 \`--sg-ink\`、弱化文本 \`--sg-muted\`、分割线 \`--sg-line\` 与卡片背景 \`--sg-paper\`。\n\n## 命名与隔离\n\n组件类名、ID 与自定义属性均使用 \`sg-\` 前缀，避免与宿主页面冲突。\n\n## 响应式\n\n保留源页面断点，并补充窄屏和极端小屏保护规则。\n`);
console.log(JSON.stringify({ sourcePath, outDir, classes: classMap.size, ids: idMap.size, cssBytes: css.length, jsBytes: libraryJs.length, executableScripts: executableScripts.length, skippedScripts, scriptParseWarning, assetsCopied: Boolean(assetSource) }, null, 2));
