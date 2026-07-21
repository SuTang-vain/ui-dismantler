// Chromium CDP CSS evidence probe.
//
// Usage:
//   node scripts/cdp_css_probe.mjs <html> --selector <selector> [--selector <selector> ...] --out result.json
//   node scripts/cdp_css_probe.mjs <html> --selectors-file inventory.json --out result.json
//
// This is an optional evidence layer for large/massive pages. It does not
// replace static analysis and never changes the source HTML.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
import { createServer } from 'net';

const args = process.argv.slice(2);
const htmlPath = args[0];
const outputPath = readArg('--out');
const selectorsFile = readArg('--selectors-file');
const selectors = allArgs('--selector');
const maxSamples = Number.parseInt(readArg('--max-samples') || '12', 10);
const chromePath = readArg('--chrome') || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!htmlPath) {
  fail('用法: node cdp_css_probe.mjs <html> --selector <selector> [--selector ...] --out result.json');
}

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function allArgs(name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1]);
  }
  return values;
}

function fail(error) {
  const result = { schemaVersion: '1.0', status: 'unavailable', comparable: false, error };
  writeResult(result);
  process.exit(0);
}

function writeResult(result) {
  const text = JSON.stringify(result, null, 2) + '\n';
  if (outputPath) {
    requireWriteResult(outputPath, text);
  } else {
    process.stdout.write(text);
  }
}

function requireWriteResult(path, text) {
  writeFileSync(resolve(path), text, 'utf-8');
}

function sleep(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolvePort(port));
    });
  });
}

async function fetchJson(url, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(50);
  }
  throw lastError || new Error(`请求超时: ${url}`);
}

class CdpConnection {
  constructor(url) {
    this.url = url;
    this.nextId = 0;
    this.pending = new Map();
    this.events = new Map();
    this.ws = null;
  }

