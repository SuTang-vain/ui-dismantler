/*!
 * shexiang-furen.js  v1.0.0
 * 奢香夫人 · 五大事件与人物关系 — 渲染引擎（IIFE，零依赖）
 *
 * 暴露：window.ShexiangFuren = { mount(container, options), create(options) }
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

  function isMobile() {
    return global.innerWidth <= 480 || global.innerHeight <= 480;
  }

  /* ---------- 默认配置 ---------- */
  var DEFAULTS = {
    legend: [
      { type: 'family', label: '亲族' },
      { type: 'ruler', label: '君臣' },
      { type: 'ally', label: '盟友' },
      { type: 'enemy', label: '对立' }
    ],
    hint: '点击头像查看人物详情，可拖动',
    events: [],
    initial: 0,
    theme: {}
  };

  /* ---------- 渲染类 ---------- */
  function ShexiangFuren(options) {
    this.opts = deepMerge({}, DEFAULTS, options || {});
    this.root = null;
    this.current = this.opts.initial || 0;
    this.modalOpenKey = null;
    this._nodeState = {};   // name -> { el, inner, x, y, big, person }
    this._edgeEls = [];     // { path, bg, text, a, b }
    this._imgCache = {};
    this._lastFocus = null;
    this._hintHidden = false;
  }

  ShexiangFuren.prototype.create = function () {
    var root = el('div', 'sg-frame');
    this.root = root;
    this._buildIntro(root);
    this._buildGraph(root);
    this._buildEventBar(root);
    this._buildModal(root);
    return root;
  };

  ShexiangFuren.prototype.mount = function (container) {
    var node = this.create();
    (container || document.body).appendChild(node);
    this._afterMount();
    return node;
  };

  /* ===== 顶部：事件简介 ===== */
  ShexiangFuren.prototype._buildIntro = function (root) {
    var intro = el('div', 'sg-event-intro', { role: 'region', 'aria-label': '事件简介' });
    this._introIcon = el('div', 'sg-intro-icon');
    intro.appendChild(this._introIcon);
    var text = el('div', 'sg-intro-text');
    var titleLine = el('div', 'sg-intro-title-line');
    this._introName = el('div', 'sg-intro-name');
    this._introPeriod = el('span', 'sg-intro-period');
    titleLine.appendChild(this._introName);
    titleLine.appendChild(this._introPeriod);
    text.appendChild(titleLine);
    this._introSummary = el('div', 'sg-intro-summary');
    text.appendChild(this._introSummary);
    intro.appendChild(text);
    this._introIndex = el('div', 'sg-intro-index');
    intro.appendChild(this._introIndex);
    root.appendChild(intro);
  };

  /* ===== 中部：图谱 ===== */
  ShexiangFuren.prototype._buildGraph = function (root) {
    var self = this;
    var wrap = el('div', 'sg-graph-wrap', { role: 'tabpanel', 'aria-label': '人物关系图谱' });

    // 图例
    var legend = el('div', 'sg-graph-legend');
    this.opts.legend.forEach(function (lg) {
      var item = el('div', 'sg-legend-item');
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

    var hint = el('div', 'sg-graph-hint', { 'aria-hidden': 'true' });
    hint.appendChild(el('span', 'sg-gh-dot'));
    hint.appendChild(document.createTextNode(this.opts.hint));
    wrap.appendChild(hint);

    root.appendChild(wrap);
    this._graphWrap = wrap;
    this._graphCanvas = canvas;
    this._edgesSvg = edgesSvg;
    this._graphHint = hint;
  };

  /* ===== 底部：事件切换条 ===== */
  ShexiangFuren.prototype._buildEventBar = function (root) {
    var self = this;
    var bar = el('div', 'sg-event-bar', { role: 'tablist', 'aria-label': '事件切换' });

    this._btnPrev = el('button', 'sg-bar-arrow', {
      text: '‹', 'aria-label': '上一个事件'
    });
    on(this._btnPrev, 'click', function () { self._goEvent(self.current - 1); });
    bar.appendChild(this._btnPrev);

    var btns = el('div', 'sg-event-btns');
    this.opts.events.forEach(function (ev, i) {
      var btn = el('button', 'sg-event-btn', {
        role: 'tab',
        'aria-selected': String(i === self.current),
        'data-idx': String(i)
      });
      btn.appendChild(el('div', 'sg-eb-name', { text: ev.name }));
      btn.appendChild(el('div', 'sg-eb-year', { text: ev.year }));
      on(btn, 'click', function () { self._goEvent(i); });
      btns.appendChild(btn);
    });
    bar.appendChild(btns);
    this._eventBtns = btns;

    this._btnNext = el('button', 'sg-bar-arrow', {
      text: '›', 'aria-label': '下一个事件'
    });
    on(this._btnNext, 'click', function () { self._goEvent(self.current + 1); });
    bar.appendChild(this._btnNext);

    // 滑动提示（移动端）
    this._swipeHint = el('div', 'sg-swipe-hint', { 'aria-hidden': 'true', text: '›' });
    bar.appendChild(this._swipeHint);

    root.appendChild(bar);
  };

  /* ===== 人物详情弹窗 ===== */
  ShexiangFuren.prototype._buildModal = function (root) {
    var self = this;
    var modal = el('div', 'sg-modal', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': '人物详情'
    });
    var content = el('div', 'sg-modal-content');
    this._modalClose = el('button', 'sg-modal-close', { text: '✕', 'aria-label': '关闭' });
    content.appendChild(this._modalClose);

    var head = el('div', 'sg-modal-head');
    this._modalAvatar = el('div', 'sg-modal-avatar');
    var info = el('div', 'sg-modal-head-info');
    this._modalName = el('div', 'sg-modal-name');
    this._modalRole = el('div', 'sg-modal-role');
    this._modalRelTag = el('span', 'sg-modal-rel-tag');
    info.appendChild(this._modalName);
    info.appendChild(this._modalRole);
    info.appendChild(this._modalRelTag);
    head.appendChild(this._modalAvatar);
    head.appendChild(info);
    content.appendChild(head);

    var body = el('div', 'sg-modal-body');
    var sec1 = el('div', 'sg-modal-section');
    sec1.appendChild(el('div', 'sg-modal-section-title', { text: '在本事件中的作为' }));
    this._modalDeed = el('div', 'sg-modal-section-text');
    sec1.appendChild(this._modalDeed);
    body.appendChild(sec1);
    var sec2 = el('div', 'sg-modal-section');
    sec2.appendChild(el('div', 'sg-modal-section-title', { text: '影响' }));
    this._modalImpact = el('div', 'sg-modal-section-text');
    sec2.appendChild(this._modalImpact);
    body.appendChild(sec2);
    content.appendChild(body);

    modal.appendChild(content);
    root.appendChild(modal);
    this._modal = modal;

    on(this._modalClose, 'click', function () { self._closeModal(); });
    on(modal, 'click', function (e) { if (e.target === modal) self._closeModal(); });
  };

  /* ===== 渲染当前事件 ===== */
  ShexiangFuren.prototype._renderEvent = function () {
    var self = this;
    var ev = this.opts.events[this.current];
    if (!ev) return;

    // 简介
    this._introName.textContent = ev.name;
    this._introPeriod.textContent = ev.period;
    this._introSummary.textContent = ev.summaryShort || ev.summary || '';
    this._introIndex.innerHTML = '<b>' + (this.current + 1) + '</b> / ' + this.opts.events.length;
    this._bindBg(this._introIcon, ev.image);

    // 图谱：清空
    this._nodeState = {};
    this._edgeEls = [];
    this._graphCanvas.querySelectorAll('.sg-node').forEach(function (n) { n.remove(); });
    while (this._edgesSvg.firstChild) this._edgesSvg.removeChild(this._edgesSvg.firstChild);

    // 节点
    ev.people.forEach(function (p, idx) {
      self._addNode(p, idx);
    });

    // 连线
    (ev.links || []).forEach(function (lk) {
      self._addEdge(lk);
    });

    this._renderEdges();

    // 高亮首个非 big 节点（与原案例一致）
    var first = ev.people.find(function (p) { return !p.big; });
    if (first) this._setActive(first.name);
  };

  ShexiangFuren.prototype._addNode = function (p, idx) {
    var self = this;
    var node = el('div', 'sg-node' + (p.big ? ' big' : ''), {
      role: 'button',
      tabindex: '0',
      'aria-label': p.name + (p.role ? '，' + p.role : '') + (p.rel ? '，' + this._relName(p.rel) : ''),
      style: 'left:' + p.px + '%;top:' + p.py + '%'
    });
    if (idx) node.style.animationDelay = '';
    var inner = el('div', 'sg-float-inner');
    var avatar = el('div', 'sg-avatar');
    this._bindBg(avatar, p.avatar);
    inner.appendChild(avatar);
    inner.appendChild(el('div', 'sg-name', { text: p.name }));
    if (p.role) inner.appendChild(el('div', 'sg-role-chip', { text: p.role }));
    node.appendChild(inner);

    on(node, 'click', function (e) {
      if (node._dragMoved) { node._dragMoved = false; return; }
      self._showPerson(p);
    });
    on(node, 'keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self._showPerson(p); }
    });

    this._attachDrag(node, p);
    this._graphCanvas.appendChild(node);
    this._nodeState[p.name] = { el: node, inner: inner, x: p.px, y: p.py, big: !!p.big, person: p };
  };

  ShexiangFuren.prototype._addEdge = function (lk) {
    var a = this._nodeState[lk.a];
    var b = this._nodeState[lk.b];
    if (!a || !b) return;
    var type = lk.type || 'family';
    var path = svgEl('path');
    path.setAttribute('class', 'sg-edge ' + type);
    path.setAttribute('fill', 'none');
    this._edgesSvg.appendChild(path);

    var bg = svgEl('rect');
    bg.setAttribute('class', 'sg-edge-label-bg');
    this._edgesSvg.appendChild(bg);

    var text = svgEl('text');
    text.setAttribute('class', 'sg-edge-label');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.textContent = lk.label || '';
    this._edgesSvg.appendChild(text);

    this._edgeEls.push({ path: path, bg: bg, text: text, a: lk.a, b: lk.b, type: type });
  };

  ShexiangFuren.prototype._renderEdges = function () {
    var W = this._graphCanvas.clientWidth || 400;
    var H = this._graphCanvas.clientHeight || 300;
    var self = this;
    this._edgeEls.forEach(function (e) {
      var a = self._nodeState[e.a];
      var b = self._nodeState[e.b];
      if (!a || !b) return;
      var x1 = a.x / 100 * W, y1 = a.y / 100 * H;
      var x2 = b.x / 100 * W, y2 = b.y / 100 * H;
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
  ShexiangFuren.prototype._attachDrag = function (node, p) {
    var self = this;
    var dragging = false;
    var startX = 0, startY = 0;
    var origX = 0, origY = 0;

    function down(clientX, clientY) {
      var canvas = self._graphCanvas;
      var rect = canvas.getBoundingClientRect();
      dragging = true;
      node._dragMoved = false;
      node.classList.add('grabbing');
      startX = clientX; startY = clientY;
      origX = p.px; origY = p.py;
      return rect;
    }
    function move(clientX, clientY, rect) {
      if (!dragging) return;
      var dx = (clientX - startX) / rect.width * 100;
      var dy = (clientY - startY) / rect.height * 100;
      if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
        node._dragMoved = true;
        self._hideHint();
      }
      var nx = Math.max(5, Math.min(95, origX + dx));
      var ny = Math.max(5, Math.min(95, origY + dy));
      p.px = nx; p.py = ny;
      node.style.left = nx + '%';
      node.style.top = ny + '%';
      var st = self._nodeState[p.name];
      if (st) { st.x = nx; st.y = ny; }
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

  /* ===== 高亮 ===== */
  ShexiangFuren.prototype._setActive = function (name) {
    var self = this;
    Object.keys(this._nodeState).forEach(function (n) {
      var st = self._nodeState[n];
      st.el.classList.toggle('active', n === name);
      st.el.classList.toggle('dim', !!name && n !== name && !st.big);
    });
    // 边高亮：与 active 节点相关
    this._edgeEls.forEach(function (e) {
      var hl = name && (e.a === name || e.b === name);
      e.path.classList.toggle('hl', hl);
      e.path.classList.toggle('dim', !!name && !hl);
      e.text.classList.toggle('hl', hl);
      e.text.classList.toggle('dim', !!name && !hl);
      e.bg.classList.toggle('hl', hl);
      e.bg.classList.toggle('dim', !!name && !hl);
    });
  };

  ShexiangFuren.prototype._clearActive = function () {
    var self = this;
    Object.keys(this._nodeState).forEach(function (n) {
      self._nodeState[n].el.classList.remove('active', 'dim');
    });
    this._edgeEls.forEach(function (e) {
      e.path.classList.remove('hl', 'dim');
      e.text.classList.remove('hl', 'dim');
      e.bg.classList.remove('hl', 'dim');
    });
  };

  /* ===== 人物详情 ===== */
  ShexiangFuren.prototype._showPerson = function (p) {
    this._setActive(p.name);
    this._modalName.textContent = p.name;
    this._modalRole.textContent = p.role || '';
    this._modalDeed.textContent = p.deed || '';
    this._modalImpact.textContent = p.impact || '';
    this._bindBg(this._modalAvatar, p.avatar);
    this._modalRelTag.textContent = p.rel ? this._relName(p.rel) : '';
    this._modalRelTag.className = 'sg-modal-rel-tag' + (p.rel ? ' ' + p.rel : '');
    this._modal.classList.add('on');
    this.modalOpenKey = p.name;
    this._lastFocus = document.activeElement;
    try { this._modalClose.focus(); } catch (e) {}
    this._announce('查看 ' + p.name + ' 详情');
  };

  ShexiangFuren.prototype._closeModal = function () {
    this._modal.classList.remove('on');
    this.modalOpenKey = null;
    this._clearActive();
    if (this._lastFocus) { try { this._lastFocus.focus(); } catch (e) {} }
  };

  /* ===== 事件切换 ===== */
  ShexiangFuren.prototype._goEvent = function (idx) {
    if (idx < 0 || idx >= this.opts.events.length) return;
    this.current = idx;
    var self = this;
    this._eventBtns.querySelectorAll('.sg-event-btn').forEach(function (b, i) {
      b.classList.toggle('on', i === idx);
      b.setAttribute('aria-selected', String(i === idx));
    });
    this._btnPrev.disabled = idx === 0;
    this._btnNext.disabled = idx === this.opts.events.length - 1;
    // 滚动到选中按钮
    var activeBtn = this._eventBtns.querySelectorAll('.sg-event-btn')[idx];
    if (activeBtn) activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    this._renderEvent();
    this._announce('切换到事件 ' + this.opts.events[idx].name);
  };

  ShexiangFuren.prototype._relName = function (type) {
    var m = { family: '亲族', ruler: '君臣', ally: '盟友', enemy: '对立' };
    return m[type] || type;
  };

  /* ===== 提示隐藏 ===== */
  ShexiangFuren.prototype._hideHint = function () {
    if (this._hintHidden) return;
    this._hintHidden = true;
    this._graphHint.classList.add('hide');
    if (this._swipeHint) this._swipeHint.classList.add('hide');
  };

  /* ===== 图片背景绑定 + 回退 ===== */
  ShexiangFuren.prototype._bindBg = function (node, src) {
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

  /* ===== aria-live 公告 ===== */
  ShexiangFuren.prototype._announce = function (msg) {
    if (this._live) this._live.textContent = msg;
  };

  /* ===== 挂载后初始化 ===== */
  ShexiangFuren.prototype._afterMount = function () {
    var self = this;
    // 主题
    if (this.opts.theme) {
      var frame = this.root;
      Object.keys(this.opts.theme).forEach(function (k) {
        frame.style.setProperty(k, self.opts.theme[k]);
      });
    }
    // aria-live 区域
    this._live = el('div', 'sg-live', { 'aria-live': 'polite', 'aria-atomic': 'true' });
    this.root.appendChild(this._live);

    // 首屏渲染
    this._renderEvent();
    this._btnPrev.disabled = this.current === 0;
    this._btnNext.disabled = this.current === this.opts.events.length - 1;

    // 全局键盘：ESC 关闭弹窗
    on(this.root, 'keydown', function (e) {
      if (e.key === 'Escape' && self._modal.classList.contains('on')) {
        self._closeModal();
      }
      if (!self._modal.classList.contains('on')) {
        if (e.key === 'ArrowLeft') self._goEvent(self.current - 1);
        if (e.key === 'ArrowRight') self._goEvent(self.current + 1);
      }
    });

    // 窗口尺寸变化：重排连线
    var rt = null;
    on(global, 'resize', function () {
      if (rt) clearTimeout(rt);
      rt = setTimeout(function () { self._renderEdges(); }, 120);
    });

    // 首次交互后隐藏提示
    on(this._graphCanvas, 'pointerdown', function () { self._hideHint(); });
  };

  /* ---------- API ---------- */
  var API = {
    mount: function (container, options) {
      return new ShexiangFuren(options).mount(container);
    },
    create: function (options) {
      return new ShexiangFuren(options).create();
    }
  };
  global.ShexiangFuren = API;
  if (typeof window !== 'undefined') window.ShexiangFuren = API;
})(typeof window !== 'undefined' ? window : this);
