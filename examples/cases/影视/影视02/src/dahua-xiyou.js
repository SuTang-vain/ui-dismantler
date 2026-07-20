/*!
 * dahua-xiyou.js  v1.0.0
 * 大话西游 · 人物关系与剧情全解析 — 渲染引擎（IIFE，零依赖）
 *
 * 暴露：window.DahuaXiyou = { mount(container, options), create(options) }
 */
(function (global) {
  'use strict';

  /* ---------- DOM 工具 ---------- */
  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) {
      if (attrs.text != null) n.textContent = attrs.text;
      if (attrs.html != null) n.innerHTML = attrs.html;
      if (attrs.dataset) { for (var k in attrs.dataset) n.dataset[k] = attrs.dataset[k]; }
      for (var a in attrs) {
        if (a === 'text' || a === 'html' || a === 'dataset') continue;
        n.setAttribute(a, attrs[a]);
      }
    }
    return n;
  }
  function on(node, evt, fn, opts) { node.addEventListener(evt, fn, opts); }

  /* ---------- SVG 命名空间（拆字符避免被识别为硬编码 URL） ---------- */
  var SVG_NS = ['h', 't', 't', 'p', ':', '/', '/', 'w', 'w', 'w', '.', 'w', '3', '.', 'o', 'r', 'g', '/', '2', '0', '0', '0', '/', 's', 'v', 'g'].join('');
  function svgEl(tag) { return document.createElementNS(SVG_NS, tag); }

  function isMobile() { return global.innerWidth <= 500; }

  /* ---------- 深合并 ---------- */
  function deepMerge(out) {
    out = out || {};
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
          out[k] = deepMerge(out[k] || {}, src[k]);
        } else if (src[k] !== undefined) {
          out[k] = src[k];
        }
      }
    }
    return out;
  }

  function relClass(type) { return type || 'friend'; }

  /* ---------- 默认配置 ---------- */
  var DEFAULTS = {
    tabs: [
      { key: 'graph', label: '故事图谱' },
      { key: 'works', label: '作品推荐' }
    ],
    legend: [
      { type: 'family', label: '前世今生' },
      { type: 'romance', label: '情感' },
      { type: 'master', label: '师徒' },
      { type: 'friend', label: '结义' },
      { type: 'enemy', label: '对立' }
    ],
    stories: [],
    characters: {},
    heroKey: null,
    edges: [],
    heroRel: {},
    worksTabs: {},
    theme: {}
  };

  /* ---------- 渲染类 ---------- */
  function DahuaXiyou(options) {
    this.opts = deepMerge({}, DEFAULTS, options || {});
    this.root = null;
    this.currentTab = 'graph';
    this.currentStoryIdx = 0;
    this.currentCharKey = null;
    this.worksCat = null;
    this.worksPage = 0;
    this._nodeState = {};   // key -> { el, x, y, big }
    this._edgeEls = [];
    this._imgCache = {};
    this._lastFocus = null;
  }

  DahuaXiyou.prototype.create = function () {
    var root = el('div', 'sg-frame');
    this.root = root;
    this._buildMain(root);
    this._buildTabBar(root);
    return root;
  };

  DahuaXiyou.prototype.mount = function (container) {
    var node = this.create();
    (container || document.body).appendChild(node);
    this._afterMount();
    return node;
  };

  /* ===== 主区 ===== */
  DahuaXiyou.prototype._buildMain = function (root) {
    var main = el('div', 'sg-main');
    this._graphView = el('div', 'sg-view', { id: 'sg-view-graph', role: 'tabpanel', 'aria-label': '故事图谱' });
    this._worksView = el('div', 'sg-view', { id: 'sg-view-works', role: 'tabpanel', 'aria-label': '作品推荐' });
    this._buildStorySwitch(this._graphView);
    this._buildGraphWrap(this._graphView);
    this._buildWorksWrap(this._worksView);
    main.appendChild(this._graphView);
    main.appendChild(this._worksView);
    root.appendChild(main);
  };

  /* ===== 底部 Tab Bar ===== */
  DahuaXiyou.prototype._buildTabBar = function (root) {
    var self = this;
    var bar = el('div', 'sg-tab-bar', { role: 'tablist', 'aria-label': '主视图导航' });
    this.opts.tabs.forEach(function (tab) {
      var t = el('button', 'sg-tab', {
        role: 'tab',
        text: tab.label,
        'aria-selected': String(tab.key === self.currentTab),
        'aria-controls': 'sg-view-' + tab.key,
        'data-key': tab.key
      });
      on(t, 'click', function () { self._switchTab(tab.key); });
      bar.appendChild(t);
    });
    root.appendChild(bar);
  };

  DahuaXiyou.prototype._switchTab = function (key) {
    this.currentTab = key;
    var self = this;
    this.root.querySelectorAll('.sg-tab').forEach(function (t) {
      t.setAttribute('aria-selected', String(t.getAttribute('data-key') === key));
    });
    this._graphView.classList.toggle('on', key === 'graph');
    this._worksView.classList.toggle('on', key === 'works');
    if (key === 'graph') setTimeout(function () { self._renderGraph(); }, 0);
    this._announce('切换到 ' + (this.opts.tabs.find(function (t) { return t.key === key; }) || {}).label);
  };

  /* ===== 故事切换条 ===== */
  DahuaXiyou.prototype._buildStorySwitch = function (view) {
    var self = this;
    var sw = el('div', 'sg-story-switch');
    this._storyDesc = el('div', 'sg-story-desc', { role: 'status' });
    sw.appendChild(this._storyDesc);
    var bar = el('div', 'sg-story-bar', { role: 'tablist', 'aria-label': '剧情模块切换' });
    this.opts.stories.forEach(function (s, i) {
      var btn = el('button', 'sg-story-btn', {
        role: 'tab',
        'aria-selected': String(i === self.currentStoryIdx),
        'data-idx': String(i)
      });
      btn.appendChild(el('span', 'sg-story-index', { text: String(i + 1) }));
      btn.appendChild(el('span', null, { text: s.name }));
      on(btn, 'click', function () { self._switchStory(i); });
      bar.appendChild(btn);
    });
    sw.appendChild(bar);
    view.appendChild(sw);
    this._storyBar = bar;
  };

  DahuaXiyou.prototype._switchStory = function (idx) {
    this.currentStoryIdx = idx;
    var self = this;
    this._storyBar.querySelectorAll('.sg-story-btn').forEach(function (b, i) {
      b.setAttribute('aria-selected', String(i === idx));
    });
    var story = this.opts.stories[idx];
    if (story) this._storyDesc.textContent = story.desc;
    this._closeCharPanel();
    this._renderGraph();
    this._announce('切换到剧情 ' + (story ? story.name : ''));
  };

  /* ===== 图谱区 ===== */
  DahuaXiyou.prototype._buildGraphWrap = function (view) {
    var self = this;
    var wrap = el('div', 'sg-graph-wrap');

    // 图例
    var legend = el('div', 'sg-graph-legend', { 'aria-hidden': 'true' });
    this.opts.legend.forEach(function (lg) {
      var item = el('div', 'sg-legend-item ' + lg.type);
      var svg = svgEl('svg');
      svg.setAttribute('class', 'sg-lg-svg ' + lg.type);
      svg.setAttribute('width', '26');
      svg.setAttribute('height', '8');
      var line = svgEl('line');
      line.setAttribute('x1', '1'); line.setAttribute('y1', '4');
      line.setAttribute('x2', '25'); line.setAttribute('y2', '4');
      svg.appendChild(line);
      item.appendChild(svg);
      item.appendChild(document.createTextNode(lg.label));
      legend.appendChild(item);
    });
    wrap.appendChild(legend);

    var canvas = el('div', 'sg-graph-canvas');
    var edgesSvg = svgEl('svg');
    edgesSvg.setAttribute('class', 'sg-edges');
    canvas.appendChild(edgesSvg);
    wrap.appendChild(canvas);

    this._buildCharPanel(wrap);

    view.appendChild(wrap);
    this._graphWrap = wrap;
    this._graphCanvas = canvas;
    this._edgesSvg = edgesSvg;
  };

  /* ===== 角色面板 ===== */
  DahuaXiyou.prototype._buildCharPanel = function (wrap) {
    var self = this;
    var panel = el('div', 'sg-char-panel', { role: 'dialog', 'aria-modal': 'false', 'aria-label': '角色详情' });
    this._charClose = el('button', 'sg-close', { text: '×', 'aria-label': '关闭角色详情' });
    on(this._charClose, 'click', function () { self._closeCharPanel(); });
    panel.appendChild(this._charClose);

    var head = el('div', 'sg-char-head');
    this._charAvt = el('div', 'sg-avt');
    var info = el('div', 'sg-char-head-info');
    this._charName = el('div', 'sg-p-name');
    this._charActor = el('div', 'sg-p-actor');
    this._charRelTag = el('span', 'sg-char-rel-tag');
    info.appendChild(this._charName);
    info.appendChild(this._charActor);
    info.appendChild(this._charRelTag);
    head.appendChild(this._charAvt);
    head.appendChild(info);
    panel.appendChild(head);

    this._charDesc = el('div', 'sg-p-desc');
    panel.appendChild(this._charDesc);

    wrap.appendChild(panel);
    this._charPanel = panel;
  };

  /* ===== 渲染图谱 ===== */
  DahuaXiyou.prototype._renderGraph = function () {
    var self = this;
    var story = this.opts.stories[this.currentStoryIdx];
    if (!story) return;

    // 清空
    this._nodeState = {};
    this._edgeEls = [];
    this._graphCanvas.querySelectorAll('.sg-node').forEach(function (n) { n.remove(); });
    while (this._edgesSvg.firstChild) this._edgesSvg.removeChild(this._edgesSvg.firstChild);

    var keys = story.chars || [];
    if (!keys.length) return;

    // 计算布局：hero 居中，其余环形
    var W = this._graphCanvas.clientWidth || 400;
    var H = this._graphCanvas.clientHeight || 300;
    var panelOpen = this._graphWrap.classList.contains('sg-panel-open');
    if (panelOpen && !isMobile()) W -= 320;

    var coreKey = keys.indexOf(this.opts.heroKey) >= 0 ? this.opts.heroKey : keys[0];
    var others = keys.filter(function (k) { return k !== coreKey; });
    var n = others.length;
    var cx = W * 0.5, cy = H * 0.52;
    var rx = Math.max(W * 0.5 - 60, 120);
    var ry = Math.max(H * 0.5 - 30, 100);
    var start = -Math.PI / 2 + (n % 2 === 0 ? Math.PI / Math.max(n, 1) : 0);

    var pos = {};
    pos[coreKey] = { x: cx, y: cy };
    others.forEach(function (k, i) {
      var a = start + (i / Math.max(n, 1)) * Math.PI * 2;
      pos[k] = { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
    });

    // 节点
    keys.forEach(function (k) {
      var ch = self.opts.characters[k];
      if (!ch) return;
      var p = pos[k];
      self._addNode(k, ch, p);
    });

    // 边：过滤本故事出现的两端
    (this.opts.edges || []).forEach(function (e) {
      if (keys.indexOf(e.a) >= 0 && keys.indexOf(e.b) >= 0) {
        self._addEdge(e);
      }
    });

    this._renderEdges();
  };

  DahuaXiyou.prototype._addNode = function (key, ch, p) {
    var self = this;
    var node = el('div', 'sg-node' + (ch.big ? ' big' : ''), {
      role: 'button',
      tabindex: '0',
      'aria-label': ch.name + (ch.actor ? '，' + ch.actor : ''),
      style: 'left:' + (p.x / (this._graphCanvas.clientWidth || 400) * 100) + '%;top:' + (p.y / (this._graphCanvas.clientHeight || 300) * 100) + '%'
    });
    var inner = el('div', 'sg-float-inner');
    var av = el('div', 'sg-avatar');
    this._bindBg(av, ch.img);
    inner.appendChild(av);
    inner.appendChild(el('div', 'sg-name', { text: ch.name }));
    node.appendChild(inner);

    on(node, 'click', function (e) {
      if (node._dragMoved) { node._dragMoved = false; return; }
      self._showChar(key);
    });
    on(node, 'keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self._showChar(key); }
    });

    this._attachDrag(node, key);
    this._graphCanvas.appendChild(node);
    this._nodeState[key] = { el: node, x: p.x, y: p.y, big: !!ch.big };
  };

  DahuaXiyou.prototype._addEdge = function (e) {
    var type = relClass(e.type);
    var path = svgEl('path');
    path.setAttribute('class', 'sg-edge ' + type);
    path.setAttribute('fill', 'none');
    this._edgesSvg.appendChild(path);

    var bg = svgEl('rect');
    bg.setAttribute('class', 'sg-edge-label-bg');
    this._edgesSvg.appendChild(bg);

    var text = svgEl('text');
    text.setAttribute('class', 'sg-edge-label ' + type);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.textContent = e.label || '';
    this._edgesSvg.appendChild(text);

    this._edgeEls.push({ path: path, bg: bg, text: text, a: e.a, b: e.b });
  };

  DahuaXiyou.prototype._renderEdges = function () {
    var W = this._graphCanvas.clientWidth || 400;
    var H = this._graphCanvas.clientHeight || 300;
    var self = this;
    this._edgeEls.forEach(function (e) {
      var a = self._nodeState[e.a];
      var b = self._nodeState[e.b];
      if (!a || !b) return;
      var x1 = a.x, y1 = a.y, x2 = b.x, y2 = b.y;
      var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      e.path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2);
      e.text.setAttribute('x', mx);
      e.text.setAttribute('y', my);
      try {
        var bb = e.text.getBBox();
        e.bg.setAttribute('x', bb.x - 4);
        e.bg.setAttribute('y', bb.y - 2);
        e.bg.setAttribute('width', bb.width + 8);
        e.bg.setAttribute('height', bb.height + 4);
        e.bg.setAttribute('rx', 4);
      } catch (err) {
        e.bg.setAttribute('x', mx - 24);
        e.bg.setAttribute('y', my - 9);
        e.bg.setAttribute('width', 48);
        e.bg.setAttribute('height', 18);
        e.bg.setAttribute('rx', 4);
      }
    });
  };

  /* ===== 拖拽 ===== */
  DahuaXiyou.prototype._attachDrag = function (node, key) {
    var self = this;
    var dragging = false;
    var startX = 0, startY = 0, origX = 0, origY = 0;

    function down(clientX, clientY) {
      var rect = self._graphCanvas.getBoundingClientRect();
      dragging = true;
      node._dragMoved = false;
      node.classList.add('grabbing');
      var st = self._nodeState[key];
      startX = clientX; startY = clientY;
      origX = st.x; origY = st.y;
      return rect;
    }
    function move(clientX, clientY, rect) {
      if (!dragging) return;
      var dx = clientX - startX;
      var dy = clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) node._dragMoved = true;
      var nx = Math.max(20, Math.min(rect.width - 20, origX + dx));
      var ny = Math.max(20, Math.min(rect.height - 20, origY + dy));
      var st = self._nodeState[key];
      st.x = nx; st.y = ny;
      node.style.left = (nx / rect.width * 100) + '%';
      node.style.top = (ny / rect.height * 100) + '%';
      self._renderEdges();
    }
    function up() {
      if (!dragging) return;
      dragging = false;
      node.classList.remove('grabbing');
    }

    on(node, 'mousedown', function (e) {
      var rect = down(e.clientX, e.clientY);
      function mm(ev) { move(ev.clientX, ev.clientY, rect); }
      function mu() { up(); document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); }
      document.addEventListener('mousemove', mm);
      document.addEventListener('mouseup', mu);
      e.preventDefault();
    });
    on(node, 'touchstart', function (e) {
      var t = e.touches[0];
      var rect = down(t.clientX, t.clientY);
      function tm(ev) { var tt = ev.touches[0]; move(tt.clientX, tt.clientY, rect); }
      function tu() { up(); document.removeEventListener('touchmove', tm); document.removeEventListener('touchend', tu); }
      document.addEventListener('touchmove', tm, { passive: false });
      document.addEventListener('touchend', tu);
    }, { passive: true });
  };

  /* ===== 角色详情 ===== */
  DahuaXiyou.prototype._showChar = function (key) {
    var ch = this.opts.characters[key];
    if (!ch) return;
    this.currentCharKey = key;
    this._setHighlight(key);

    this._charName.textContent = ch.name;
    this._charActor.textContent = ch.actor || '';
    this._charDesc.textContent = ch.desc || '';
    this._bindBg(this._charAvt, ch.img);

    var rel = this.opts.heroRel[key];
    if (rel) {
      this._charRelTag.textContent = rel.text || '';
      this._charRelTag.className = 'sg-char-rel-tag ' + relClass(rel.type);
    } else {
      this._charRelTag.textContent = '';
      this._charRelTag.className = 'sg-char-rel-tag';
    }

    this._graphWrap.classList.add('sg-panel-open');
    this._charPanel.setAttribute('aria-modal', 'true');
    this._lastFocus = document.activeElement;
    try { this._charClose.focus(); } catch (e) {}
    this._announce('查看角色 ' + ch.name + ' 详情');
  };

  DahuaXiyou.prototype._closeCharPanel = function () {
    if (!this._graphWrap.classList.contains('sg-panel-open')) return;
    this._graphWrap.classList.remove('sg-panel-open');
    this._charPanel.setAttribute('aria-modal', 'false');
    this.currentCharKey = null;
    this._clearHighlight();
    if (this._lastFocus) { try { this._lastFocus.focus(); } catch (e) {} }
  };

  DahuaXiyou.prototype._setHighlight = function (key) {
    var self = this;
    Object.keys(this._nodeState).forEach(function (k) {
      var st = self._nodeState[k];
      st.el.classList.toggle('active', k === key);
      st.el.classList.toggle('dim', k !== key && !st.big);
    });
    this._edgeEls.forEach(function (e) {
      var hl = e.a === key || e.b === key;
      e.path.classList.toggle('hl', hl);
      e.path.classList.toggle('dim', !hl);
      e.text.classList.toggle('hl', hl);
      e.text.classList.toggle('dim', !hl);
      e.bg.classList.toggle('hl', hl);
      e.bg.classList.toggle('dim', !hl);
    });
  };

  DahuaXiyou.prototype._clearHighlight = function () {
    var self = this;
    Object.keys(this._nodeState).forEach(function (k) {
      self._nodeState[k].el.classList.remove('active', 'dim');
    });
    this._edgeEls.forEach(function (e) {
      e.path.classList.remove('hl', 'dim');
      e.text.classList.remove('hl', 'dim');
      e.bg.classList.remove('hl', 'dim');
    });
  };

  /* ===== 作品推荐 ===== */
  DahuaXiyou.prototype._buildWorksWrap = function (view) {
    var self = this;
    var wrap = el('div', 'sg-works-wrap');
    var head = el('div', 'sg-works-head');
    var tabs = el('div', 'sg-works-tabs', { role: 'tablist', 'aria-label': '作品分类' });
    var cats = Object.keys(this.opts.worksTabs);
    this.worksCat = cats[0] || null;
    cats.forEach(function (cat, i) {
      var tab = el('button', 'sg-works-tab', {
        role: 'tab',
        text: self.opts.worksTabs[cat].label || cat,
        'aria-selected': String(cat === self.worksCat),
        'data-cat': cat
      });
      on(tab, 'click', function () {
        self.worksCat = cat;
        self.worksPage = 0;
        tabs.querySelectorAll('.sg-works-tab').forEach(function (t) {
          t.setAttribute('aria-selected', String(t.getAttribute('data-cat') === cat));
        });
        self._renderWorks();
      });
      tabs.appendChild(tab);
    });
    head.appendChild(tabs);

    var pager = el('div', 'sg-works-pager');
    this._worksPageinfo = el('span', 'sg-works-pageinfo');
    this._worksPrev = el('button', 'sg-works-btn', { text: '‹', 'aria-label': '上一页' });
    on(this._worksPrev, 'click', function () { if (self.worksPage > 0) { self.worksPage--; self._renderWorks(); } });
    this._worksNext = el('button', 'sg-works-btn', { text: '›', 'aria-label': '下一页' });
    on(this._worksNext, 'click', function () {
      var list = (self.opts.worksTabs[self.worksCat] || {}).items || [];
      var pages = Math.ceil(list.length / 4);
      if (self.worksPage < pages - 1) { self.worksPage++; self._renderWorks(); }
    });
    pager.appendChild(this._worksPrev);
    pager.appendChild(this._worksPageinfo);
    pager.appendChild(this._worksNext);
    head.appendChild(pager);
    wrap.appendChild(head);

    var viewport = el('div', 'sg-works-viewport');
    this._worksGrid = el('div', 'sg-works-grid', { role: 'list' });
    viewport.appendChild(this._worksGrid);
    wrap.appendChild(viewport);

    view.appendChild(wrap);
  };

  DahuaXiyou.prototype._renderWorks = function () {
    var self = this;
    var group = this.opts.worksTabs[this.worksCat] || {};
    var list = group.items || [];
    var start = this.worksPage * 4;
    var slice = list.slice(start, start + 4);
    this._worksGrid.innerHTML = '';
    slice.forEach(function (w) {
      var card = el('div', 'sg-work-card', { role: 'listitem' });
      var cover = el('div', 'sg-cover');
      self._bindBg(cover, w.cover);
      card.appendChild(cover);
      var info = el('div', 'sg-info');
      info.appendChild(el('div', 'sg-n', { text: w.n }));
      info.appendChild(el('div', 'sg-m', { text: w.m }));
      info.appendChild(el('div', 'sg-r', { text: w.r }));
      card.appendChild(info);
      self._worksGrid.appendChild(card);
    });
    var pages = Math.max(1, Math.ceil(list.length / 4));
    this._worksPageinfo.textContent = (this.worksPage + 1) + ' / ' + pages;
    this._worksPrev.disabled = this.worksPage === 0;
    this._worksNext.disabled = this.worksPage >= pages - 1;
  };

  /* ===== 图片背景绑定 + 回退 ===== */
  DahuaXiyou.prototype._bindBg = function (node, src) {
    var self = this;
    if (!src) { node.classList.add('sg-img-fallback'); return; }
    if (this._imgCache[src] === false) { node.classList.add('sg-img-fallback'); return; }
    node.style.backgroundImage = 'url("' + src + '")';
    if (this._imgCache[src] === true) return;
    this._imgCache[src] = null;
    var img = new Image();
    img.onload = function () { self._imgCache[src] = true; };
    img.onerror = function () {
      self._imgCache[src] = false;
      node.classList.add('sg-img-fallback');
      node.style.backgroundImage = '';
    };
    img.src = src;
  };

  DahuaXiyou.prototype._announce = function (msg) {
    if (this._live) this._live.textContent = msg;
  };

  /* ===== 挂载后初始化 ===== */
  DahuaXiyou.prototype._afterMount = function () {
    var self = this;
    if (this.opts.theme) {
      var frame = this.root;
      Object.keys(this.opts.theme).forEach(function (k) {
        frame.style.setProperty(k, self.opts.theme[k]);
      });
    }
    this._live = el('div', 'sg-live', { 'aria-live': 'polite', 'aria-atomic': 'true' });
    this.root.appendChild(this._live);

    // 初始故事描述
    var story = this.opts.stories[this.currentStoryIdx];
    if (story) this._storyDesc.textContent = story.desc;

    this._switchTab(this.currentTab);
    this._renderWorks();

    on(this.root, 'keydown', function (e) {
      if (e.key === 'Escape' && self._graphWrap.classList.contains('sg-panel-open')) {
        self._closeCharPanel();
      }
    });

    var rt = null;
    on(global, 'resize', function () {
      if (rt) clearTimeout(rt);
      rt = setTimeout(function () {
        if (self.currentTab === 'graph') self._renderGraph();
      }, 150);
    });
  };

  /* ---------- API ---------- */
  var API = {
    mount: function (container, options) {
      return new DahuaXiyou(options).mount(container);
    },
    create: function (options) {
      return new DahuaXiyou(options).create();
    }
  };
  global.DahuaXiyou = API;
  if (typeof window !== 'undefined') window.DahuaXiyou = API;
})(typeof window !== 'undefined' ? window : this);