  async connect() {
    if (typeof WebSocket !== 'function') {
      throw new Error('当前 Node 运行时没有 WebSocket；CDP 探针需要 Node 18+ WebSocket 或 ws 依赖');
    }
    this.ws = new WebSocket(this.url);
    await new Promise((resolveOpen, rejectOpen) => {
      this.ws.addEventListener('open', resolveOpen, { once: true });
      this.ws.addEventListener('error', (event) => rejectOpen(new Error(String(event.error || 'WebSocket 连接失败'))), { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
        else pending.resolve(message.result || {});
        return;
      }
      if (message.method) {
        for (const handler of this.events.get(message.method) || []) handler(message.params || {});
      }
    });
  }

  on(method, handler) {
    const handlers = this.events.get(method) || [];
    handlers.push(handler);
    this.events.set(method, handlers);
  }

  call(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolveCall, rejectCall) => {
      this.pending.set(id, { resolve: resolveCall, reject: rejectCall });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

function compactProperties(properties = []) {
  return properties
    .filter((property) => property && property.name && property.value !== undefined)
    .map((property) => ({
      name: property.name,
      value: property.value,
      important: Boolean(property.important),
      disabled: Boolean(property.disabled),
      implicit: Boolean(property.implicit),
    }));
}

function compactMatchedStyles(styles) {
  const rules = (styles.matchedCSSRules || []).map((entry) => {
    const rule = entry.rule || {};
    return {
      origin: rule.origin,
      styleSheetId: rule.styleSheetId,
      selectors: (rule.selectorList && rule.selectorList.selectors || []).map((selector) => selector.text),
      media: (rule.media || []).map((media) => ({
        text: media.text,
        source: media.source,
        sourceURL: media.sourceURL,
      })),
      properties: compactProperties(rule.style && rule.style.cssProperties),
    };
  });
  return {
    matchedRules: rules,
    inlineStyle: styles.inlineStyle ? compactProperties(styles.inlineStyle.cssProperties) : [],
    inherited: (styles.inherited || []).map((entry) => ({
      matchedRules: (entry.matchedCSSRules || []).map((item) => ({
        selectors: (item.rule && item.rule.selectorList && item.rule.selectorList.selectors || []).map((selector) => selector.text),
        properties: compactProperties(item.rule && item.rule.style && item.rule.style.cssProperties),
      })),
      inlineStyle: entry.inlineStyle ? compactProperties(entry.inlineStyle.cssProperties) : [],
    })),
    pseudoElements: (styles.pseudoElements || []).map((entry) => ({
      pseudo: entry.pseudoType,
      matchedRules: (entry.matches || []).map((item) => ({
        selectors: (item.rule && item.rule.selectorList && item.rule.selectorList.selectors || []).map((selector) => selector.text),
        properties: compactProperties(item.rule && item.rule.style && item.rule.style.cssProperties),
      })),
    })),
  };
}

function compactComputedStyle(computed) {
  const wanted = new Set([
    'display', 'position', 'visibility', 'opacity', 'width', 'height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'color', 'background-color', 'font-family', 'font-size', 'font-weight',
    'line-height', 'gap', 'grid-template-columns', 'grid-template-rows',
    'flex-direction', 'align-items', 'justify-content', 'border-radius',
    'border-top-width', 'border-top-color', 'z-index',
  ]);
  return Object.fromEntries(
    (computed || [])
      .filter((item) => wanted.has(item.name))
      .map((item) => [item.name, item.value]),
  );
}

async function describeNode(cdp, nodeId) {
  const result = await cdp.call('DOM.describeNode', { nodeId });
  const node = result.node || {};
  const attrs = {};
  for (let index = 0; index < (node.attributes || []).length; index += 2) {
    attrs[node.attributes[index]] = node.attributes[index + 1];
  }
  return {
    nodeId,
    nodeName: node.nodeName,
    localName: node.localName,
    attributes: attrs,
  };
}

async function collectNodeEvidence(cdp, nodeId) {
  const [description, matched, computed] = await Promise.all([
    describeNode(cdp, nodeId),
    cdp.call('CSS.getMatchedStylesForNode', { nodeId }),
    cdp.call('CSS.getComputedStyleForNode', { nodeId }),
  ]);
  return {
    node: description,
    matchedStyles: compactMatchedStyles(matched),
    computedStyle: compactComputedStyle(computed.computedStyle),
  };
}

function selectorsFromInput() {
  const values = [...selectors];
  if (selectorsFile) {
    const document = JSON.parse(readFileSync(resolve(selectorsFile), 'utf-8'));
    const entries = Array.isArray(document)
      ? document
      : Array.isArray(document.sectionInventory)
        ? document.sectionInventory
        : Array.isArray(document.sections)
          ? document.sections
          : document.meta && document.meta.analysisPlan && Array.isArray(document.meta.analysisPlan.sectionInventory)
            ? document.meta.analysisPlan.sectionInventory
            : [];
    for (const entry of entries) {
      if (typeof entry === 'string') values.push(entry);
      else if (entry && typeof entry.selector === 'string') values.push(entry.selector);
    }
  }
  return [...new Set(values)].filter(Boolean);
}

async function main() {
  const absHtmlPath = resolve(htmlPath);
  if (!existsSync(absHtmlPath)) fail(`文件不存在: ${absHtmlPath}`);
  if (!existsSync(chromePath)) fail(`Chrome 不存在: ${chromePath}`);
  const targetSelectors = selectorsFromInput();
  if (!targetSelectors.length) fail('至少提供一个 --selector 或 --selectors-file');

  const port = await freePort();
  const profileDir = mkdtempSync(join(tmpdir(), 'ui-dismantler-cdp-'));
  const chromeArgs = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-features=Translate,BackForwardCache',
    '--allow-file-access-from-files',
    '--disable-web-security',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    pathToFileURL(absHtmlPath).href,
  ];
  const chrome = spawn(chromePath, chromeArgs, { stdio: 'ignore' });
  let cdp = null;
  try {
    const targets = await fetchJson(`http://127.0.0.1:${port}/json`, 5000);
    const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
    if (!page) fail('Chrome 未返回 page target');
    cdp = new CdpConnection(page.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.call('DOM.enable');
    await cdp.call('CSS.enable');
    await cdp.call('Runtime.enable');
    await sleep(500);

    const ready = await cdp.call('Runtime.evaluate', {
      expression: 'document.readyState',
      returnByValue: true,
    });
    const document = await cdp.call('DOM.getDocument', { depth: -1, pierce: true });
    const rootNodeId = document.root.nodeId;
    const results = [];
    for (const selector of targetSelectors) {
      let nodeIds = [];
      try {
        nodeIds = (await cdp.call('DOM.querySelectorAll', { nodeId: rootNodeId, selector })).nodeIds || [];
      } catch (error) {
        results.push({ selector, status: 'selector-error', error: String(error.message || error) });
        continue;
      }
      if (!nodeIds.length) {
        results.push({ selector, status: 'not-found', matchedNodeCount: 0 });
        continue;
      }
      const sectionEvidence = [];
      for (const nodeId of nodeIds.slice(0, 4)) {
        try {
          sectionEvidence.push(await collectNodeEvidence(cdp, nodeId));
          let sampleIds = [];
          try {
            sampleIds = (await cdp.call('DOM.querySelectorAll', { nodeId, selector: '[class]' })).nodeIds || [];
          } catch { /* optional sample */ }
          const samples = [];
          for (const sampleId of sampleIds.slice(0, Math.max(0, maxSamples))) {
            try { samples.push(await collectNodeEvidence(cdp, sampleId)); } catch { /* one sample should not fail all */ }
          }
          sectionEvidence[sectionEvidence.length - 1].samples = samples;
        } catch (error) {
          sectionEvidence.push({ status: 'node-error', error: String(error.message || error) });
        }
      }
      results.push({ selector, status: 'ok', matchedNodeCount: nodeIds.length, nodes: sectionEvidence });
    }
    const result = {
      schemaVersion: '1.0',
      status: 'ok',
      comparable: results.some((item) => item.status === 'ok'),
      engine: 'chromium-cdp',
      protocolMethods: ['DOM.getDocument', 'DOM.querySelectorAll', 'CSS.getMatchedStylesForNode', 'CSS.getComputedStyleForNode'],
      browser: chromePath,
      documentReadyState: ready.result && ready.result.value,
      source: absHtmlPath,
      selectors: results,
    };
    writeResult(result);
  } catch (error) {
    writeResult({
      schemaVersion: '1.0',
      status: 'error',
      comparable: false,
      engine: 'chromium-cdp',
      error: String(error && error.message || error),
    });
  } finally {
    if (cdp) cdp.close();
    chrome.kill('SIGTERM');
    try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* cleanup best effort */ }
  }
}

main().catch((error) => fail(String(error && error.message || error)));
