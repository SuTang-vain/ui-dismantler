// _roundtrip_render.mjs
// 用 jsdom 加载生成库的 example.html，执行 mount，导出渲染后 DOM 的结构化表示。
// 供 Python 端 roundtrip.py 调用对比。
//
// 用法: node _roundtrip_render.mjs <example.html 路径>
// 输出: JSON 到 stdout，形如 { ok, dom, texts, error }

import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';

const htmlPath = process.argv[2];
if (!htmlPath) {
  console.error('用法: node _roundtrip_render.mjs <example.html>');
  process.exit(2);
}

const absHtmlPath = resolve(htmlPath);
const htmlDir = dirname(absHtmlPath);
const html = readFileSync(absHtmlPath, 'utf-8');

try {
  // 不用 resources:'usable'（会尝试加载外部 CDN 卡住）。
  // 改为：构建一个最小 HTML，手动注入本地 CSS + JS 执行 mount。
  // 1. 解析 example.html 里的 <link href="../src/xxx.css"> 和 <script src="../src/xxx.js">
  // 2. 读取本地文件内容，内联进新 HTML
  const cssMatch = html.match(/<link[^>]+href="([^"]+\.css)"/);
  const jsMatch = html.match(/<script[^>]+src="([^"]+\.js)"/);
  const mountMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);

  let cssText = '';
  if (cssMatch) {
    const cssPath = resolve(htmlDir, cssMatch[1]);
    try { cssText = readFileSync(cssPath, 'utf-8'); } catch {}
  }
  let jsText = '';
  if (jsMatch) {
    const jsPath = resolve(htmlDir, jsMatch[1]);
    try { jsText = readFileSync(jsPath, 'utf-8'); } catch {}
  }
  const mountCode = mountMatch ? mountMatch[1] : '';

  const builtHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${cssText}</style></head>
<body><div id="mount"></div><script>${jsText}</script><script>${mountCode}</script></body></html>`;

  const dom = new JSDOM(builtHtml, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // 给 mount 一点时间（同步执行的话不需要，但保险起见）
  await new Promise((r) => setTimeout(r, 50));

  // 检查 mount 是否真的渲染了内容
  const mountEl = window.document.getElementById('mount');
  const childCount = mountEl ? mountEl.children.length : -1;

  if (childCount === 0) {
    // mount 可能没执行成功，输出诊断
    console.log(JSON.stringify({
      ok: false,
      error: 'mount 后 #mount 无子元素（JS 可能未执行或渲染失败）',
      childCount,
      hasWindow: typeof window !== 'undefined',
      scriptsLoaded: window.document.querySelectorAll('script').length,
    }));
    process.exit(0);
  }

  // 提取渲染后 DOM 的结构化表示
  // dom: 递归树，每个节点 { tag, classes, children, text? }
  // texts: 所有可见文本（按出现顺序）
  function serialize(node) {
    if (node.nodeType === 3) { // 文本节点
      const t = node.textContent.trim();
      return t ? { tag: '#text', text: t } : null;
    }
    if (node.nodeType !== 1) return null; // 只处理元素 + 文本
    const tag = node.tagName.toLowerCase();
    // 跳过 script/style/link/meta
    if (['script', 'style', 'link', 'meta', 'title', 'head'].includes(tag)) return null;
    const classes = (node.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    const children = [];
    for (const child of node.childNodes) {
      const s = serialize(child);
      if (s) children.push(s);
    }
    // 叶子文本节点直接存 text
    const node2 = { tag, classes };
    if (children.length) {
      // 如果只有一个文本子节点，提上去
      if (children.length === 1 && children[0].tag === '#text') {
        node2.text = children[0].text;
      } else {
        node2.children = children;
      }
    }
    return node2;
  }

  const mountTree = mountEl ? serialize(mountEl) : null;

  // 提取所有可见文本
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
  const texts = [];
  if (mountEl) collectTexts(mountEl, texts);

  console.log(JSON.stringify({
    ok: true,
    childCount,
    dom: mountTree,
    texts,
    textCount: texts.length,
  }));
  // 强制退出：生成库 JS 可能注册了 setInterval/setTimeout（轮播自动播放），
  // 导致 node 事件循环不退出。渲染并序列化完成后立即退出。
  process.exit(0);
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
  process.exit(0);
}
