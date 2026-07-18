// _roundtrip_render.mjs
// 用 jsdom 渲染 HTML 并导出结构化 DOM 表示，供 roundtrip.py 对比。
//
// 两种模式：
//   1. 组件库模式（默认）：node _roundtrip_render.mjs <example.html>
//      提取所有 <link>/<script src>，内联后执行，序列化 #mount 子树
//   2. 参照模式：node _roundtrip_render.mjs <original.html> --ref
//      整页执行原 HTML 的内联 + 外部 JS，序列化 <body> 子树
//
// 输出: JSON 到 stdout，形如 { ok, dom, texts, error, mode }
//
// P1 通用化：支持多 CSS/JS 文件（按文档顺序内联全部）、多内联 script、
// 本地资源路径解析（相对于 HTML 文件目录）。

import { JSDOM } from 'jsdom';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname, relative } from 'path';

const args = process.argv.slice(2);
const htmlPath = args[0];
const isRef = args.includes('--ref');
const twOnly = args.includes('--tw-only');

if (!htmlPath) {
  console.error('用法: node _roundtrip_render.mjs <html路径> [--ref]');
  process.exit(2);
}

const absHtmlPath = resolve(htmlPath);
const htmlDir = dirname(absHtmlPath);

if (!existsSync(absHtmlPath)) {
  output({ ok: false, error: `文件不存在: ${absHtmlPath}` });
  process.exit(0);
}

const html = readFileSync(absHtmlPath, 'utf-8');
const SKIP_TAGS = ['script', 'style', 'link', 'meta', 'title', 'head'];

const MAX_NODES = 2000;  // 序列化节点数上限（防超大 DOM 输出溢出）
const MAX_DEPTH = 30;    // 递归深度上限
let _nodeCount = 0;
function serialize(node, depth) {
  depth = depth || 0;
  if (_nodeCount >= MAX_NODES || depth > MAX_DEPTH) return null;
  if (node.nodeType === 3) {
    const t = node.textContent.trim();
    if (!t) return null;
    _nodeCount++;
    return { tag: '#text', text: t.length > 500 ? t.slice(0, 500) + '...' : t };
  }
  if (node.nodeType !== 1) return null;
  const tag = node.tagName.toLowerCase();
  if (SKIP_TAGS.includes(tag)) return null;
  _nodeCount++;
  const classes = (node.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  const children = [];
  for (const child of node.childNodes) {
    const s = serialize(child, depth + 1);
    if (s) children.push(s);
  }
  const node2 = { tag, classes };
  if (children.length) {
    if (children.length === 1 && children[0].tag === '#text') {
      node2.text = children[0].text;
    } else {
      node2.children = children;
    }
  }
  return node2;
}

function collectTexts(node, out) {
  if (node.nodeType === 3) {
    const t = node.textContent.trim();
    if (t) out.push(t);
    return;
  }
  if (node.nodeType !== 1) return;
  const tag = node.tagName.toLowerCase();
  if (['script', 'style'].includes(tag)) return;
  for (const child of node.childNodes) collectTexts(child, out);
}

// 提取所有外部 CSS（<link rel="stylesheet" href="...css">），按文档顺序
function extractAllCss(html) {
  const out = [];
  const re = /<link[^>]+href=["']([^"']+\.css)["'][^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push(m[1]);
  }
  return out;
}

// 提取所有外部 JS（<script src="...js">），按文档顺序
function extractAllJs(html) {
  const out = [];
  const re = /<script[^>]+src=["']([^"']+\.js)["'][^>]*><\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push(m[1]);
  }
  return out;
}

// 提取所有内联 script（<script>...</script>，无 src），按文档顺序
function extractInlineScripts(html) {
  const out = [];
  // 匹配 <script>...</script>（不含 src 属性）
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const code = m[1];
    // 跳过空/纯注释 script
    if (code.trim()) out.push(code);
  }
  return out;
}

// 读取本地文件内容，失败返回空 + 警告
function readLocal(relPath, kind) {
  const abs = resolve(htmlDir, relPath);
  if (!existsSync(abs)) {
    return { text: '', missing: relPath };
  }
  try {
    return { text: readFileSync(abs, 'utf-8'), missing: null };
  } catch (e) {
    return { text: '', missing: `${relPath} (${e.message})` };
  }
}

