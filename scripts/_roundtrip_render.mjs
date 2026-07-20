// 用 jsdom 执行原页面或组件库示例，并导出结构化 DOM。
//
// 用法：
//   node _roundtrip_render.mjs <html> --ref [--width 1024 --height 768]
//   node _roundtrip_render.mjs <example.html> [--width 1024 --height 768]
//
// 本地 CSS/JS 会按 DOM 顺序内联；远程资源不会发起网络请求。

import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { JSDOM, VirtualConsole } from 'jsdom';

const args = process.argv.slice(2);
const htmlPath = args[0];
const isReference = args.includes('--ref');
const scenarioFile = readStringArg('--scenario-file');
const scenarioId = readStringArg('--scenario-id');
const selectedScenario = loadScenario(scenarioFile, scenarioId);
const defaultWidth = readPositiveIntArg('--width', 1024);
const defaultHeight = readPositiveIntArg('--height', 768);
const width = selectedScenario && selectedScenario.viewport && selectedScenario.viewport.width
  ? selectedScenario.viewport.width
  : defaultWidth;
const height = selectedScenario && selectedScenario.viewport && selectedScenario.viewport.height
  ? selectedScenario.viewport.height
  : defaultHeight;

if (!htmlPath) {
  console.error('用法: node _roundtrip_render.mjs <html> [--ref] [--width N --height N]');
  process.exit(2);
}

const absHtmlPath = resolve(htmlPath);
if (!existsSync(absHtmlPath)) {
  output({ ok: false, error: `文件不存在: ${absHtmlPath}` });
  process.exit(0);
}

