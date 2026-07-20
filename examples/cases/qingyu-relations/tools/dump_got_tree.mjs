import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const toolDir = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(toolDir, '../lib/examples/qingyu.html');
const dom = await JSDOM.fromFile(htmlPath, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
});
await new Promise(r => setTimeout(r, 600));
const doc = dom.window.document;
function show(node, depth = 0, maxd = 3) {
  if (depth > maxd || !node) return;
  const tag = node.tagName ? node.tagName.toLowerCase() : '#' + (node.nodeName || 'text');
  const cls = node.classList ? Array.from(node.classList).join('.') : '';
  const txt = (node.textContent || '').trim().slice(0, 25);
  console.log('  '.repeat(depth) + tag + (cls ? ' .' + cls : '') + (tag === '#text' && txt ? ': ' + txt : ''));
  if (node.childNodes) {
    for (const child of Array.from(node.childNodes).slice(0, 10)) {
      show(child, depth + 1, maxd);
    }
  }
}
const mount = doc.querySelector('#mount');
console.log('=== GOT TREE (mount, 4 levels) ===');
show(mount || doc.body, 0, 3);
dom.window.close();