// 输出大 JSON 到临时文件，避免 stdout 管道截断
function output(obj) {
  const json = JSON.stringify(obj);
  if (json.length > 40000) {
    const tmpFile = '/tmp/_roundtrip_out.json';
    writeFileSync(tmpFile, json, 'utf-8');
    console.log(JSON.stringify({ __outputFile: tmpFile }));
  } else {
    console.log(json);
  }
}

try {
  let serializeRoot;
  if (isRef) {
    // === 参照模式：内联外部资源后整页执行，序列化 <body> ===
    // P1 通用化：参照模式也内联多 CSS/JS，处理多文件输入
    const errorList = [];
    // 提取并内联所有外部 CSS（移除 <link>，注入 <style>）
    const cssList = extractAllCss(html);
    const missingRef = [];
    let cssText = '';
    cssList.forEach((rel) => {
      const r = readLocal(rel, 'css');
      if (r.missing) missingRef.push(r.missing);
      else cssText += r.text + '\n';
    });
    // 提取并内联所有外部 JS（移除 <script src>，保留内联 script）
    const jsList = extractAllJs(html);
    let jsText = '';
    jsList.forEach((rel) => {
      const r = readLocal(rel, 'js');
      if (r.missing) missingRef.push(r.missing);
      else jsText += r.text + '\n';
    });
    // 构建内联 HTML：保留 body 结构，把外部资源内联进 head/body
    // 移除所有 <link ...css> 和 <script src=...>
    let builtHtml = html
      .replace(/<link[^>]+href=["'][^"'']+\.css["'][^>]*>/g, '')
      .replace(/<script[^>]+src=["'][^"'']+\.js["'][^>]*><\/script>/g, '');
    // 在 </head> 前注入内联 CSS + 错误捕获
    const errCapture = `<script>
      window.__roundtripErrors=[];
      window.addEventListener('error',function(e){window.__roundtripErrors.push(String(e.error&&e.error.message||e.message||e))});
      // 桩：外部 CDN 依赖缺失时防止脚本崩溃（Tailwind/marked/mermaid 等）
      // 捕获 tailwind.config 到 window.__tailwindConfig（含主题色体系）
      window.tailwind = { config: {}, theme: { extend: {} } };
      try { Object.defineProperty(window.tailwind, 'config', { get: function(){return window.__tailwindConfig||{}}, set: function(v){window.__tailwindConfig=v;return v;} }); } catch(e){}
      // 其他常见全局桩
      window.marked = { parse: function(t){return t;} };
      window.DOMPurify = { sanitize: function(t){return t;} };
      window.mermaid = { initialize: function(){}, run: function(){}, render: function(id, t, cb){ if(cb) cb({svg:''}); } };
      // localStorage 桩（jsdom 对 opaque origin 不可用）
      try { if (!window.localStorage) { var _ls={}; window.localStorage={getItem:function(k){return _ls[k]||null},setItem:function(k,v){_ls[k]=String(v)},removeItem:function(k){delete _ls[k]},clear:function(){_ls={}}}; } } catch(e) { var _ls2={}; window.localStorage={getItem:function(k){return _ls2[k]||null},setItem:function(k,v){_ls2[k]=String(v)},removeItem:function(k){delete _ls2[k]},clear:function(){_ls2={}}}; }
      // canvas getContext 桩（jsdom 无 canvas 包时返回 stub context）
      if (window.HTMLCanvasElement) {
        var _origGetCtx = window.HTMLCanvasElement.prototype.getContext;
        window.HTMLCanvasElement.prototype.getContext = function(type) {
          try { var ctx = _origGetCtx.call(this, type); if (ctx) return ctx; } catch(e) {}
          // 返回桩 context，含常见方法
          return { clearRect:function(){},fillRect:function(){},strokeRect:function(){},beginPath:function(){},closePath:function(){},moveTo:function(){},lineTo:function(){},arc:function(){},fill:function(){},stroke:function(){},save:function(){},restore:function(){},translate:function(){},rotate:function(){},scale:function(){},drawImage:function(){},getImageData:function(){return{data:[]}},putImageData:function(){},createImageData:function(){return{data:[]}},setTransform:function(){},transform:function(){},rect:function(){},clip:function(){},measureText:function(){return{width:0}},fillText:function(){},strokeText:function(){},createRadialGradient:function(){return{addColorStop:function(){}}},createLinearGradient:function(){return{addColorStop:function(){}}},set fillStyle(v){},get fillStyle(){return ''},set strokeStyle(v){},get strokeStyle(){return ''},set lineWidth(v){},get lineWidth(){return 1},set font(v){},get font(){return ''},set globalAlpha(v){},get globalAlpha(){return 1},canvas:{width:0,height:0} };
        };
      }
    </script>`;
    // 桩注入到 <head> 之后（确保在所有 head 内 script 之前执行）
    builtHtml = builtHtml.replace('<head>', `<head>${errCapture}`);
    builtHtml = builtHtml.replace('</head>', `<style>${cssText}</style></head>`);
    // 在 <body> 后注入内联的外部 JS（确保在 body 内联 script 之前执行）
    builtHtml = builtHtml.replace('<body>', `<body><script>${jsText}</script>`);

    const dom = new JSDOM(builtHtml, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      resources: undefined,  // 不加载外部资源（已内联）
    });
    const { window } = dom;
    await new Promise((r) => setTimeout(r, 100));
    const errs = window.__roundtripErrors || [];
    serializeRoot = window.document.body;
    const childCount = serializeRoot ? serializeRoot.children.length : -1;
    if (childCount === 0) {
      output({
        ok: false,
        mode: 'ref',
        error: '原 HTML 渲染后 body 无子元素（JS 可能未执行或报错）',
        runtimeErrors: errs.slice(0, 5),
        cssFiles: cssList.length,
        jsFiles: jsList.length,
        missingFiles: missingRef.length ? missingRef : undefined,
      });
      process.exit(0);
    }
    const tree = serialize(serializeRoot);
    const texts = [];
    collectTexts(serializeRoot, texts);
    // --tw-only 模式：只输出 tailwindConfig（供 analyze_html 提取主题色）
    if (twOnly) {
      output({
        ok: true,
        mode: 'tw',
        tailwindConfig: window.__tailwindConfig || null,
      });
      process.exit(0);
    }
    output({
      ok: true,
      mode: 'ref',
      childCount,
      dom: tree,
      texts,
      textCount: texts.length,
      runtimeErrors: errs.slice(0, 3),
      cssFiles: cssList.length,
      jsFiles: jsList.length,
      missingFiles: missingRef.length ? missingRef : undefined,
    });
    process.exit(0);
  } else {
    // === 组件库模式：提取所有外部 + 内联资源，按文档顺序内联 ===
    const cssList = extractAllCss(html);
    const jsList = extractAllJs(html);
    const inlineList = extractInlineScripts(html);

    const missingFiles = [];
    let cssText = '';
    cssList.forEach((rel) => {
      const r = readLocal(rel, 'css');
      if (r.missing) missingFiles.push(r.missing);
      else cssText += r.text + '\n';
    });
    let jsText = '';
    jsList.forEach((rel) => {
      const r = readLocal(rel, 'js');
      if (r.missing) missingFiles.push(r.missing);
      else jsText += r.text + '\n';
    });
    // 内联 script 按 DOM 顺序拼接（但它们应放在外部 JS 之后执行）
    const inlineText = inlineList.join('\n;\n');

    const builtHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${cssText}</style></head>
<body><div id="mount"></div><script>window.__roundtripErrors=[];window.addEventListener('error',function(e){window.__roundtripErrors.push(String(e.error&&e.error.message||e.message||e))})</script><script>${jsText}</script><script>${inlineText}</script></body></html>`;

    const dom = new JSDOM(builtHtml, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });
    const { window } = dom;
    await new Promise((r) => setTimeout(r, 80));

    const mountEl = window.document.getElementById('mount');
    const childCount = mountEl ? mountEl.children.length : -1;

    if (childCount === 0) {
      const errs = window.__roundtripErrors || [];
      output({
        ok: false,
        mode: 'lib',
        error: 'mount 后 #mount 无子元素（JS 可能未执行或渲染失败）',
        childCount,
        runtimeErrors: errs.slice(0, 5),
        cssFiles: cssList.length,
        jsFiles: jsList.length,
        inlineScripts: inlineList.length,
        missingFiles,
      });
      process.exit(0);
    }

    const tree = mountEl ? serialize(mountEl) : null;
    const texts = [];
    if (mountEl) collectTexts(mountEl, texts);

    output({
      ok: true,
      mode: 'lib',
      childCount,
      dom: tree,
      texts,
      textCount: texts.length,
      runtimeErrors: (window.__roundtripErrors || []).slice(0, 3),
      cssFiles: cssList.length,
      jsFiles: jsList.length,
      inlineScripts: inlineList.length,
      missingFiles: missingFiles.length ? missingFiles : undefined,
    });
    process.exit(0);
  }
} catch (e) {
  output({ ok: false, error: String(e && e.message || e) });
  process.exit(0);
}