function readPositiveIntArg(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = Number.parseInt(args[index + 1], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readStringArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function loadScenario(path, id) {
  if (!path && !id) return null;
  if (!path || !id) throw new Error('--scenario-file 与 --scenario-id 必须同时提供');
  const absolute = resolve(path);
  if (!existsSync(absolute)) throw new Error(`场景文件不存在: ${absolute}`);
  const document = JSON.parse(readFileSync(absolute, 'utf-8'));
  const scenarios = Array.isArray(document.scenarios) ? document.scenarios : [];
  const scenario = scenarios.find((item) => item && item.id === id);
  if (!scenario) throw new Error(`场景不存在: ${id}`);
  return scenario;
}

function output(value) {
  console.log(JSON.stringify(value));
}

function cleanResourcePath(resource) {
  return decodeURIComponent(resource.split('#', 1)[0].split('?', 1)[0]);
}

function isLocalResource(resource) {
  if (!resource || resource.startsWith('//')) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(resource) || resource.startsWith('file:');
}

function resolveLocalResource(baseDir, resource) {
  const cleaned = cleanResourcePath(resource);
  if (cleaned.startsWith('file:')) return new URL(cleaned).pathname;
  if (cleaned.startsWith('/')) {
    let candidateDir = baseDir;
    while (candidateDir && candidateDir !== dirname(candidateDir)) {
      const candidate = resolve(candidateDir, `.${cleaned}`);
      if (existsSync(candidate)) return candidate;
      candidateDir = dirname(candidateDir);
    }
  }
  return resolve(baseDir, cleaned);
}

function isExecutableScript(script) {
  const type = (script.getAttribute('type') || '').trim().toLowerCase();
  return ['', 'text/javascript', 'application/javascript', 'module'].includes(type);
}

function runtimeBootstrap(viewportWidth, viewportHeight) {
  return `
    window.__roundtripErrors = [];
    window.addEventListener('error', function (event) {
      var message = event && (event.error && event.error.message || event.message);
      window.__roundtripErrors.push(String(message || event || 'unknown error'));
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: ${viewportWidth} });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: ${viewportHeight} });
    window.matchMedia = window.matchMedia || function (query) {
      var minWidth = /min-width\\s*:\\s*(\\d+)px/i.exec(query);
      var maxWidth = /max-width\\s*:\\s*(\\d+)px/i.exec(query);
      var minHeight = /min-height\\s*:\\s*(\\d+)px/i.exec(query);
      var maxHeight = /max-height\\s*:\\s*(\\d+)px/i.exec(query);
      var matches = (!minWidth || ${viewportWidth} >= Number(minWidth[1])) &&
        (!maxWidth || ${viewportWidth} <= Number(maxWidth[1])) &&
        (!minHeight || ${viewportHeight} >= Number(minHeight[1])) &&
        (!maxHeight || ${viewportHeight} <= Number(maxHeight[1]));
      return { media: query, matches: matches, onchange: null,
        addListener: function () {}, removeListener: function () {},
        addEventListener: function () {}, removeEventListener: function () {},
        dispatchEvent: function () { return false; } };
    };
    if (!window.IntersectionObserver) {
      window.IntersectionObserver = function (callback) {
        this.observe = function (element) {
          setTimeout(function () {
            callback([{ target: element, isIntersecting: true, intersectionRatio: 1 }], this);
          }.bind(this), 0);
        };
        this.unobserve = function () {};
        this.disconnect = function () {};
        this.takeRecords = function () { return []; };
      };
    }
    window.tailwind = window.tailwind || { config: {}, theme: { extend: {} } };
    window.marked = window.marked || { parse: function (text) { return text; } };
    window.DOMPurify = window.DOMPurify || { sanitize: function (text) { return text; } };
    window.mermaid = window.mermaid || {
      initialize: function () {}, run: function () {},
      render: function (_id, _text, callback) { if (callback) callback({ svg: '' }); }
    };
    if (window.HTMLCanvasElement) {
      window.HTMLCanvasElement.prototype.getContext = function () {
        return {
          clearRect: function () {}, fillRect: function () {}, strokeRect: function () {},
          beginPath: function () {}, closePath: function () {}, moveTo: function () {},
          lineTo: function () {}, arc: function () {}, fill: function () {}, stroke: function () {},
          save: function () {}, restore: function () {}, translate: function () {},
          rotate: function () {}, scale: function () {}, drawImage: function () {},
          setTransform: function () {}, transform: function () {}, rect: function () {},
          clip: function () {}, fillText: function () {}, strokeText: function () {},
          measureText: function () { return { width: 0 }; },
          getImageData: function () { return { data: [] }; },
          putImageData: function () {}, createImageData: function () { return { data: [] }; },
          createLinearGradient: function () { return { addColorStop: function () {} }; },
          createRadialGradient: function () { return { addColorStop: function () {} }; },
          canvas: this
        };
      };
    }
  `;
}

function prepareHtml(sourceHtml, baseDir) {
  const parsed = new JSDOM(sourceHtml);
  const document = parsed.window.document;
  const diagnostics = {
    cssFiles: 0,
    jsFiles: 0,
    inlineScripts: 0,
    missingFiles: [],
    remoteResources: [],
    unsupportedModules: [],
  };

  for (const link of [...document.querySelectorAll('link[rel~="stylesheet"][href]')]) {
    const href = link.getAttribute('href');
    if (!isLocalResource(href)) {
      diagnostics.remoteResources.push(href);
      link.remove();
      continue;
    }
    const path = resolveLocalResource(baseDir, href);
    if (!existsSync(path)) {
      diagnostics.missingFiles.push(href);
      link.remove();
      continue;
    }
    const style = document.createElement('style');
    style.setAttribute('data-roundtrip-source', href);
    style.textContent = readFileSync(path, 'utf-8');
    link.replaceWith(style);
    diagnostics.cssFiles += 1;
  }

  for (const script of [...document.querySelectorAll('script')]) {
    const src = script.getAttribute('src');
    if (!src) {
      if ((script.getAttribute('type') || '').trim().toLowerCase() === 'module') {
        diagnostics.unsupportedModules.push('inline module');
        script.remove();
        continue;
      }
      if (isExecutableScript(script) && script.textContent.trim()) diagnostics.inlineScripts += 1;
      continue;
    }
    if (!isLocalResource(src)) {
      diagnostics.remoteResources.push(src);
      script.remove();
      continue;
    }
    const path = resolveLocalResource(baseDir, src);
    if (!existsSync(path)) {
      diagnostics.missingFiles.push(src);
      script.remove();
      continue;
    }
    if ((script.getAttribute('type') || '').trim().toLowerCase() === 'module') {
      diagnostics.unsupportedModules.push(src);
      script.remove();
      continue;
    }
    script.removeAttribute('src');
    script.setAttribute('data-roundtrip-source', src);
    script.textContent = readFileSync(path, 'utf-8');
    diagnostics.jsFiles += 1;
  }

  const bootstrap = document.createElement('script');
  bootstrap.textContent = runtimeBootstrap(width, height);
  (document.head || document.documentElement).prepend(bootstrap);
  const serialized = '<!doctype html>\n' + document.documentElement.outerHTML;
  parsed.window.close();
  return { html: serialized, diagnostics };
}

const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'title', 'head']);
const MAX_NODES = 5000;
const MAX_DEPTH = 40;

