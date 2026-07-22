#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import * as csstree from 'css-tree';
import { parse as parseJs } from 'acorn';
import { simple as walkJs } from 'acorn-walk';

const [sourceArg, outArg, globalName = 'DismantledLibrary'] = process.argv.slice(2);
if (!sourceArg || !outArg) {
  console.error('usage: node scripts/transpile_self_contained_case.mjs <source.html> <lib-dir> [GlobalName]');
  process.exit(2);
}
const sourcePath = resolve(sourceArg);
const outDir = resolve(outArg);
const source = readFileSync(sourcePath, 'utf8');
const dom = new JSDOM(source);
const document = dom.window.document;
const cssSource = [...document.querySelectorAll('style')].map((node) => node.textContent || '').join('\n');
const scriptSource = [...document.querySelectorAll('script:not([src])')].map((node) => node.textContent || '').join('\n');

const cssAst = csstree.parse(cssSource, { positions: true, parseValue: true, parseCustomProperty: true });
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

const prefixed = (name) => name.startsWith('sg-') ? name : `sg-${name}`;
const classMap = new Map([...classNames].map((name) => [name, prefixed(name)]));
const idMap = new Map([...idNames].map((name) => [name, prefixed(name)]));

for (const element of document.querySelectorAll('[class]')) element.setAttribute('class', [...element.classList].map((name) => classMap.get(name) || name).join(' '));
for (const element of document.querySelectorAll('[id]')) element.id = idMap.get(element.id) || element.id;
for (const script of [...document.scripts]) script.remove();
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
  const aliases = '--sg-ink:var(--sg-text);--sg-muted:var(--sg-sub);--sg-paper:var(--sg-card);--sg-white:var(--sg-card)';
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
  let value = input.replaceAll('./image/', '../assets/');
  for (const [before, after] of tokenPairs) {
    const escaped = before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    value = value.replace(new RegExp(`(^|[^\\w-])${escaped}(?=$|[^\\w-])`, 'g'), (_, lead) => `${lead}${after}`);
  }
  return value;
}

const jsAst = parseJs(scriptSource, { ecmaVersion: 'latest', sourceType: 'script' });
const edits = [];
walkJs(jsAst, {
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
for (const name of ['galleries', 'facts', 'tags', 'works', 'costars']) {
  transformedScript = transformedScript.replace(new RegExp(`\\bvar\\s+${name}\\s*=\\s*\\[`), `var ${name} = (options && options.${name}) || [`);
}

transformedScript = transformedScript.replace(/var slots = \[([\s\S]*?)\n\s*\];/, 'var slots = Array.of($1\n              );');

const escapedTemplate = template.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const libraryJs = `/* Parser-backed decomposition from ${basename(sourcePath)}. */\n(function(global){\n  'use strict';\n  var TEMPLATE = \`${escapedTemplate}\`;\n  function mount(root, options) {\n    if (!root) throw new Error('mount root is required');\n    root.classList.add('sg-is-scaled-canvas');\n    root.innerHTML = TEMPLATE;\n${transformedScript.split('\n').map((line) => `    ${line}`).join('\n')}\n    return { root: root, destroy: function(){ root.innerHTML = ''; } };\n  }\n  function create(options) {\n    var root = document.createElement('div');\n    root.className = 'sg-library-host';\n    mount(root, options || {});\n    return root;\n  }\n  global.${globalName} = { mount: mount, create: create };\n})(window);\n`;

mkdirSync(resolve(outDir, 'src'), { recursive: true });
mkdirSync(resolve(outDir, 'examples'), { recursive: true });
mkdirSync(resolve(outDir, 'docs'), { recursive: true });
mkdirSync(resolve(outDir, 'assets'), { recursive: true });
const assetSource = resolve(dirname(sourcePath), 'image');
cpSync(assetSource, resolve(outDir, 'assets'), { recursive: true });
writeFileSync(resolve(outDir, 'src', 'liu-haocun.css'), css);
writeFileSync(resolve(outDir, 'src', 'liu-haocun.js'), libraryJs);
const example = `<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>刘浩存光影星途互动图鉴</title><link rel="stylesheet" href="../src/liu-haocun.css"></head><body><div id="mount"></div><script src="../src/liu-haocun.js"></script><script>LiuHaocunAtlas.mount(document.getElementById('mount'));</script></body></html>\n`;
writeFileSync(resolve(outDir, 'examples', 'liu-haocun.html'), example);
writeFileSync(resolve(outDir, 'examples', 'template.html'), example.replace('LiuHaocunAtlas.mount(document.getElementById(\'mount\'))', 'LiuHaocunAtlas.mount(document.getElementById(\'mount\'), { works: undefined, costars: undefined })'));
console.log(JSON.stringify({ sourcePath, outDir, classes: classMap.size, ids: idMap.size, cssBytes: css.length, jsBytes: libraryJs.length }, null, 2));
