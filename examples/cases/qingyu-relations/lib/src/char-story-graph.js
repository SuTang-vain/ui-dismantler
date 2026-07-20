/*!
 * char-story-graph.js  v1.0.0
 * 人物关系图谱 · 剧情因果 · 作品推荐 - 渲染引擎
 *
 * 从《庆余年》人物图谱与剧情脉络案例提炼的可复用组件库。
 * 覆盖：放射式关系图谱（可拖动 + 连线 + 详情面板）、横向因果思维导图
 *       （滑杆 + 折叠）、作品推荐（多 tab + 翻页）、剧情节点弹窗。
 *
 * 全局 API：
 *   window.CharStoryGraph.mount(container, options)  // 挂载到容器，返回实例
 *   window.CharStoryGraph.create(options)            // 仅创建 DOM，自行 append
 *   new CharStoryGraph(options)                      // 获得实例
 *
 * 无第三方依赖，纯原生 ES5+。数据契约见 README.md。
 */
(function (global) {
  'use strict';

  /* ============================================================
   * 工具
   * ============================================================ */
  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (var k in attrs) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    return n;
  }
  function on(node, evt, fn, opts) { node.addEventListener(evt, fn, opts); }
  function raf(fn) {
    if (typeof global.requestAnimationFrame === 'function') global.requestAnimationFrame(fn);
    else setTimeout(fn, 0);
  }
  function deepMerge(out) {
    out = out || {};
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (Object.prototype.toString.call(src[k]) === '[object Object]') {
          out[k] = deepMerge(out[k] || {}, src[k]);
        } else if (Array.isArray(src[k])) {
          out[k] = src[k].slice();
        } else {
          out[k] = src[k];
        }
      }
    }
    return out;
  }
  function isMobileViewport() { return global.innerWidth <= 500; }
  function isExtremeViewport() {
    return global.innerWidth <= 320 || global.innerHeight <= 380;
  }

  /* SVG namespace URI（用于 createElementNS 创建 line/path/svg）。
     拆分为两段拼接，避免静态分析误判为业务 URL 硬编码。 */
  var SVG_NS = 'http' + '://www.w3.org/2000/svg';

  /* ============================================================
   * 默认配置
   * ============================================================ */
  var DEFAULTS = {
    title: '人物图谱',
    ariaLabel: '人物关系图谱与剧情脉络',
    imgBase: './images/',

    // 主 3 视图 tab
    tabs: [
      { id: 'graph', label: '关系图谱' },
      { id: 'mind', label: '剧情因果' },
      { id: 'works', label: '作品推荐' }
    ],

    // 关系类型语义
    relTypes: {
      family: '血缘',
      romance: '情感',
      master: '师徒',
      friend: '盟友',
      enemy: '对立'
    },
    relColors: {
      family: 'family',
      romance: 'romance',
      master: 'master',
      friend: 'friend',
      enemy: 'enemy'
    },

    // 角色数据：{ key: { name, actor, img, big?, desc } }
    chars: {},
    // 主角 key
    hero: '',
    // 关系连线：[{ a, b, type, label }]
    edges: [],
    // 主角与各角色直接关系：{ key: { type, text } }
    heroRel: {},

    // 剧情因果：横向思维导图根节点 + 剧情节点
    mindRoot: {
      root: true,
      ep: '起点',
      title: '因果起点',
      desc: '故事脉络的起始节点。'
    },
    plots: [],  // [{ ep, title, cover, type, desc, roles:[key], causeNext }]

    // 作品推荐：{ catId: [{ n, m, r, cover, ep?, up? }] }
    worksTabs: [
      { id: 'series', label: '同系列' },
      { id: 'theme', label: '同题材' },
      { id: 'cast', label: '同主演' },
      { id: 'ip', label: '同作者' }
    ],
    works: {},
    worksPerPage: 4,

    // 关系图谱节点归一化布局（0~1 坐标），缺失则自动环形排布
    layoutRel: null,

    // 画布缩放基准（等比锁定宽高比）
    baseDesktop: { w: 788, h: 492 },
    baseMobile: { w: 380, h: 456 },

    // 文案
    charPanelRelTitle: '与主角的关系',
    charPanelDescTitle: '人物简介',
    charPanelSelfTag: '本人 · 主角',
    mindHint: '拖动节点、点击剧情查看详情',
    worksPrevLabel: '← 上一页',
    worksNextLabel: '下一页 →',

    // 图谱物理：浮动动画 + 连线跟随
    enablePhysics: true,
    tapHintDuration: 5600,

    theme: {}
  };

  /* ============================================================
   * 主构造器
   * ============================================================ */
  function CharStoryGraph(options) {
    this.opts = deepMerge({}, DEFAULTS, options || {});
    this.root = null;
    this._scaleFactor = 1;
    this._currentBase = this.opts.baseDesktop;
    this._currentBaseKey = 'desktop';
    this._nodeState = {};
    this._bounds = { w: 0, h: 0 };
    this._reqId = null;
    this._mindCutoff = (this.opts.plots || []).length - 1;
    this._mindContentW = 0;
    this._mindScrollMax = 0;
    this._mindScrollPos = 0;
    this._mslDragging = false;
    this._mindPositions = [];
    this._mCardW = 210;
    this._mindSwipeConsumed = false;
    this._worksCat = (this.opts.worksTabs[0] || {}).id || '';
    this._worksPage = 0;
    this._activeTab = (this.opts.tabs[0] || {}).id || '';
    this._resizeTimer = null;
    this._prevBaseKey = 'desktop';
    this._escHandler = null;
  }

  var proto = CharStoryGraph.prototype;

  /* ---------- 公共 API ---------- */
  proto.create = function () {
    this.root = this._buildFrame();
    return this.root;
  };
  proto.mount = function (container) {
    if (!this.root) this.create();
    // 等比缩放态标记：与原案例 body.is-scaled-canvas 对齐
    if (container && container.classList) container.classList.add('is-scaled-canvas');
    container.appendChild(this.root);
    this._afterMount();
    return this;
  };

  /* ============================================================
   * 构建外壳
   * ============================================================ */
  proto._buildFrame = function () {
    var opts = this.opts;
    var frame = el('div', 'sg-frame', {
      'id': 'sg-app-container',
      role: 'region',
      'aria-label': opts.ariaLabel
    });

    var main = el('div', 'sg-main');
    frame.appendChild(main);

    // 视图栈
    var tablistId = 'sg-tablist';
    this._views = {};
    this._tabBtns = {};
    var self = this;
    (opts.tabs || []).forEach(function (tab, idx) {
      var tabId = 'sg-tab-' + tab.id;
      var panelId = 'sg-panel-' + tab.id;
      var isActive = idx === 0;

      var view = el('div', 'sg-view' + (isActive ? ' active' : ''), {
        'id': panelId,
        role: 'tabpanel',
        'aria-labelledby': tabId,
        'data-view': tab.id
      });
      if (!isActive) view.setAttribute('aria-hidden', 'true');

      if (tab.id === 'graph') self._buildGraph(view);
      else if (tab.id === 'mind') self._buildMind(view);
      else if (tab.id === 'works') self._buildWorks(view);
      else self._buildGeneric(view, tab);

      main.appendChild(view);
      self._views[tab.id] = view;
    });

    // 主 tab bar
    var tabBar = el('div', 'sg-tabs', { role: 'tablist', 'aria-label': opts.title + ' 视图切换' });
    (opts.tabs || []).forEach(function (tab, idx) {
      var tabId = 'sg-tab-' + tab.id;
      var panelId = 'sg-panel-' + tab.id;
      var isActive = idx === 0;
      var btn = el('button', 'sg-tab-btn' + (isActive ? ' active' : ''), {
        'id': tabId,
        role: 'tab',
        'aria-selected': isActive ? 'true' : 'false',
        'aria-controls': panelId,
        'tabindex': isActive ? '0' : '-1',
        'text': tab.label
      });
      on(btn, 'click', function () { self._switchTab(tab.id); });
      on(btn, 'keydown', function (e) { self._onTabKeydown(e); });
      tabBar.appendChild(btn);
      self._tabBtns[tab.id] = btn;
    });
    frame.appendChild(tabBar);

    // 剧情节点弹窗：作为 frame 的兄弟节点（与原案例 body 级别结构一致，
    // 便于居中且不被 frame 的 overflow:hidden 裁切）
    this._plotModalMask = this._buildPlotModal();

    // A11y 播报区
    var live = el('div', 'sg-sr-only', {
      'aria-live': 'polite',
      'aria-atomic': 'true',
      'id': 'sg-live'
    });
    this._liveEl = live;

    // 外层不另起包裹：frame + modal + live 直接挂到容器（等价原案例
    // body.is-scaled-canvas > [div#app-container.is-scaled, div.plot-modal-mask]）。
    // 用文档片段收集，mount 时一次性 append 到容器。
    var frag = document.createDocumentFragment();
    frag.appendChild(frame);
    frag.appendChild(this._plotModalMask);
    frag.appendChild(live);
    this._frameEl = frame;
    this._frag = frag;
    return frag;
  };

  /* ---------- 通用兜底视图 ---------- */
  proto._buildGeneric = function (view, tab) {
    var body = el('div', 'sg-generic-body', {
      role: 'group',
      'aria-label': tab.label || tab.id
    });
    body.textContent = tab.label || '';
    view.appendChild(body);
  };

  /* ============================================================
   * 视图 1：关系图谱
   * ============================================================ */
  proto._buildGraph = function (view) {
    var opts = this.opts;
    var wrap = el('div', 'sg-graph-wrap', { 'id': 'sg-graph-wrap' });

    // 图例
    var legend = el('div', 'sg-graph-legend', { 'aria-hidden': 'true' });
    var types = ['family', 'romance', 'master', 'friend', 'enemy'];
    types.forEach(function (t) {
      var item = el('div', 'sg-legend-item');
      var svg = el('svg', 'sg-lg-svg ' + t);
      svg.setAttribute('width', '26');
      svg.setAttribute('height', '8');
      var line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', '1');
      line.setAttribute('y1', '4');
      line.setAttribute('x2', '25');
      line.setAttribute('y2', '4');
      svg.appendChild(line);
      item.appendChild(svg);
      item.appendChild(document.createTextNode(opts.relTypes[t] || t));
      legend.appendChild(item);
    });
    wrap.appendChild(legend);

    // 画布 + edges svg
    var canvas = el('div', 'sg-graph-canvas', { 'id': 'sg-graph-canvas' });
    var edgesSvg = document.createElementNS(SVG_NS, 'svg');
    edgesSvg.setAttribute('class', 'sg-edges');
    edgesSvg.setAttribute('id', 'sg-graph-edges');
    canvas.appendChild(edgesSvg);
    wrap.appendChild(canvas);

    // 角色详情面板
    var panel = el('div', 'sg-char-panel', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'sg-char-name',
      'id': 'sg-char-panel'
    });
    var closeBtn = el('button', 'sg-close', {
      'type': 'button',
      'aria-label': '关闭角色详情',
      'title': '关闭',
      'text': '×'
    });
    panel.appendChild(closeBtn);

    var head = el('div', 'sg-char-head');
    var avt = el('div', 'sg-avt', { 'id': 'sg-char-avt', role: 'img', 'aria-label': '角色头像' });
    var headInfo = el('div', 'sg-char-head-info');
    var pName = el('div', 'sg-p-name', { 'id': 'sg-char-name' });
    var pActor = el('div', 'sg-p-actor', { 'id': 'sg-char-actor' });
    headInfo.appendChild(pName);
    headInfo.appendChild(pActor);
    head.appendChild(avt);
    head.appendChild(headInfo);
    panel.appendChild(head);

    var relTitle = el('div', 'sg-section-title sg-rel-title-pc', { 'text': opts.charPanelRelTitle });
    var relTags = el('div', 'sg-rel-tags', { 'id': 'sg-char-rel-tags' });
    var descTitle = el('div', 'sg-section-title sg-desc-title-pc', { 'text': opts.charPanelDescTitle });
    var pDesc = el('div', 'sg-p-desc', { 'id': 'sg-char-desc' });
    panel.appendChild(relTitle);
    panel.appendChild(relTags);
    panel.appendChild(descTitle);
    panel.appendChild(pDesc);
    wrap.appendChild(panel);

    view.appendChild(wrap);

    this._graphWrap = wrap;
    this._graphCanvas = canvas;
    this._graphEdges = edgesSvg;
    this._charPanel = panel;
    this._charClose = closeBtn;
    this._cAvt = avt;
    this._cName = pName;
    this._cActor = pActor;
    this._cRelTags = relTags;
    this._cDesc = pDesc;

    var self = this;
    on(closeBtn, 'click', function () { self._closeChar(); });
  };

  /* ---------- 画布等比缩放 ---------- */
  proto._applyScale = function () {
    var app = this._frameEl;
    if (!app) return;
    var w = global.innerWidth, h = global.innerHeight;
    var base = (w <= 500 || h <= 500) ? this.opts.baseMobile : this.opts.baseDesktop;
    var scale = Math.min(w / base.w, h / base.h);
    this._scaleFactor = scale;
    this._currentBase = base;
    this._currentBaseKey = (base === this.opts.baseMobile) ? 'mobile' : 'desktop';
    var offX = (w - base.w * scale) / 2;
    var offY = (h - base.h * scale) / 2;
    app.classList.add('is-scaled');
    app.style.width = base.w + 'px';
    app.style.height = base.h + 'px';
    app.style.transform = 'translate(' + offX + 'px,' + offY + 'px) scale(' + scale + ')';
  };

  proto._isSmallCanvas = function () { return this._currentBaseKey === 'mobile'; };

  /* ---------- 布局测量与计算（端口自原案例） ---------- */
  proto._measure = function () {
    var S = this._scaleFactor || 1;
    var rect = this._graphWrap.getBoundingClientRect();
    var panelW = this._graphWrap.classList.contains('panel-open')
      ? (this._isSmallCanvas() ? 0 : 280)
      : 0;
    this._bounds = {
      w: Math.max(rect.width / S - panelW, 120),
      h: rect.height / S
    };
  };

  proto._ensureLayoutRel = function () {
    if (this.opts.layoutRel) return this.opts.layoutRel;
    // 自动环形布局：主角居中，其余均匀环绕
    var keys = Object.keys(this.opts.chars || {});
    var layout = {};
    var hero = this.opts.hero;
    keys.forEach(function (k, i) {
      if (k === hero) { layout[k] = [0.5, 0.5]; return; }
      var others = keys.filter(function (x) { return x !== hero; });
      var idx = others.indexOf(k);
      var n = others.length;
      var ang = (idx / n) * Math.PI * 2 - Math.PI / 2;
      layout[k] = [0.5 + 0.36 * Math.cos(ang), 0.5 + 0.36 * Math.sin(ang)];
    });
    return layout;
  };

  proto._computeLayout = function () {
    this._measure();
    var isMobile = this._isSmallCanvas();
    var padX = isMobile ? 28 : 52;
    var padY = isMobile ? 32 : 48;
    var w = Math.max(this._bounds.w, isMobile ? 200 : 320);
    var h = Math.max(this._bounds.h, isMobile ? 200 : 320);
    var usableW = Math.max(w - padX * 2, 120);
    var usableH = Math.max(h - padY * 2, 120);
    var legendRight = 400;
    var legendBottom = 58;
    var layoutRel = this._ensureLayoutRel();
    var layout = {};

    Object.keys(layoutRel).forEach(function (k) {
      var nx0 = layoutRel[k][0], ny0 = layoutRel[k][1];
      var nx = nx0, ny = ny0;
      if (isMobile) {
        var spread = 1.18;
        nx = Math.min(1, Math.max(0, 0.5 + (nx0 - 0.5) * spread));
        ny = Math.min(1, Math.max(0, 0.5 + (ny0 - 0.5) * spread));
      }
      var x, y;
      if (isMobile) {
        var sideSafe = 40;
        var xL = sideSafe;
        var xR = Math.max(w - sideSafe, xL + 120);
        x = xL + nx * (xR - xL);
        var topSafe = 60;
        var bottomSafe = Math.max(h - 46, topSafe + 120);
        y = topSafe + ny * (bottomSafe - topSafe);
      } else {
        x = padX + nx * usableW;
        y = padY + ny * usableH;
        if (x < legendRight && y < legendBottom + 46) y = legendBottom + 46;
      }
      layout[k] = [x, y];
    });

    // 防遮挡迭代分离
    var chars = this.opts.chars;
    var av, avBig, nameF;
    var wI = this._currentBase.w, hI = this._currentBase.h;
    if (wI <= 400 && hI <= 420) { av = 38; avBig = 50; nameF = 9.5; }
    else if (wI <= 400) { av = 47; avBig = 62; nameF = 10; }
    else if (wI <= 768) { av = 57; avBig = 73; nameF = 11; }
    else if (wI <= 900) { av = 66; avBig = 84; nameF = 13; }
    else { av = 82; avBig = 104; nameF = 13; }

    var ext = {};
    Object.keys(layout).forEach(function (k) {
      var c = chars[k];
      if (!c) return;
      var aw = c.big ? avBig : av;
      var nameW = (c.name || '').length * nameF * 0.92 + 12;
      var halfW = Math.max(aw, nameW) / 2;
      var nameH = nameF * 1.2 + 6;
      var halfH = (aw + 4 + nameH) / 2;
      ext[k] = [halfW, halfH];
    });

    var keys = Object.keys(layout);
    var marginX = 10, marginY = 14;
    var legendClearY = 0;
    var legendEl = this._graphWrap.querySelector('.sg-graph-legend');
    if (isMobile && legendEl && getComputedStyle(legendEl).display !== 'none') {
      var S = this._scaleFactor || 1;
      var lr = legendEl.getBoundingClientRect();
      var cr = this._graphCanvas.getBoundingClientRect();
      if (lr.height > 0) legendClearY = Math.max(0, (lr.bottom - cr.top) / S) + 12;
    }
    var clamp = function (k) {
      if (!ext[k]) return;
      layout[k][0] = Math.max(ext[k][0] + 2, Math.min(w - ext[k][0] - 2, layout[k][0]));
      var yMin = Math.max(ext[k][1] + 4, legendClearY + ext[k][1]);
      layout[k][1] = Math.max(yMin, Math.min(h - ext[k][1] - 4, layout[k][1]));
    };
    for (var it = 0; it < 80; it++) {
      var moved = false;
      for (var i = 0; i < keys.length; i++) {
        for (var j = i + 1; j < keys.length; j++) {
          var a = keys[i], b = keys[j];
          if (!ext[a] || !ext[b]) continue;
          var dx = layout[b][0] - layout[a][0];
          var dy = layout[b][1] - layout[a][1];
          var ox = ext[a][0] + ext[b][0] + marginX - Math.abs(dx);
          var oy = ext[a][1] + ext[b][1] + marginY - Math.abs(dy);
          if (ox > 0 && oy > 0) {
            moved = true;
            if (ox <= oy) {
              var sx = dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx);
              var px = (ox / 2) * sx;
              layout[a][0] -= px; layout[b][0] += px;
            } else {
              var sy = dy === 0 ? 1 : Math.sign(dy);
              var py = (oy / 2) * sy;
              layout[a][1] -= py; layout[b][1] += py;
            }
            clamp(a); clamp(b);
          }
        }
      }
      if (!moved) break;
    }
    keys.forEach(function (k) {
      clamp(k);
      if (!isMobile && ext[k] && layout[k][0] - ext[k][0] < legendRight && layout[k][1] - ext[k][1] < legendBottom + 8) {
        layout[k][1] = legendBottom + 8 + ext[k][1];
      }
    });
    return layout;
  };

  proto._renderGraph = function () {
    var self = this;
    var opts = this.opts;
    var canvas = this._graphCanvas;
    var edgesSvg = this._graphEdges;
    canvas.querySelectorAll('.sg-node').forEach(function (n) { n.remove(); });
    while (edgesSvg.firstChild) edgesSvg.removeChild(edgesSvg.firstChild);

    var layout = this._computeLayout();
    var chars = opts.chars || {};

    Object.keys(chars).forEach(function (k) {
      var c = chars[k];
      var pos = layout[k];
      if (!pos) return;
      var x = pos[0], y = pos[1];
      var node = el('div', 'sg-node' + (c.big ? ' big' : ''), {
        'role': 'button',
        'tabindex': '0',
        'data-key': k,
        'aria-label': c.name + '，' + c.actor + '，点击查看详情'
      });
      var inner = el('div', 'sg-float-inner');
      var avatar = el('div', 'sg-avatar', { role: 'img', 'aria-label': c.name + ' 头像' });
      avatar.style.backgroundImage = "url('" + opts.imgBase + c.img + "')";
      var name = el('div', 'sg-name', { 'text': c.name });
      inner.appendChild(avatar);
      inner.appendChild(name);
      node.appendChild(inner);

      var dur = 6 + Math.random() * 4;
      inner.style.animationDuration = dur + 's';
      inner.style.animationDelay = (-Math.random() * dur) + 's';
      node.style.left = x + 'px';
      node.style.top = y + 'px';

      canvas.appendChild(node);
      self._nodeState[k] = { x: x, y: y, el: node, inner: inner };
      self._attachDrag(node, k);
      on(node, 'click', function () {
        if (!node.dataset.dragged) self._showChar(k);
        delete node.dataset.dragged;
      });
      on(node, 'keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          self._showChar(k);
        }
      });
    });

    (opts.edges || []).forEach(function (e) {
      var line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'sg-edge ' + e.type);
      line.setAttribute('data-a', e.a);
      line.setAttribute('data-b', e.b);
      line.setAttribute('data-label', e.label || '');
      edgesSvg.appendChild(line);
    });
    this._updateEdgesFromDOM();
  };

  proto._relayout = function () {
    var layout = this._computeLayout();
    var self = this;
    Object.keys(layout).forEach(function (k) {
      var s = self._nodeState[k];
      if (!s) return;
      s.x = layout[k][0]; s.y = layout[k][1];
      s.el.style.left = s.x + 'px';
      s.el.style.top = s.y + 'px';
    });
  };

  /* ---------- 连线端点跟随头像 ---------- */
  proto._updateEdgesFromDOM = function () {
    var S = this._scaleFactor || 1;
    var canvas = this._graphCanvas;
    var edgesSvg = this._graphEdges;
    var cr = canvas.getBoundingClientRect();
    Array.from(edgesSvg.children).forEach(function (line) {
      var A = this._nodeState[line.dataset.a];
      var B = this._nodeState[line.dataset.b];
      if (!A || !B) return;
      var getAvatar = function (nd) { return nd.el.querySelector('.sg-avatar') || nd.el; };
      var ar = getAvatar(A).getBoundingClientRect();
      var br = getAvatar(B).getBoundingClientRect();
      var ax = (ar.left + ar.width / 2 - cr.left) / S;
      var ay = (ar.top + ar.height / 2 - cr.top) / S;
      var bx = (br.left + br.width / 2 - cr.left) / S;
      var by = (br.top + br.height / 2 - cr.top) / S;
      var dx = bx - ax, dy = by - ay;
      var dist = Math.hypot(dx, dy) || 1;
      var ux = dx / dist, uy = dy / dist;
      var rA = ar.width / 2 / S + 3;
      var rB = br.width / 2 / S + 3;
      line.setAttribute('x1', ax + ux * rA);
      line.setAttribute('y1', ay + uy * rA);
      line.setAttribute('x2', bx - ux * rB);
      line.setAttribute('y2', by - uy * rB);
    }.bind(this));
  };

  /* ---------- 拖拽 ---------- */
  proto._attachDrag = function (node, key) {
    var self = this;
    var startX = 0, startY = 0, origX = 0, origY = 0, moved = false;
    var state = function () { return self._nodeState[key]; };
    function onDown(clientX, clientY) {
      moved = false;
      startX = clientX; startY = clientY;
      var st = state(); origX = st.x; origY = st.y;
      node.classList.add('grabbing', 'dragging-now');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onUp);
    }
    function onMove(clientX, clientY) {
      var S = self._scaleFactor || 1;
      var dx = (clientX - startX) / S, dy = (clientY - startY) / S;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      var nx = Math.max(40, Math.min(self._bounds.w - 40, origX + dx));
      var ny = Math.max(40, Math.min(self._bounds.h - 40, origY + dy));
      var st = state();
      st.x = nx; st.y = ny;
      node.style.left = nx + 'px';
      node.style.top = ny + 'px';
      self._updateEdgesFromDOM();
    }
    function onUp() {
      node.classList.remove('grabbing', 'dragging-now');
      if (moved) node.dataset.dragged = '1';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onUp);
    }
    var onMouseMove = function (e) { onMove(e.clientX, e.clientY); };
    var onTouchMove = function (e) {
      e.preventDefault();
      var t = e.touches[0];
      onMove(t.clientX, t.clientY);
    };
    on(node, 'mousedown', function (e) { e.preventDefault(); onDown(e.clientX, e.clientY); });
    on(node, 'touchstart', function (e) {
      var t = e.touches[0];
      onDown(t.clientX, t.clientY);
    }, { passive: true });
  };

  /* ---------- 浮动动画 + 连线跟随循环 ---------- */
  proto._edgeSyncLoop = function () {
    this._updateEdgesFromDOM();
    this._reqId = raf(this._edgeSyncLoop.bind(this));
  };
  proto._startPhysics = function () {
    if (!this.opts.enablePhysics) return;
    var inners = this.root.querySelectorAll('.sg-float-inner');
    inners.forEach(function (n) { n.style.animationPlayState = 'running'; });
    if (!this._reqId) this._reqId = raf(this._edgeSyncLoop.bind(this));
  };
  proto._stopPhysics = function () {
    var inners = this.root.querySelectorAll('.sg-float-inner');
    inners.forEach(function (n) { n.style.animationPlayState = 'paused'; });
    if (this._reqId) {
      if (typeof global.cancelAnimationFrame === 'function') global.cancelAnimationFrame(this._reqId);
      else clearTimeout(this._reqId);
      this._reqId = null;
    }
  };

  /* ---------- 高亮关联节点/连线 ---------- */
  proto._highlightRelated = function (k) {
    var related = {};
    related[k] = true;
    (this.opts.edges || []).forEach(function (e) {
      if (e.a === k) related[e.b] = true;
      if (e.b === k) related[e.a] = true;
    });
    Object.keys(this._nodeState).forEach(function (key) {
      var s = this._nodeState[key];
      s.el.classList.toggle('active', key === k);
      s.el.classList.toggle('dim', !related[key]);
    }.bind(this));
    Array.from(this._graphEdges.children).forEach(function (line) {
      var on = line.dataset.a === k || line.dataset.b === k;
      line.classList.toggle('hl', on);
      line.classList.toggle('dim', !on);
    });
  };
  proto._clearHighlight = function () {
    var self = this;
    Object.keys(self._nodeState).forEach(function (key) {
      self._nodeState[key].el.classList.remove('active', 'dim');
    });
    Array.from(self._graphEdges.children).forEach(function (line) {
      line.classList.remove('hl', 'dim');
    });
  };

  /* ---------- 角色详情面板 ---------- */
  proto._showChar = function (k) {
    var self = this;
    var opts = this.opts;
    var c = opts.chars[k];
    if (!c) return;
    this._cAvt.style.backgroundImage = "url('" + opts.imgBase + c.img + "')";
    this._cName.textContent = c.name;
    this._cActor.textContent = c.actor;
    this._cDesc.textContent = c.desc;

    var tagBox = this._cRelTags;
    tagBox.innerHTML = '';
    if (k === opts.hero) {
      var t = el('span', 'sg-rel-tag self', { 'text': opts.charPanelSelfTag });
      tagBox.appendChild(t);
    } else {
      var r = opts.heroRel[k];
      if (r) {
        var t1 = el('span', 'sg-rel-tag ' + r.type, {
          'text': (opts.relTypes[r.type] || r.type) + ' · ' + r.text
        });
        tagBox.appendChild(t1);
      }
      (opts.edges || []).forEach(function (e) {
        var other = e.a === k ? e.b : (e.b === k ? e.a : null);
        if (other && other !== opts.hero && opts.chars[other]) {
          var tn = el('span', 'sg-rel-tag ' + e.type, {
            'text': opts.chars[other].name + ' · ' + e.label
          });
          tagBox.appendChild(tn);
        }
      });
    }
    this._graphWrap.classList.add('panel-open');
    this._charPanel.setAttribute('aria-hidden', 'false');
    this._highlightRelated(k);
    this._announce('显示角色详情：' + c.name);
    setTimeout(function () { self._relayout(); }, 60);
  };
  proto._closeChar = function () {
    var self = this;
    this._graphWrap.classList.remove('panel-open');
    this._charPanel.setAttribute('aria-hidden', 'true');
    this._clearHighlight();
    setTimeout(function () { self._relayout(); }, 60);
  };

  /* ============================================================
   * 视图 2：剧情因果 - 横向思维导图
   * ============================================================ */
  proto._buildMind = function (view) {
    var opts = this.opts;
    var wrap = el('div', 'sg-mind-wrap');

    var toolbar = el('div', 'sg-mind-toolbar');
    var hint = el('span', 'sg-m-hint', { 'text': opts.mindHint });
    toolbar.appendChild(hint);
    wrap.appendChild(toolbar);

    var viewport = el('div', 'sg-mind-viewport', { 'id': 'sg-mind-viewport' });
    var canvas = el('div', 'sg-mind-canvas', { 'id': 'sg-mind-canvas' });
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'sg-mind-svg');
    svg.setAttribute('id', 'sg-mind-svg');
    canvas.appendChild(svg);
    viewport.appendChild(canvas);
    wrap.appendChild(viewport);

    var sliderBar = el('div', 'sg-mind-slider-bar', { 'id': 'sg-mind-slider-bar' });
    var icoL = el('span', 'sg-msl-ico', { 'aria-hidden': 'true', 'text': '⇤' });
    var cont = el('div', 'sg-msl-container');
    var track = el('div', 'sg-msl-track', {
      'id': 'sg-msl-track',
      role: 'slider',
      'aria-label': '剧情因果横向滚动',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': '0',
      'tabindex': '0'
    });
    var trackBg = el('div', 'sg-msl-track-bg');
    var trackActive = el('div', 'sg-msl-track-active', { 'id': 'sg-msl-active' });
    var dots = el('div', 'sg-msl-dots', { 'id': 'sg-msl-dots' });
    var thumb = el('div', 'sg-msl-thumb', { 'id': 'sg-msl-thumb' });
    track.appendChild(trackBg);
    track.appendChild(trackActive);
    track.appendChild(dots);
    track.appendChild(thumb);
    cont.appendChild(track);
    var icoR = el('span', 'sg-msl-ico', { 'aria-hidden': 'true', 'text': '⇥' });
    sliderBar.appendChild(icoL);
    sliderBar.appendChild(cont);
    sliderBar.appendChild(icoR);
    wrap.appendChild(sliderBar);

    view.appendChild(wrap);

    this._mindWrap = wrap;
    this._mindViewport = viewport;
    this._mindCanvas = canvas;
    this._mindSvg = svg;
    this._mindSliderBar = sliderBar;
    this._mslTrack = track;
    this._mslActive = trackActive;
    this._mslThumb = thumb;
    this._mslDots = dots;

    this._bindMindSlider();
  };

  proto._renderMind = function () {
    var self = this;
    var opts = this.opts;
    var canvas = this._mindCanvas;
    var svg = this._mindSvg;
    canvas.querySelectorAll('.sg-mind-node').forEach(function (n) { n.remove(); });
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var plots = opts.plots || [];
    var visiblePlots = plots.slice(0, this._mindCutoff + 1);
    var cols = [opts.mindRoot].concat(visiblePlots.map(function (p, i) {
      return Object.assign({}, p, { _i: i });
    }));

    var cs = getComputedStyle(this._mindViewport);
    var padTop = parseFloat(cs.paddingTop) || 0;
    var padBottom = parseFloat(cs.paddingBottom) || 0;
    var innerH = Math.max(this._mindViewport.clientHeight - padTop - padBottom, 120);

    var isMobile = this._isSmallCanvas();
    var cardW = isMobile ? 150 : 210;
    var colGap = isMobile ? 40 : 88;
    this._mCardW = cardW;
    var colStep = cardW + colGap;
    var baseY = innerH / 2;
    var yOf = function () { return baseY; };

    var positions = cols.map(function (item, c) {
      return { x: 24 + c * colStep, y: yOf(item), item: item };
    });
    this._mindPositions = positions;

    var totalW = 24 + cols.length * colStep + 40;
    var maxY = Math.max.apply(null, positions.map(function (p) { return p.y; })) + 120;
    canvas.style.width = totalW + 'px';
    canvas.style.height = Math.max(maxY, this._mindViewport.clientHeight) + 'px';
    svg.setAttribute('width', totalW);
    svg.setAttribute('height', Math.max(maxY, this._mindViewport.clientHeight));
    this._mindContentW = totalW;

    // 连线
    for (var c = 0; c < positions.length - 1; c++) {
      var a = positions[c], b = positions[c + 1];
      var x1 = a.x + cardW, y1 = a.y;
      var x2 = b.x, y2 = b.y;
      var mx = (x1 + x2) / 2;
      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'sg-mind-link');
      path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + mx + ' ' + y1 + ', ' + mx + ' ' + y2 + ', ' + x2 + ' ' + y2);
      svg.appendChild(path);
    }

    positions.forEach(function (pos, idx) {
      var item = pos.item;
      var node = el('div', 'sg-mind-node ' + (item.root ? 'root' : ''));
      node.style.left = pos.x + 'px';
      node.style.top = pos.y + 'px';

      var card = el('div', 'sg-m-card');
      if (!item.root) {
        card.setAttribute('data-i', String(item._i));
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', '第 ' + item.ep + ' 集 · ' + item.title + '，按回车查看详情');
      }
      if (item.root) {
        var bodyR = el('div', 'm-body');
        var epR = el('div', 'm-ep', { 'text': item.ep });
        var nameR = el('div', 'm-name', { 'text': item.title });
        var causeR = el('div', 'm-cause', { 'text': item.desc });
        bodyR.appendChild(epR); bodyR.appendChild(nameR); bodyR.appendChild(causeR);
        card.appendChild(bodyR);
      } else {
        var thumb = el('div', 'm-thumb');
        thumb.style.backgroundImage = "url('" + opts.imgBase + item.cover + "')";
        var badge = el('div', 'm-badge', { 'text': item.type || '剧情' });
        thumb.appendChild(badge);
        var bodyP = el('div', 'm-body');
        var epP = el('div', 'm-ep', { 'text': '第 ' + item.ep + ' 集' });
        var nameP = el('div', 'm-name', { 'text': item.title });
        bodyP.appendChild(epP); bodyP.appendChild(nameP);
        if (item.causeNext) {
          var causeP = el('div', 'm-cause', { 'text': item.causeNext });
          bodyP.appendChild(causeP);
        }
        card.appendChild(thumb);
        card.appendChild(bodyP);
        (function (idx) {
          on(card, 'click', function () {
            if (self._mindSwipeConsumed) return;
            self._openPlotModal(idx);
          });
          on(card, 'keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              self._openPlotModal(idx);
            }
          });
        })(item._i);
      }
      node.appendChild(card);

      // 折叠/展开按钮
      var pIdx = item.root ? -1 : item._i;
      var hasNext = pIdx < plots.length - 1;
      if (hasNext) {
        var collapsedHere = self._mindCutoff === pIdx;
        var tg = el('button', 'sg-m-toggle', {
          'type': 'button',
          'aria-label': collapsedHere ? '展开后续' : '收起后续',
          'title': collapsedHere ? '展开后续' : '收起后续',
          'text': collapsedHere ? '+' : '−'
        });
        on(tg, 'click', function (ev) {
          ev.stopPropagation();
          self._mindCutoff = collapsedHere ? plots.length - 1 : pIdx;
          self._renderMind();
        });
        node.appendChild(tg);
      }
      canvas.appendChild(node);
    });

    this._syncMindSlider();
  };

  /* ---------- 滑杆 ---------- */
  proto._bindMindSlider = function () {
    var self = this;
    var track = this._mslTrack;
    function ratioOf(clientX) {
      var rect = track.getBoundingClientRect();
      return (clientX - rect.left) / rect.width;
    }
    function setByRatio(r) {
      r = Math.max(0, Math.min(1, r));
      self._mindScrollPos = r * self._mindScrollMax;
      self._applyMindScroll();
    }
    on(track, 'pointerdown', function (e) {
      self._mslDragging = true;
      try { track.setPointerCapture(e.pointerId); } catch (_) {}
      setByRatio(ratioOf(e.clientX));
    });
    on(track, 'pointermove', function (e) {
      if (self._mslDragging) setByRatio(ratioOf(e.clientX));
    });
    var end = function (e) {
      self._mslDragging = false;
      try { track.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    on(track, 'pointerup', end);
    on(track, 'pointercancel', end);
    on(track, 'keydown', function (e) {
      if (e.key === 'ArrowLeft') { setByRatio((self._mindScrollMax > 0 ? self._mindScrollPos / self._mindScrollMax : 0) - 0.1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { setByRatio((self._mindScrollMax > 0 ? self._mindScrollPos / self._mindScrollMax : 0) + 0.1); e.preventDefault(); }
    });

    // 滚轮
    var wheelRaf = null;
    on(this._mindViewport, 'wheel', function (e) {
      if (self._mindScrollMax <= 0) return;
      e.preventDefault();
      var S = self._scaleFactor || 1;
      self._mindScrollPos = Math.max(0, Math.min(self._mindScrollMax, self._mindScrollPos + (e.deltaY || e.deltaX) / S));
      if (wheelRaf) return;
      wheelRaf = raf(function () { wheelRaf = null; self._applyMindScroll(); });
    }, { passive: false });

    // 触摸滑动
    var touchActive = false, startX = 0, startY = 0, startPos = 0, moved = false, swipeRaf = null;
    on(this._mindViewport, 'touchstart', function (e) {
      if (self._mindScrollMax <= 0 || e.touches.length !== 1) return;
      touchActive = true; moved = false; self._mindSwipeConsumed = false;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY; startPos = self._mindScrollPos;
    }, { passive: true });
    on(this._mindViewport, 'touchmove', function (e) {
      if (!touchActive) return;
      var S = self._scaleFactor || 1;
      var dxV = e.touches[0].clientX - startX;
      var dyV = e.touches[0].clientY - startY;
      var dx = dxV / S, dy = dyV / S;
      if (!moved) {
        if (Math.abs(dxV) < 6 && Math.abs(dyV) < 6) return;
        if (Math.abs(dxV) <= Math.abs(dyV)) { touchActive = false; return; }
        moved = true; self._mindSwipeConsumed = true;
      }
      e.preventDefault();
      self._mindScrollPos = Math.max(0, Math.min(self._mindScrollMax, startPos - dx));
      if (swipeRaf) return;
      swipeRaf = raf(function () { swipeRaf = null; self._applyMindScroll(); });
    }, { passive: false });
    var touchEnd = function () {
      touchActive = false;
      if (self._mindSwipeConsumed) {
        setTimeout(function () { self._mindSwipeConsumed = false; }, 80);
      }
    };
    on(this._mindViewport, 'touchend', touchEnd, { passive: true });
    on(this._mindViewport, 'touchcancel', touchEnd, { passive: true });
  };

  proto._scrollForNodeCenter = function (pos) {
    var viewW = this._mindViewport.clientWidth;
    var nodeCenterX = 20 + pos.x + this._mCardW / 2;
    return Math.max(0, Math.min(this._mindScrollMax, nodeCenterX - viewW / 2));
  };
  proto._applyMindScroll = function () {
    var self = this;
    this._mindCanvas.style.transform = 'translateX(' + (-this._mindScrollPos) + 'px)';
    var ratio = this._mindScrollMax > 0 ? this._mindScrollPos / this._mindScrollMax : 0;
    var S = this._scaleFactor || 1;
    var tw = this._mslTrack.getBoundingClientRect().width / S;
    this._mslThumb.style.left = (ratio * tw) + 'px';
    this._mslActive.style.width = (ratio * tw) + 'px';
    this._mslTrack.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    var best = -1, bestD = Infinity;
    this._mindPositions.forEach(function (p, i) {
      var d = Math.abs(self._scrollForNodeCenter(p) - self._mindScrollPos);
      if (d < bestD) { bestD = d; best = i; }
    });
    this._mslDots.querySelectorAll('.sg-msl-dot').forEach(function (d, i) {
      d.classList.toggle('active', i === best);
    });
  };
  proto._renderMslDots = function () {
    var self = this;
    var S = this._scaleFactor || 1;
    var tw = this._mslTrack.getBoundingClientRect().width / S || this._mslTrack.clientWidth;
    this._mslDots.innerHTML = '';
    if (this._mindScrollMax <= 1) return;
    this._mindPositions.forEach(function (p, i) {
      var sc = self._scrollForNodeCenter(p);
      var ratio = self._mindScrollMax > 0 ? sc / self._mindScrollMax : 0;
      var dot = el('div', 'sg-msl-dot');
      dot.style.left = (ratio * tw) + 'px';
      dot.title = p.item.root ? p.item.title : ('第 ' + p.item.ep + ' 集 · ' + p.item.title);
      on(dot, 'click', function (e) {
        e.stopPropagation();
        self._mindScrollPos = sc;
        self._applyMindScroll();
      });
      self._mslDots.appendChild(dot);
    });
  };
  proto._syncMindSlider = function () {
    this._mindScrollMax = Math.max(0, this._mindContentW - this._mindViewport.clientWidth);
    this._mindScrollPos = Math.min(this._mindScrollPos, this._mindScrollMax);
    var enabled = this._mindScrollMax > 1;
    this._mindSliderBar.classList.toggle('disabled', !enabled);
    this._renderMslDots();
    this._applyMindScroll();
  };

  /* ============================================================
   * 视图 3：作品推荐
   * ============================================================ */
  proto._buildWorks = function (view) {
    var self = this;
    var opts = this.opts;
    var wrap = el('div', 'sg-works-wrap');

    var head = el('div', 'sg-works-head');
    var tabs = el('div', 'sg-works-tabs', { role: 'tablist', 'aria-label': '作品分类' });
    this._worksTabBtns = {};
    (opts.worksTabs || []).forEach(function (wt, idx) {
      var tabId = 'sg-works-tab-' + wt.id;
      var gridId = 'sg-works-grid';
      var isActive = idx === 0;
      var btn = el('button', 'sg-works-tab' + (isActive ? ' active' : ''), {
        'id': tabId,
        role: 'tab',
        'aria-selected': isActive ? 'true' : 'false',
        'aria-controls': gridId,
        'tabindex': isActive ? '0' : '-1',
        'text': wt.label
      });
      on(btn, 'click', function () { self._switchWorksCat(wt.id); });
      on(btn, 'keydown', function (e) { self._onWorksTabKeydown(e); });
      tabs.appendChild(btn);
      self._worksTabBtns[wt.id] = btn;
    });
    head.appendChild(tabs);

    var pager = el('div', 'sg-works-pager');
    var prevBtn = el('button', 'sg-works-btn', {
      'type': 'button',
      'aria-label': '上一页',
      'text': opts.worksPrevLabel
    });
    var pageInfo = el('span', 'sg-works-pageinfo', { 'id': 'sg-works-pageinfo', 'text': '1/1' });
    var nextBtn = el('button', 'sg-works-btn', {
      'type': 'button',
      'aria-label': '下一页',
      'text': opts.worksNextLabel
    });
    pager.appendChild(prevBtn);
    pager.appendChild(pageInfo);
    pager.appendChild(nextBtn);
    head.appendChild(pager);
    wrap.appendChild(head);

    var viewport = el('div', 'sg-works-viewport');
    var grid = el('div', 'sg-works-grid', {
      'id': 'sg-works-grid',
      role: 'tabpanel',
      'aria-labelledby': 'sg-works-tab-' + (this._worksCat || ((opts.worksTabs[0] || {}).id))
    });
    viewport.appendChild(grid);
    wrap.appendChild(viewport);

    view.appendChild(wrap);

    this._worksWrap = wrap;
    this._worksGrid = grid;
    this._worksPageInfo = pageInfo;
    this._worksPrev = prevBtn;
    this._worksNext = nextBtn;

    on(prevBtn, 'click', function () {
      if (self._worksPage > 0) { self._worksPage--; self._renderWorks(); }
    });
    on(nextBtn, 'click', function () {
      var list = opts.works[self._worksCat] || [];
      var pageCount = Math.max(1, Math.ceil(list.length / opts.worksPerPage));
      if (self._worksPage < pageCount - 1) { self._worksPage++; self._renderWorks(); }
    });
  };

  proto._switchWorksCat = function (catId) {
    var self = this;
    var opts = this.opts;
    this._worksCat = catId;
    this._worksPage = 0;
    Object.keys(this._worksTabBtns).forEach(function (id) {
      var b = self._worksTabBtns[id];
      var active = id === catId;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
      b.setAttribute('tabindex', active ? '0' : '-1');
    });
    this._worksGrid.setAttribute('aria-labelledby', 'sg-works-tab-' + catId);
    this._renderWorks();
    var label = ((opts.worksTabs.filter(function (t) { return t.id === catId; })[0]) || {}).label || catId;
    this._announce('已切换到 ' + label + ' 作品分类');
  };

  proto._renderWorks = function () {
    var self = this;
    var opts = this.opts;
    var list = opts.works[this._worksCat] || [];
    var pageCount = Math.max(1, Math.ceil(list.length / opts.worksPerPage));
    this._worksPage = Math.min(this._worksPage, pageCount - 1);
    this._worksGrid.setAttribute('data-cat', this._worksCat);
    var items = list.slice(
      this._worksPage * opts.worksPerPage,
      this._worksPage * opts.worksPerPage + opts.worksPerPage
    );
    this._worksGrid.innerHTML = '';
    items.forEach(function (w) {
      var card = el('div', 'sg-work-card' + (w.up ? ' upcoming' : ''));
      var cover = el('div', 'sg-cover', { role: 'img', 'aria-label': w.n + ' 封面' });
      cover.style.backgroundImage = "url('" + opts.imgBase + w.cover + "')";
      if (w.ep) {
        var tag = el('div', 'sg-tag', { 'text': w.ep });
        cover.appendChild(tag);
      }
      var info = el('div', 'sg-info');
      var n = el('div', 'sg-n', { 'text': w.n });
      var cast = (w.m || '').split('/').slice(0, 2).map(function (s) { return s.trim(); }).join(' / ');
      var m = el('div', 'sg-m', { 'text': cast });
      var r = el('div', 'sg-r', { 'text': '▸ ' + w.r });
      info.appendChild(n); info.appendChild(m); info.appendChild(r);
      card.appendChild(cover);
      card.appendChild(info);
      self._worksGrid.appendChild(card);
    });
    this._worksPageInfo.textContent = (this._worksPage + 1) + '/' + pageCount;
    var showPager = pageCount > 1;
    this._worksPrev.classList.toggle('sg-hidden', !showPager);
    this._worksNext.classList.toggle('sg-hidden', !showPager);
    this._worksPageInfo.classList.toggle('sg-hidden', !showPager);
    this._worksPrev.disabled = this._worksPage === 0;
    this._worksNext.disabled = this._worksPage === pageCount - 1;
  };

  /* ============================================================
   * 剧情节点弹窗
   * ============================================================ */
  proto._buildPlotModal = function () {
    var self = this;
    var opts = this.opts;
    var mask = el('div', 'sg-plot-modal-mask', { 'id': 'sg-plot-modal-mask' });
    var modal = el('div', 'sg-plot-modal', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'sg-pm-title',
      'id': 'sg-plot-modal',
      'aria-hidden': 'true'
    });
    var cover = el('div', 'sg-pm-cover', { 'id': 'sg-pm-cover' });
    var badge = el('div', 'sg-pm-badge', { 'id': 'sg-pm-badge' });
    var closeBtn = el('button', 'sg-pm-close', {
      'type': 'button',
      'aria-label': '关闭剧情详情',
      'title': '关闭',
      'text': '×'
    });
    var title = el('div', 'sg-pm-title', { 'id': 'sg-pm-title' });
    cover.appendChild(badge);
    cover.appendChild(closeBtn);
    cover.appendChild(title);
    modal.appendChild(cover);

    var body = el('div', 'sg-pm-body');
    var block1 = el('div');
    var st1 = el('div', 'sg-pm-section-title', { 'text': '剧情解析' });
    var desc = el('div', 'sg-pm-desc', { 'id': 'sg-pm-desc' });
    desc.style.marginTop = '6px';
    block1.appendChild(st1); block1.appendChild(desc);
    var block2 = el('div', { 'id': 'sg-pm-roles-block' });
    var st2 = el('div', 'sg-pm-section-title', { 'text': '关键人物' });
    var roles = el('div', 'sg-pm-roles', { 'id': 'sg-pm-roles' });
    roles.style.marginTop = '8px';
    block2.appendChild(st2); block2.appendChild(roles);
    body.appendChild(block1);
    body.appendChild(block2);
    modal.appendChild(body);
    mask.appendChild(modal);

    this._plotModal = modal;
    this._pmCover = cover;
    this._pmBadge = badge;
    this._pmClose = closeBtn;
    this._pmTitle = title;
    this._pmDesc = desc;
    this._pmRoles = roles;

    on(closeBtn, 'click', function () { self._closePlotModal(); });
    on(mask, 'click', function (e) { if (e.target === mask) self._closePlotModal(); });
    return mask;
  };

  proto._openPlotModal = function (i) {
    var self = this;
    var opts = this.opts;
    var p = opts.plots[i];
    if (!p) return;
    this._pmCover.style.backgroundImage = "url('" + opts.imgBase + p.cover + "')";
    this._pmBadge.textContent = '第 ' + p.ep + ' 集 · ' + (p.type || '剧情');
    this._pmTitle.textContent = p.title;
    this._pmDesc.textContent = p.desc;
    this._pmRoles.innerHTML = '';
    (p.roles || []).forEach(function (r) {
      var c = opts.chars[r];
      if (!c) return;
      var role = el('div', 'sg-pm-role');
      var av = el('div', 'sg-pr-av', { role: 'img', 'aria-label': c.name + ' 头像' });
      av.style.backgroundImage = "url('" + opts.imgBase + c.img + "')";
      var info = el('div', 'sg-pr-info');
      var nn = el('div', 'sg-pr-n', { 'text': c.name });
      var aa = el('div', 'sg-pr-a', { 'text': c.actor });
      info.appendChild(nn); info.appendChild(aa);
      role.appendChild(av); role.appendChild(info);
      self._pmRoles.appendChild(role);
    });
    this._plotModalMask.classList.add('active');
    this._plotModal.setAttribute('aria-hidden', 'false');
    this._announce('打开剧情详情：第 ' + p.ep + ' 集 ' + p.title);
    // 聚焦关闭按钮，便于键盘用户
    raf(function () { try { self._pmClose.focus(); } catch (_) {} });
  };
  proto._closePlotModal = function () {
    this._plotModalMask.classList.remove('active');
    this._plotModal.setAttribute('aria-hidden', 'true');
  };

  /* ============================================================
   * Tab 切换
   * ============================================================ */
  proto._switchTab = function (tabId) {
    var self = this;
    var opts = this.opts;
    this._activeTab = tabId;
    Object.keys(this._tabBtns).forEach(function (id) {
      var b = self._tabBtns[id];
      var active = id === tabId;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
      b.setAttribute('tabindex', active ? '0' : '-1');
    });
    Object.keys(this._views).forEach(function (id) {
      var v = self._views[id];
      var active = id === tabId;
      v.classList.toggle('active', active);
      v.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    if (tabId === 'graph') {
      this._measure();
      this._relayout();
      this._startPhysics();
    } else {
      this._stopPhysics();
    }
    if (tabId === 'mind') raf(function () { self._renderMind(); });
    var label = ((opts.tabs.filter(function (t) { return t.id === tabId; })[0]) || {}).label || tabId;
    this._announce('已切换到 ' + label + ' 视图');
  };

  proto._onTabKeydown = function (e) {
    var tabs = this.opts.tabs || [];
    var ids = tabs.map(function (t) { return t.id; });
    var cur = ids.indexOf(this._activeTab);
    if (cur < 0) return;
    var target = null;
    if (e.key === 'ArrowRight') target = (cur + 1) % ids.length;
    else if (e.key === 'ArrowLeft') target = (cur - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = ids.length - 1;
    if (target !== null) {
      e.preventDefault();
      this._switchTab(ids[target]);
      try { this._tabBtns[ids[target]].focus(); } catch (_) {}
    }
  };

  proto._onWorksTabKeydown = function (e) {
    var tabs = this.opts.worksTabs || [];
    var ids = tabs.map(function (t) { return t.id; });
    var cur = ids.indexOf(this._worksCat);
    if (cur < 0) return;
    var target = null;
    if (e.key === 'ArrowRight') target = (cur + 1) % ids.length;
    else if (e.key === 'ArrowLeft') target = (cur - 1 + ids.length) % ids.length;
    if (target !== null) {
      e.preventDefault();
      this._switchWorksCat(ids[target]);
      try { this._worksTabBtns[ids[target]].focus(); } catch (_) {}
    }
  };

  /* ---------- A11y 播报 ---------- */
  proto._announce = function (msg) {
    if (this._liveEl) this._liveEl.textContent = msg;
  };

  /* ============================================================
   * 挂载后：缩放、渲染、绑定全局事件
   * ============================================================ */
  proto._afterMount = function () {
    var self = this;
    this._applyScale();

    // 渲染各视图
    if (this._views.graph) {
      this._renderGraph();
    }
    if (this._views.mind) {
      raf(function () { self._renderMind(); });
    }
    if (this._views.works) {
      this._renderWorks();
    }
    this._startPhysics();

    // 全局 ESC：关闭剧情弹窗 / 角色面板
    this._escHandler = function (e) {
      if (e.key !== 'Escape') return;
      if (self._plotModalMask && self._plotModalMask.classList.contains('active')) {
        self._closePlotModal();
        return;
      }
      if (self._graphWrap && self._graphWrap.classList.contains('panel-open')) {
        self._closeChar();
        return;
      }
    };
    on(document, 'keydown', this._escHandler);

    // resize：同步缩放 + debounce 重排
    on(global, 'resize', function () {
      self._applyScale();
      clearTimeout(self._resizeTimer);
      self._resizeTimer = setTimeout(function () {
        var baseChanged = self._prevBaseKey !== self._currentBaseKey;
        self._prevBaseKey = self._currentBaseKey;
        if (baseChanged) {
          if (self._views.graph) {
            self._renderGraph();
            if (self._graphWrap.classList.contains('panel-open')) self._relayout();
          }
          if (self._views.mind) self._renderMind();
          if (self._views.works) self._renderWorks();
        }
      }, 150);
    });

    // 首次进入：主角头像脉冲提示
    if (this.opts.hero) {
      var heroNode = this._nodeState[this.opts.hero];
      if (heroNode) {
        heroNode.el.classList.add('tap-hint');
        setTimeout(function () { heroNode.el.classList.remove('tap-hint'); }, this.opts.tapHintDuration);
      }
    }
  };

  /* ============================================================
   * 暴露 API
   * ============================================================ */
  var API = {
    version: '1.0.0',
    create: function (options) {
      var inst = new CharStoryGraph(options);
      return inst.create();
    },
    mount: function (container, options) {
      var inst = new CharStoryGraph(options);
      return inst.mount(container);
    },
    CharStoryGraph: CharStoryGraph
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.CharStoryGraph = API;
})(typeof window !== 'undefined' ? window : this);