function serialize(root) {
  let nodeCount = 0;

  function visit(node, depth = 0) {
    if (nodeCount >= MAX_NODES || depth > MAX_DEPTH) return null;
    if (node.nodeType === 3) {
      const text = node.textContent.trim();
      if (!text) return null;
      nodeCount += 1;
      return { tag: '#text', text: text.length > 500 ? `${text.slice(0, 500)}...` : text };
    }
    if (node.nodeType !== 1) return null;
    const tag = node.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return null;
    nodeCount += 1;
    const classes = (node.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    const children = [];
    for (const child of node.childNodes) {
      const result = visit(child, depth + 1);
      if (result) children.push(result);
    }
    const result = { tag, classes };
    if (children.length === 1 && children[0].tag === '#text') {
      result.text = children[0].text;
    } else if (children.length) {
      result.children = children;
    }
    return result;
  }

  return { tree: visit(root), nodeCount };
}

function collectTexts(root) {
  const texts = [];
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  let node;
  while ((node = walker.nextNode())) {
    const parentTag = node.parentElement && node.parentElement.tagName.toLowerCase();
    if (parentTag === 'script' || parentTag === 'style') continue;
    const text = node.textContent.trim();
    if (text) texts.push(text);
  }
  return texts;
}

async function waitForSettled(window, root) {
  if (window.document.readyState !== 'complete') {
    await Promise.race([
      new Promise((resolveWait) => window.addEventListener('load', resolveWait, { once: true })),
      new Promise((resolveWait) => setTimeout(resolveWait, 250)),
    ]);
  }
  let previous = '';
  let stablePasses = 0;
  let waitedMs = 0;
  while (waitedMs < 700) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    waitedMs += 20;
    const signature = `${root ? root.childNodes.length : -1}:${root ? root.textContent.length : -1}:${root ? root.innerHTML.length : -1}`;
    stablePasses = signature === previous ? stablePasses + 1 : 0;
    previous = signature;
    if (waitedMs >= 80 && stablePasses >= 3) break;
  }
  return waitedMs;
}

function selectorForRole(target, role) {
  if (typeof target === 'string') return target;
  if (!target || typeof target !== 'object') return null;
  return target[role] || target.default || null;
}

function queryTarget(window, target, role, required = true) {
  const selector = selectorForRole(target, role);
  if (!selector) {
    if (required) throw new Error(`缺少 ${role} selector`);
    return window.document;
  }
  const element = window.document.querySelector(selector);
  if (!element) throw new Error(`selector 未命中: ${selector}`);
  return element;
}

function isElementVisible(window, element) {
  let current = element;
  while (current && current.nodeType === 1) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
    const inline = current.style;
    if (inline && (inline.display === 'none' || inline.visibility === 'hidden')) return false;
    const computed = window.getComputedStyle(current);
    if (computed && (computed.display === 'none' || computed.visibility === 'hidden')) return false;
    current = current.parentElement;
  }
  return true;
}

function elementText(element) {
  const renderedText = typeof element.innerText === 'string' ? element.innerText : '';
  return (renderedText || element.textContent || '').trim();
}

function evaluateAssertion(window, assertion, role, index) {
  const result = {
    index,
    target: selectorForRole(assertion.target, role),
    ok: true,
    checks: [],
  };
  try {
    const element = queryTarget(window, assertion.target, role);
    function check(kind, expected, actual, passed) {
      result.checks.push({ kind, expected, actual, ok: passed });
      if (!passed) result.ok = false;
    }
    if ('visible' in assertion) {
      const actual = isElementVisible(window, element);
      check('visible', assertion.visible, actual, actual === assertion.visible);
    }
    if ('text' in assertion) {
      const actual = elementText(element);
      check('text', assertion.text, actual, actual === assertion.text);
    }
    if ('textContains' in assertion) {
      const actual = elementText(element);
      check('textContains', assertion.textContains, actual, actual.includes(assertion.textContains));
    }
    if ('value' in assertion) {
      const actual = 'value' in element ? String(element.value) : null;
      check('value', assertion.value, actual, actual === assertion.value);
    }
    if ('focused' in assertion) {
      const actual = window.document.activeElement === element;
      check('focused', assertion.focused, actual, actual === assertion.focused);
    }
    for (const className of assertion.classIncludes || []) {
      check('classIncludes', className, [...element.classList], element.classList.contains(className));
    }
    for (const className of assertion.classExcludes || []) {
      check('classExcludes', className, [...element.classList], !element.classList.contains(className));
    }
    for (const [name, expected] of Object.entries(assertion.attributes || {})) {
      const actual = element.getAttribute(name);
      check(`attribute:${name}`, expected, actual, actual === expected);
    }
  } catch (error) {
    result.ok = false;
    result.error = String(error && error.message || error);
  }
  return result;
}

async function executeScenario(window, scenario, role, root) {
  if (!scenario) return null;
  if (!Array.isArray(scenario.steps)) {
    return {
      ok: false,
      id: scenario.id,
      label: scenario.label || scenario.id,
      steps: [],
      error: 'steps 必须是数组',
    };
  }
  const results = [];
  for (let index = 0; index < scenario.steps.length; index += 1) {
    const step = scenario.steps[index];
    const result = { index, action: step && step.action, ok: false };
    try {
      if (!step || typeof step !== 'object') throw new Error('step 必须是 object');
      if (step.action === 'click') {
        const element = queryTarget(window, step.target, role);
        element.click();
        result.target = selectorForRole(step.target, role);
      } else if (step.action === 'input') {
        const element = queryTarget(window, step.target, role);
        element.focus();
        element.value = step.value;
        element.dispatchEvent(new window.Event('input', { bubbles: true, cancelable: true }));
        if (step.commit !== false) {
          element.dispatchEvent(new window.Event('change', { bubbles: true, cancelable: true }));
        }
        result.target = selectorForRole(step.target, role);
        result.value = step.value;
      } else if (step.action === 'key') {
        const element = queryTarget(window, step.target, role, false);
        if (element.focus) element.focus();
        const options = {
          key: step.key,
          code: step.code || '',
          bubbles: true,
          cancelable: true,
          altKey: Boolean(step.altKey),
          ctrlKey: Boolean(step.ctrlKey),
          metaKey: Boolean(step.metaKey),
          shiftKey: Boolean(step.shiftKey),
        };
        element.dispatchEvent(new window.KeyboardEvent('keydown', options));
        element.dispatchEvent(new window.KeyboardEvent('keyup', options));
        result.target = selectorForRole(step.target, role) || 'document';
        result.key = step.key;
      } else if (step.action === 'wait') {
        await new Promise((resolveWait) => setTimeout(resolveWait, step.ms));
        result.ms = step.ms;
      } else {
        throw new Error(`不支持的 action: ${step.action}`);
      }
      if (step.action !== 'wait') await waitForSettled(window, root);
      result.ok = true;
    } catch (error) {
      result.error = String(error && error.message || error);
      results.push(result);
      return { ok: false, id: scenario.id, label: scenario.label || scenario.id, steps: results };
    }
    results.push(result);
  }
  if (!Array.isArray(scenario.assertions)) {
    return {
      ok: false,
      id: scenario.id,
      label: scenario.label || scenario.id,
      steps: results,
      assertions: [],
      error: 'assertions 必须是数组',
    };
  }
  const assertions = scenario.assertions.map((assertion, index) =>
    evaluateAssertion(window, assertion, role, index));
  return {
    ok: assertions.every((assertion) => assertion.ok),
    id: scenario.id,
    label: scenario.label || scenario.id,
    steps: results,
    assertions,
  };
}

try {
  const sourceHtml = readFileSync(absHtmlPath, 'utf-8');
  const prepared = prepareHtml(sourceHtml, dirname(absHtmlPath));
  const jsdomErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => jsdomErrors.push(String(error && error.message || error)));
  const dom = new JSDOM(prepared.html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://roundtrip.local/',
    virtualConsole,
  });
  const { window } = dom;
  const root = isReference
    ? window.document.body
    : window.document.getElementById('mount');
  let waitedMs = await waitForSettled(window, root);

  if (!root) {
    output({
      ok: false,
      mode: isReference ? 'reference' : 'library',
      error: isReference ? '原页面缺少 body' : '组件库示例缺少 #mount',
      ...prepared.diagnostics,
    });
    process.exit(0);
  }

  const role = isReference ? 'reference' : 'library';
  const scenario = await executeScenario(window, selectedScenario, role, root);
  if (scenario && !scenario.ok) {
    output({
      ok: false,
      mode: isReference ? 'reference' : 'library',
      error: `场景执行失败: ${scenario.id}`,
      scenario,
      viewport: { width, height },
      runtimeErrors: [...(window.__roundtripErrors || []), ...jsdomErrors].slice(0, 5),
      ...prepared.diagnostics,
    });
    process.exit(0);
  }
  if (scenario) waitedMs += await waitForSettled(window, root);

  const serialized = serialize(root);
  const texts = collectTexts(root);
  const meaningful = root.children.length > 0 || texts.length > 0;
  if (!meaningful) {
    output({
      ok: false,
      mode: isReference ? 'reference' : 'library',
      error: isReference ? '原页面运行后 body 为空' : '组件库运行后 #mount 为空',
      waitedMs,
      runtimeErrors: [...(window.__roundtripErrors || []), ...jsdomErrors].slice(0, 5),
      ...prepared.diagnostics,
    });
    process.exit(0);
  }

  output({
    ok: true,
    mode: isReference ? 'reference' : 'library',
    viewport: { width, height },
    waitedMs,
    childCount: root.children.length,
    dom: serialized.tree,
    serializedNodes: serialized.nodeCount,
    texts,
    textCount: texts.length,
    runtimeErrors: [...(window.__roundtripErrors || []), ...jsdomErrors].slice(0, 5),
    scenario,
    ...prepared.diagnostics,
  });
  process.exit(0);
} catch (error) {
  output({ ok: false, error: String(error && error.message || error) });
  process.exit(0);
}
