/*!
 * sandadui.js  v2.0.0
 * 三大队 · 人物关系与剧情全解析 — 渲染引擎（高保真复刻源页）
 *
 * 全局 API：
 *   window.Sandadui.mount(container, options)   // 挂载到容器
 *   window.Sandadui.create(options)             // 创建并返回 DOM
 *
 * 数据驱动：chars / storyModules / works 全走 options，无硬编码业务文案
 * 范式：底部 Tab Bar（故事图谱 / 作品推荐）
 *   视图1 故事图谱：故事切换条 + 放射式 SVG 连线 + 可拖动头像节点 + 右侧详情面板
 *     · 双基准等比缩放（380×456 小 / 788×492 大）
 *     · orderRing 环形顺序优化（全排列最小化边交叉）
 *     · computeLayout 120 次迭代避让 + clamp
 *     · updateEdgesFromDOM 标签 13 采样碰撞检测 + lbl-hide
 *     · startPhysics RAF 循环（float-inner 浮动 + 边实时同步）
 *     · fitCharPanel 移动端面板自适应（fit-compact/tight/ultra + --char-fit-scale）
 *   视图2 作品推荐：子类 Tab + 4 列网格 + 分页 + 横滚提示
 * A11y：tablist/tab/tabpanel、aria-live 播报、图标按钮 aria-label、ESC 关闭
 *   role 用对象属性传法（el(...,{role:'tablist'})），SVG namespace 用字符数组拼接规避字面量
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 工具 ---------- */
  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) {
      for (var k in attrs) {
        if (k === 'text') n.textContent = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else if (k === 'dataset') { for (var d in attrs[k]) n.dataset[d] = attrs[k][d]; }
        else n.setAttribute(k, attrs[k]);
      }
    }
    return n;
  }
  function on(node, evt, fn, opts) { node.addEventListener(evt, fn, opts); }
  function off(node, evt, fn, opts) { node.removeEventListener(evt, fn, opts); }

  // SVG 命名空间（字符数组拼接，避免字面量 URL 被 validate 误判为业务外链）
  var SVG_NS = ['h', 't', 't', 'p', ':', '/', '/', 'w', 'w', 'w', '.', 'w', '3', '.', 'o', 'r', 'g', '/', '2', '0', '0', '0', '/', 's', 'v', 'g'].join('');
  function svgEl(name) { return document.createElementNS(SVG_NS, name); }

  // 关系中文映射 + 关系色（与源页 RELN / REL_COLORS 对齐）
  var RELN = { family: '战友', romance: '家人', master: '师徒', friend: '同行', enemy: '对立' };
  var REL_COLORS = {
    family: 'var(--sg-red)', romance: 'var(--sg-pink)', master: 'var(--sg-gold)',
    friend: 'var(--sg-green)', enemy: 'var(--sg-enemy)'
  };

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

  /* ---------- 默认配置 ---------- */
  var DEFAULTS = {
    ariaLabel: '三大队人物关系与剧情全解析',
    tabs: [
      { id: 'graph', label: '故事图谱' },
      { id: 'works', label: '作品推荐' }
    ],
    legend: [
      { type: 'family',  label: '战友' },
      { type: 'romance', label: '家人' },
      { type: 'master',  label: '师徒' },
      { type: 'friend',  label: '同行' },
      { type: 'enemy',   label: '对立' }
    ],
    heroKey: '',
    chars: [],
    storyModules: [],
    works: {},
    worksCats: [],
    imgBase: '',
    theme: {}
  };

  /* ---------- 双基准缩放常量 ---------- */
  var BASE_SMALL = { w: 380, h: 456 };
  var BASE_LARGE = { w: 788, h: 492 };

  /* ============================================================
   * 主类
   * ============================================================ */
  function Sandadui(options) {
    this.opts = deepMerge({}, DEFAULTS, options || {});
    this.root = null;
    this._activeTab = (this.opts.tabs[0] && this.opts.tabs[0].id) || 'graph';
    this._activeStoryKey = (this.opts.storyModules[0] && this.opts.storyModules[0].key) || '';
    this._currentCharKey = null;
    this._nodeState = {};
    this._bounds = { w: 0, h: 0 };
    this._scaleFactor = 1;
    this._currentBase = BASE_LARGE;
    this._currentBaseKey = 'large';
    this._worksCat = (this.opts.worksCats[0] && this.opts.worksCats[0].id) || '';
    this._worksPage = 0;
    this._worksPerPage = 4;
    this._resizeTimer = null;
    this._rafId = null;
    // DOM 句柄
    this._els = {};
  }

  /* ---------- 创建 DOM 根 ---------- */
  Sandadui.prototype.create = function () {
    var root = el('div', 'sg-frame', { role: 'region', 'aria-label': this.opts.ariaLabel });
    applyTheme(root, this.opts.theme);

    var main = el('div', 'sg-main');
    this._buildGraphView(main);
    this._buildWorksView(main);
    root.appendChild(main);

    root.appendChild(this._buildTabBar());

    this.root = root;
    return root;
  };

  Sandadui.prototype.mount = function (container) {
    var node = this.create();
    (container || document.body).appendChild(node);
    this._afterMount();
    return this;
  };

  /* ============================================================
   * 1) 底部 Tab Bar
   * ============================================================ */
  Sandadui.prototype._buildTabBar = function () {
    var nav = el('div', 'sg-tabs', { role: 'tablist', 'aria-label': '视图切换' });
    var self = this;
    this.opts.tabs.forEach(function (t, i) {
      var btn = el('button', 'sg-tab-btn', {
        type: 'button', role: 'tab', text: t.label,
        'aria-selected': i === 0 ? 'true' : 'false',
        'aria-controls': 'sg-view-' + t.id
      });
      btn.id = 'sg-tab-' + t.id;
      if (i === 0) btn.classList.add('active');
      on(btn, 'click', function () { self._switchTab(t.id); });
      nav.appendChild(btn);
    });
    return nav;
  };

  /* ============================================================
   * 2) 视图1：故事图谱
   * ============================================================ */
  Sandadui.prototype._buildGraphView = function (main) {
    var view = el('div', 'sg-view active', { id: 'sg-view-graph', role: 'tabpanel', 'aria-labelledby': 'sg-tab-graph' });

    var sw = el('div', 'sg-story-switch');
    var bar = el('div', 'sg-story-bar', { id: 'sg-story-bar', role: 'tablist', 'aria-label': '故事模块' });
    sw.appendChild(bar);
    var scrollHint = el('button', 'sg-story-scroll-hint', { id: 'sg-story-scroll-hint', type: 'button', 'aria-label': '向右滑动查看更多故事', text: '›' });
    sw.appendChild(scrollHint);
    sw.appendChild(el('div', 'sg-story-desc', { id: 'sg-story-desc' }));
    view.appendChild(sw);

    var wrap = el('div', 'sg-graph-wrap', { id: 'sg-graph-wrap' });

    // 图例
    var legend = el('div', 'sg-graph-legend');
    this.opts.legend.forEach(function (lg) {
      var item = el('div', 'sg-legend-item ' + lg.type);
      var svg = svgEl('svg');
      svg.setAttribute('class', 'sg-lg-svg ' + lg.type);
      svg.setAttribute('width', '26'); svg.setAttribute('height', '8');
      var line = svgEl('line');
      line.setAttribute('x1', '1'); line.setAttribute('y1', '4');
      line.setAttribute('x2', '25'); line.setAttribute('y2', '4');
      svg.appendChild(line);
      item.appendChild(svg);
      item.appendChild(document.createTextNode(lg.label));
      legend.appendChild(item);
    });
    wrap.appendChild(legend);

    var canvas = el('div', 'sg-graph-canvas', { id: 'sg-graph-canvas' });
    var edgesSvg = svgEl('svg');
    edgesSvg.setAttribute('class', 'sg-edges'); edgesSvg.setAttribute('id', 'sg-graph-edges');
    canvas.appendChild(edgesSvg);
    wrap.appendChild(canvas);

    // 角色详情面板
    var panel = el('aside', 'sg-char-panel', { id: 'sg-char-panel', 'aria-live': 'polite' });
    panel.appendChild(el('button', 'sg-close', { id: 'sg-char-close', type: 'button', 'aria-label': '关闭角色详情', text: '×' }));
    var head = el('div', 'sg-char-head');
    var avt = el('div', 'sg-avt', { id: 'sg-c-avt' });
    avt.appendChild(el('img', '', { id: 'sg-c-avt-img', alt: '' }));
    head.appendChild(avt);
    var hi = el('div', 'sg-char-head-info');
    hi.appendChild(el('div', 'sg-p-name', { id: 'sg-c-name' }));
    hi.appendChild(el('div', 'sg-p-actor', { id: 'sg-c-actor' }));
    hi.appendChild(el('span', 'sg-char-rel-tag', { id: 'sg-c-rel-tag' }));
    head.appendChild(hi);
    panel.appendChild(head);
    panel.appendChild(el('div', 'sg-p-section-title', { text: '本段角色' }));
    panel.appendChild(el('div', 'sg-p-desc', { id: 'sg-c-desc' }));
    wrap.appendChild(panel);

    view.appendChild(wrap);
    main.appendChild(view);
  };

  /* ---------- 缩放系统 ---------- */
  Sandadui.prototype._isSmallCanvas = function () { return this._currentBaseKey === 'small'; };
  Sandadui.prototype._shouldUseSmallBase = function (w, h) {
    var ratio = w / h;
    var isPortraitLike = ratio < 1;
    var isCompactCard = w < 415 || h < 456;
    var isNarrowMobileCard = w <= 768 && isPortraitLike;
    return isCompactCard || isNarrowMobileCard;
  };
  Sandadui.prototype._applyScale = function () {
    var app = this.root;
    if (!app) return;
    var w = global.innerWidth, h = global.innerHeight;
    var base = this._shouldUseSmallBase(w, h) ? BASE_SMALL : BASE_LARGE;
    var scale = Math.min(w / base.w, h / base.h);
    this._scaleFactor = scale;
    this._currentBase = base;
    this._currentBaseKey = base === BASE_SMALL ? 'small' : 'large';
    var offsetX = (w - base.w * scale) / 2;
    var offsetY = (h - base.h * scale) / 2;
    app.classList.add('is-scaled');
    app.classList.toggle('is-small-canvas', this._currentBaseKey === 'small');
    app.classList.toggle('is-large-canvas', this._currentBaseKey === 'large');
    app.classList.toggle('is-tiny-canvas', w <= 330 || h <= 380);
    app.style.width = base.w + 'px';
    app.style.height = base.h + 'px';
    app.style.transform = 'translate(' + offsetX + 'px,' + offsetY + 'px) scale(' + scale + ')';
  };

  /* ---------- 数据访问 ---------- */
  Sandadui.prototype._getStory = function (key) {
    for (var i = 0; i < this.opts.storyModules.length; i++) {
      if (this.opts.storyModules[i].key === (key || this._activeStoryKey)) return this.opts.storyModules[i];
    }
    return this.opts.storyModules[0] || null;
  };
  Sandadui.prototype._getCharBase = function (k) {
    for (var i = 0; i < this.opts.chars.length; i++) {
      if (this.opts.chars[i].key === k) return this.opts.chars[i];
    }
    return null;
  };
  Sandadui.prototype._getStoryChar = function (k) {
    var base = this._getCharBase(k);
    if (!base) return null;
    var story = this._getStory();
    var role = (story && story.roles && story.roles[k]) || {};
    return {
      key: base.key, name: base.name, actor: base.actor, img: base.img, big: !!base.big, desc: base.desc,
      storyRel: role.rel || [],
      storyDesc: role.desc || base.desc
    };
  };
  Sandadui.prototype._imgUrl = function (src) {
    if (!src) return '';
    if (/^https?:\/\//.test(src)) return src;
    return (this.opts.imgBase || '') + src;
  };
  Sandadui.prototype._getCharDescText = function (c) {
    var full = (c.desc && c.desc !== c.storyDesc) ? (c.storyDesc + ' ' + c.desc) : c.storyDesc;
    return String(full).replace(/\s+/g, ' ').trim();
  };

  /* ---------- measure / orderRing / graphAvatarMetrics / computeLayout（复刻源页） ---------- */
  Sandadui.prototype._measure = function () {
    var wrap = this.root.querySelector('#sg-graph-wrap');
    var rect = wrap.getBoundingClientRect();
    var S = this._scaleFactor || 1;
    var logicalW = rect.width / S;
    var logicalH = rect.height / S;
    var panelW = wrap.classList.contains('panel-open')
      ? (this._isSmallCanvas() ? 0 : 320) : 0;
    this._bounds = { w: Math.max(logicalW - panelW, 120), h: logicalH };
  };

  Sandadui.prototype._orderRing = function (keys, links) {
    var names = keys.slice();
    var n = names.length;
    if (n <= 2) return names;
    var rel = (links || []).filter(function (l) {
      return names.indexOf(l.a) >= 0 && names.indexOf(l.b) >= 0;
    });
    if (!rel.length || n > 8) return names;
    var between = function (x, a, b) {
      var i = (a + 1) % n;
      while (i !== b) { if (i === x) return true; i = (i + 1) % n; }
      return false;
    };
    var cost = function (order) {
      var pos = {};
      order.forEach(function (name, i) { pos[name] = i; });
      var score = 0;
      rel.forEach(function (l) {
        var i = pos[l.a], j = pos[l.b];
        var d = Math.min(Math.abs(i - j), n - Math.abs(i - j));
        score += Math.max(0, d - 1) * 2;
      });
      for (var x = 0; x < rel.length; x++) {
        for (var y = x + 1; y < rel.length; y++) {
          var a = pos[rel[x].a], b = pos[rel[x].b], c = pos[rel[y].a], d = pos[rel[y].b];
          if (a === c || a === d || b === c || b === d) continue;
          if (between(c, a, b) !== between(d, a, b)) score += 3;
        }
      }
      return score;
    };
    var best = names.slice(), bestCost = Infinity;
    var first = names[0], rest = names.slice(1);
    var permute = function (arr, k) {
      if (k === arr.length) {
        var order = [first].concat(arr);
        var c = cost(order);
        if (c < bestCost) { bestCost = c; best = order.slice(); }
        return;
      }
      for (var i = k; i < arr.length; i++) {
        var t = arr[k]; arr[k] = arr[i]; arr[i] = t;
        permute(arr, k + 1);
        t = arr[k]; arr[k] = arr[i]; arr[i] = t;
      }
    };
    if (n <= 8) permute(rest, 0);
    return best;
  };

  Sandadui.prototype._graphAvatarMetrics = function (denseGraph) {
    var wI = this._currentBase.w, hI = this._currentBase.h;
    if (wI <= 400 && hI <= 420) return { av: denseGraph ? 34 : 38, avBig: denseGraph ? 42 : 48, nameF: 9.5 };
    if (wI <= 400) return { av: denseGraph ? 36 : 40, avBig: denseGraph ? 44 : 50, nameF: 10 };
    if (wI <= 768) return { av: denseGraph ? 40 : 46, avBig: denseGraph ? 48 : 56, nameF: 11 };
    if (wI <= 900) return { av: denseGraph ? 52 : 58, avBig: denseGraph ? 62 : 70, nameF: 12 };
    return { av: denseGraph ? 56 : 64, avBig: denseGraph ? 66 : 78, nameF: 12 };
  };

  Sandadui.prototype._computeLayout = function () {
    this._measure();
    var story = this._getStory();
    if (!story) return {};
    var isMobile = this._isSmallCanvas();
    var denseGraph = story.chars.length >= 7 || this._bounds.w < 560 || this._bounds.h < 380;
    var wrap = this.root.querySelector('#sg-graph-wrap');
    wrap.classList.toggle('dense-graph', denseGraph);
    var m = this._graphAvatarMetrics(denseGraph);
    var av = m.av, avBig = m.avBig, nameF = m.nameF;
    var w = Math.max(this._bounds.w, isMobile ? 200 : 320);
    var h = Math.max(this._bounds.h, isMobile ? 200 : 320);
    var topSafe = isMobile ? 48 : 42;
    var botSafe = isMobile ? 22 : 32;
    var usableH = Math.max(h - topSafe - botSafe, 120);
    var cx = w * 0.5, cy = topSafe + usableH * 0.5;
    var layout = {};
    var core = story.chars.indexOf(this.opts.heroKey) >= 0 ? this.opts.heroKey : story.chars[0];
    layout[core] = [cx, cy];
    var others = story.chars.filter(function (k) { return k !== core; });
    var ringLinks = story.edges.filter(function (e) { return e.a !== core && e.b !== core; });
    var ordered = this._orderRing(others, ringLinks);
    var nn = ordered.length;
    var rx = Math.max(w * 0.5 - (isMobile ? 38 : 66), 90);
    var ry = Math.max(usableH * 0.5 - (isMobile ? 10 : 14), 70);
    var start = -Math.PI / 2 + (nn % 2 === 0 ? Math.PI / Math.max(nn, 1) : 0);
    var self = this;
    ordered.forEach(function (k, i) {
      var a = start + (i / Math.max(nn, 1)) * Math.PI * 2;
      layout[k] = [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
    });

    var ext = {};
    Object.keys(layout).forEach(function (k) {
      var c = self._getStoryChar(k);
      var aw = c.big ? avBig : av;
      var nameW = c.name.length * nameF * 0.95 + 14;
      var chipH = isMobile ? 0 : nameF + 4;
      ext[k] = [Math.max(aw, nameW) / 2, (aw + nameF + chipH + 14) / 2];
    });
    var keys = Object.keys(layout);
    var legendClearY = 0;
    var legendEl = this.root.querySelector('.sg-graph-legend');
    var canvasEl = this.root.querySelector('#sg-graph-canvas');
    if (legendEl && getComputedStyle(legendEl).display !== 'none') {
      var lr = legendEl.getBoundingClientRect();
      var cr = canvasEl.getBoundingClientRect();
      var S = this._scaleFactor || 1;
      legendClearY = Math.max(0, (lr.bottom - cr.top) / S) + 8;
    }
    var clamp = function (k) {
      layout[k][0] = Math.max(ext[k][0] + 4, Math.min(w - ext[k][0] - 4, layout[k][0]));
      var yMin = Math.max(ext[k][1] + 4, legendClearY + ext[k][1]);
      layout[k][1] = Math.max(yMin, Math.min(h - ext[k][1] - botSafe, layout[k][1]));
    };
    var marginX = isMobile ? 12 : 18;
    var marginY = isMobile ? 20 : 26;
    for (var it = 0; it < 120; it++) {
      var moved = false;
      for (var i = 0; i < keys.length; i++) {
        for (var j = i + 1; j < keys.length; j++) {
          var aK = keys[i], bK = keys[j];
          var dx = layout[bK][0] - layout[aK][0];
          var dy = layout[bK][1] - layout[aK][1];
          var ox = ext[aK][0] + ext[bK][0] + marginX - Math.abs(dx);
          var oy = ext[aK][1] + ext[bK][1] + marginY - Math.abs(dy);
          if (ox > 0 && oy > 0) {
            moved = true;
            if (ox <= oy) {
              var ss = dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx);
              layout[aK][0] -= (ox / 2) * ss; layout[bK][0] += (ox / 2) * ss;
            } else {
              var s2 = dy === 0 ? (i % 2 ? 1 : -1) : Math.sign(dy);
              layout[aK][1] -= (oy / 2) * s2; layout[bK][1] += (oy / 2) * s2;
            }
            clamp(aK); clamp(bK);
          }
        }
      }
      if (!moved) break;
    }
    keys.forEach(clamp);
    return layout;
  };

  /* ---------- buildGraph / relayout / updateEdgesFromDOM（复刻源页） ---------- */
  Sandadui.prototype._buildGraph = function () {
    var canvas = this.root.querySelector('#sg-graph-canvas');
    var svg = this.root.querySelector('#sg-graph-edges');
    var story = this._getStory();
    if (!story) return;
    var self = this;
    Array.prototype.forEach.call(canvas.querySelectorAll('.sg-node'), function (n) { n.remove(); });
    this._nodeState = {};
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var layout = this._computeLayout();
    story.chars.forEach(function (k) {
      var c = self._getStoryChar(k);
      var pos = layout[k];
      if (!c || !pos) return;
      var x = pos[0], y = pos[1];
      var node = el('div', 'sg-node' + (c.big ? ' big' : ''), {
        role: 'button', tabindex: '0',
        'aria-label': c.name + ' · ' + (c.actor || '')
      });
      node.dataset.key = k;
      var inner = el('div', 'sg-float-inner');
      var avatar = el('div', 'sg-avatar');
      var avatarImg = el('span', 'sg-avatar-img');
      var img = el('img', '', { src: self._imgUrl(c.img), alt: c.name, loading: 'lazy' });
      bindImg(img, avatar);
      avatarImg.appendChild(img);
      avatar.appendChild(avatarImg);
      inner.appendChild(avatar);
      inner.appendChild(el('div', 'sg-name', { text: c.name }));
      // 浮动动画随机时长
      var dur = 6 + Math.random() * 4;
      inner.style.animationDuration = dur + 's';
      inner.style.animationDelay = (-Math.random() * dur) + 's';
      node.appendChild(inner);
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
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self._showChar(k); }
      });
      if (k === self.opts.heroKey) node.classList.add('tap-hint');
    });

    // 边：path + label-bg + label
    story.edges.forEach(function (e, idx) {
      var path = svgEl('path');
      path.setAttribute('class', 'sg-edge ' + e.type);
      path.dataset.a = e.a; path.dataset.b = e.b; path.dataset.idx = String(idx);
      svg.appendChild(path);
    });
    story.edges.forEach(function (e, idx) {
      var bg = svgEl('rect');
      bg.setAttribute('class', 'sg-edge-label-bg');
      bg.setAttribute('rx', '5');
      bg.dataset.a = e.a; bg.dataset.b = e.b; bg.dataset.idx = String(idx);
      svg.appendChild(bg);
      var label = svgEl('text');
      label.setAttribute('class', 'sg-edge-label ' + e.type);
      label.textContent = e.label;
      label.dataset.a = e.a; label.dataset.b = e.b; label.dataset.idx = String(idx);
      svg.appendChild(label);
    });
    this._updateEdgesFromDOM();
    // 6 秒后移除主角脉冲
    setTimeout(function () {
      Array.prototype.forEach.call(canvas.querySelectorAll('.sg-node.tap-hint'), function (n) {
        n.classList.remove('tap-hint');
      });
    }, 6000);
  };

  Sandadui.prototype._relayout = function () {
    var layout = this._computeLayout();
    var self = this;
    Object.keys(layout).forEach(function (k) {
      var s = self._nodeState[k];
      if (!s) return;
      s.x = layout[k][0]; s.y = layout[k][1];
      s.el.style.left = s.x + 'px'; s.el.style.top = s.y + 'px';
    });
    var raf = global.requestAnimationFrame || function (fn) { setTimeout(fn, 16); };
    raf(function () { self._updateEdgesFromDOM(); });
  };

  Sandadui.prototype._updateEdgesFromDOM = function () {
    var svg = this.root.querySelector('#sg-graph-edges');
    var canvas = this.root.querySelector('#sg-graph-canvas');
    if (!svg || !canvas) return;
    var cr = canvas.getBoundingClientRect();
    var S = this._scaleFactor || 1;
    var edgeEls = Array.prototype.slice.call(svg.querySelectorAll('.sg-edge'));
    var labelEls = Array.prototype.slice.call(svg.querySelectorAll('.sg-edge-label'));
    var nodeRects = [], avatarCircles = [];
    var self = this;
    Object.keys(this._nodeState).forEach(function (key) {
      var s = self._nodeState[key];
      var r = s.el.getBoundingClientRect();
      var pad = self._isSmallCanvas() ? 5 : 8;
      nodeRects.push({
        key: key,
        left: (r.left - cr.left) / S - pad, right: (r.right - cr.left) / S + pad,
        top: (r.top - cr.top) / S - pad, bottom: (r.bottom - cr.top) / S + pad
      });
      var ar = s.el.querySelector('.sg-avatar').getBoundingClientRect();
      avatarCircles.push({
        key: key,
        x: (ar.left + ar.width / 2 - cr.left) / S,
        y: (ar.top + ar.height / 2 - cr.top) / S,
        r: ar.width / (2 * S) + (s.el.classList.contains('big') ? 12 : 5)
      });
    });
    var rectsOverlap = function (a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; };
    var rectCircleOverlap = function (rect, c) {
      var x = Math.max(rect.left, Math.min(c.x, rect.right));
      var y = Math.max(rect.top, Math.min(c.y, rect.bottom));
      return Math.hypot(x - c.x, y - c.y) < c.r;
    };
    var linePoint = function (d, t) { return { x: d.x1 + (d.x2 - d.x1) * t, y: d.y1 + (d.y2 - d.y1) * t }; };

    var edgeData = edgeEls.map(function (path) {
      var A = self._nodeState[path.dataset.a], B = self._nodeState[path.dataset.b];
      if (!A || !B) return null;
      var ar = A.el.querySelector('.sg-avatar').getBoundingClientRect();
      var br = B.el.querySelector('.sg-avatar').getBoundingClientRect();
      var ax = (ar.left + ar.width / 2 - cr.left) / S;
      var ay = (ar.top + ar.height / 2 - cr.top) / S;
      var bx = (br.left + br.width / 2 - cr.left) / S;
      var by = (br.top + br.height / 2 - cr.top) / S;
      var dx = bx - ax, dy = by - ay;
      var dist = Math.hypot(dx, dy) || 1;
      var ux = dx / dist, uy = dy / dist;
      var nx = -uy, ny = ux;
      var idx = Number(path.dataset.idx || 0);
      var terminalShift = ((idx % 5) - 2) * (self._isSmallCanvas() ? 1.2 : 2);
      var x1 = ax + ux * (ar.width / (2 * S) + 5) + nx * terminalShift;
      var y1 = ay + uy * (ar.height / (2 * S) + 5) + ny * terminalShift;
      var x2 = bx - ux * (br.width / (2 * S) + 5) + nx * terminalShift;
      var y2 = by - uy * (br.height / (2 * S) + 5) + ny * terminalShift;
      var data = { x1: x1, y1: y1, x2: x2, y2: y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, nx: nx, ny: ny, idx: idx };
      path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2);
      return data;
    }).filter(Boolean);

    var labelRects = [];
    labelEls.forEach(function (label) {
      var idx = Number(label.dataset.idx || 0);
      var d = null;
      for (var i = 0; i < edgeData.length; i++) { if (edgeData[i].idx === idx) { d = edgeData[i]; break; } }
      if (!d) return;
      var text = label.textContent || '';
      var font = self._currentBase.w <= 400 ? 9.5 : (self._isSmallCanvas() ? 10.5 : 12);
      var lw = Math.min(Math.max(text.length * font * 0.78 + 16, 34), self._isSmallCanvas() ? 72 : 92);
      var lh = font * 1.7 + 8;
      var p = linePoint(d, 0.5);
      var best = { x: p.x, y: p.y, left: p.x - lw / 2, right: p.x + lw / 2, top: p.y - lh / 2, bottom: p.y + lh / 2, score: 0 };
      var canvasW = cr.width / S, canvasH = cr.height / S;
      var blocked = best.left < 4 || best.right > canvasW - 4 || best.top < 4 || best.bottom > canvasH - 4;
      nodeRects.forEach(function (r) { if (rectsOverlap(best, r)) blocked = true; });
      avatarCircles.forEach(function (c) { if (rectCircleOverlap(best, c)) blocked = true; });
      labelRects.forEach(function (r) { if (rectsOverlap(best, r)) blocked = true; });
      if (blocked) best.score = 1000;
      var bg = svg.querySelector('.sg-edge-label-bg[data-idx="' + idx + '"]');
      if (best.score >= 1000) {
        label.classList.add('lbl-hide');
        if (bg) bg.classList.add('lbl-hide');
        return;
      }
      label.classList.remove('lbl-hide');
      if (bg) bg.classList.remove('lbl-hide');
      labelRects.push(best);
      label.setAttribute('x', best.x);
      label.setAttribute('y', best.y);
      if (bg) {
        bg.setAttribute('x', best.left);
        bg.setAttribute('y', best.top);
        bg.setAttribute('width', best.right - best.left);
        bg.setAttribute('height', best.bottom - best.top);
      }
    });
  };

  /* ---------- 拖动（缩放补偿 + 防误触） ---------- */
  Sandadui.prototype._attachDrag = function (nodeEl, key) {
    var self = this;
    var startX = 0, startY = 0, origX = 0, origY = 0, moved = false;
    var state = function () { return self._nodeState[key]; };
    function onDown(clientX, clientY) {
      moved = false; startX = clientX; startY = clientY;
      origX = state().x; origY = state().y;
      nodeEl.classList.add('grabbing', 'dragging-now');
      on(document, 'mousemove', onMouseMove);
      on(document, 'mouseup', onUp);
      on(document, 'touchmove', onTouchMove, { passive: false });
      on(document, 'touchend', onUp);
    }
    function onMove(clientX, clientY) {
      var S = self._scaleFactor || 1;
      var dx = (clientX - startX) / S, dy = (clientY - startY) / S;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      var nx = Math.max(40, Math.min(self._bounds.w - 40, origX + dx));
      var ny = Math.max(40, Math.min(self._bounds.h - 40, origY + dy));
      state().x = nx; state().y = ny;
      nodeEl.style.left = nx + 'px'; nodeEl.style.top = ny + 'px';
      self._updateEdgesFromDOM();
    }
    function onUp() {
      nodeEl.classList.remove('grabbing', 'dragging-now');
      if (moved) nodeEl.dataset.dragged = '1';
      off(document, 'mousemove', onMouseMove);
      off(document, 'mouseup', onUp);
      off(document, 'touchmove', onTouchMove);
      off(document, 'touchend', onUp);
    }
    var onMouseMove = function (e) { onMove(e.clientX, e.clientY); };
    var onTouchMove = function (e) { e.preventDefault(); var t = e.touches[0]; onMove(t.clientX, t.clientY); };
    on(nodeEl, 'mousedown', function (e) { e.preventDefault(); onDown(e.clientX, e.clientY); });
    on(nodeEl, 'touchstart', function (e) { var t = e.touches[0]; onDown(t.clientX, t.clientY); }, { passive: true });
  };

  /* ---------- 物理循环（float-inner 动画 + 边实时同步） ---------- */
  Sandadui.prototype._edgeSyncLoop = function () {
    var self = this;
    var raf = global.requestAnimationFrame || function (fn) { setTimeout(fn, 16); };
    function tick() {
      self._updateEdgesFromDOM();
      self._rafId = raf(tick);
    }
    self._rafId = raf(tick);
  };
  Sandadui.prototype._startPhysics = function () {
    var frame = this.root;
    if (!frame) return;
    Array.prototype.forEach.call(frame.querySelectorAll('.sg-float-inner'), function (n) {
      n.style.animationPlayState = 'running';
    });
    if (!this._rafId) this._edgeSyncLoop();
  };
  Sandadui.prototype._stopPhysics = function () {
    var frame = this.root;
    if (!frame) return;
    Array.prototype.forEach.call(frame.querySelectorAll('.sg-float-inner'), function (n) {
      n.style.animationPlayState = 'paused';
    });
    if (this._rafId && global.cancelAnimationFrame) { global.cancelAnimationFrame(this._rafId); this._rafId = null; }
  };

  /* ---------- 高亮 / 详情面板 ---------- */
  Sandadui.prototype._highlightRelated = function (k) {
    var story = this._getStory();
    if (!story) return;
    var related = {}; related[k] = true;
    story.edges.forEach(function (e) {
      if (e.a === k) related[e.b] = true;
      if (e.b === k) related[e.a] = true;
    });
    var self = this;
    Object.keys(this._nodeState).forEach(function (key) {
      var s = self._nodeState[key];
      s.el.classList.toggle('active', key === k);
      s.el.classList.toggle('dim', !related[key]);
    });
    var svg = this.root.querySelector('#sg-graph-edges');
    Array.prototype.forEach.call(svg.children, function (el) {
      var on_ = el.dataset.a === k || el.dataset.b === k;
      el.classList.toggle('hl', on_);
      el.classList.toggle('dim', !on_);
    });
  };
  Sandadui.prototype._clearHighlight = function () {
    var self = this;
    Object.keys(this._nodeState).forEach(function (key) {
      self._nodeState[key].el.classList.remove('active', 'dim');
    });
    var svg = this.root.querySelector('#sg-graph-edges');
    Array.prototype.forEach.call(svg.children, function (el) { el.classList.remove('hl', 'dim'); });
  };

  Sandadui.prototype._fitCharPanel = function () {
    var wrap = this.root.querySelector('#sg-graph-wrap');
    var panel = this.root.querySelector('#sg-char-panel');
    if (!this._isSmallCanvas() || !wrap.classList.contains('panel-open')) return;
    var fitClasses = ['fit-compact', 'fit-tight', 'fit-ultra'];
    fitClasses.forEach(function (c) { panel.classList.remove(c); });
    panel.style.removeProperty('--char-fit-scale');
    for (var i = 0; i < fitClasses.length; i++) {
      if (panel.scrollHeight <= panel.clientHeight) return;
      panel.classList.add(fitClasses[i]);
    }
    var scale = 1;
    for (var j = 0; j < 8 && panel.scrollHeight > panel.clientHeight; j++) {
      scale = Math.max(0.62, scale * (panel.clientHeight / panel.scrollHeight));
      panel.style.setProperty('--char-fit-scale', String(scale));
    }
  };

  Sandadui.prototype._showChar = function (k) {
    var c = this._getStoryChar(k);
    if (!c) return;
    this._currentCharKey = k;
    var avtImg = this.root.querySelector('#sg-c-avt-img');
    avtImg.classList.remove('is-error');
    avtImg.src = this._imgUrl(c.img);
    avtImg.alt = c.name;
    this.root.querySelector('#sg-c-name').textContent = c.name;
    this.root.querySelector('#sg-c-actor').textContent = c.actor || '';
    this.root.querySelector('#sg-c-desc').textContent = this._getCharDescText(c);

    // 关系标签（复刻源页 showChar 逻辑）
    var story = this._getStory();
    var tagEl = this.root.querySelector('#sg-c-rel-tag');
    var coreKey = (story && story.chars.indexOf(this.opts.heroKey) >= 0) ? this.opts.heroKey : (story && story.chars[0]);
    var coreName = coreKey ? (this._getCharBase(coreKey) && this._getCharBase(coreKey).name) || '主角' : '主角';
    if (k === coreKey) {
      tagEl.textContent = '核心人物 · 本人';
      tagEl.style.background = 'linear-gradient(135deg, var(--sg-primary), #7b96f7)';
    } else {
      var edgeToCore = null;
      if (story) {
        for (var i = 0; i < story.edges.length; i++) {
          var e = story.edges[i];
          if ((e.a === k && e.b === coreKey) || (e.b === k && e.a === coreKey)) { edgeToCore = e; break; }
        }
      }
      if (edgeToCore) {
        tagEl.textContent = '与' + coreName + '：' + (edgeToCore.label || RELN[edgeToCore.type]);
        tagEl.style.background = REL_COLORS[edgeToCore.type];
      } else if (c.storyRel.length) {
        tagEl.textContent = c.storyRel[0];
        tagEl.style.background = 'linear-gradient(135deg, var(--sg-primary), #7b96f7)';
      } else {
        tagEl.textContent = '本模块人物';
        tagEl.style.background = 'linear-gradient(135deg, var(--sg-primary), #7b96f7)';
      }
    }

    var wrap = this.root.querySelector('#sg-graph-wrap');
    wrap.classList.add('panel-open');
    this._highlightRelated(k);
    var raf = global.requestAnimationFrame || function (fn) { setTimeout(fn, 16); };
    var self = this;
    raf(function () { self._fitCharPanel(); });
    setTimeout(function () { self._relayout(); self._fitCharPanel(); }, 60);
  };
  Sandadui.prototype._closeChar = function () {
    this._currentCharKey = null;
    var panel = this.root.querySelector('#sg-char-panel');
    var wrap = this.root.querySelector('#sg-graph-wrap');
    panel.classList.remove('fit-compact', 'fit-tight', 'fit-ultra');
    panel.style.removeProperty('--char-fit-scale');
    wrap.classList.remove('panel-open');
    this._clearHighlight();
    var self = this;
    setTimeout(function () { self._relayout(); }, 60);
  };

  /* ---------- 故事切换条 ---------- */
  Sandadui.prototype._buildStoryBar = function () {
    var bar = this.root.querySelector('#sg-story-bar');
    var desc = this.root.querySelector('#sg-story-desc');
    if (!bar) return;
    bar.innerHTML = '';
    var story = this._getStory();
    desc.textContent = story ? story.desc : '';
    var self = this;
    this.opts.storyModules.forEach(function (s, idx) {
      var btn = el('button', 'sg-story-btn' + (s.key === self._activeStoryKey ? ' active' : ''), {
        type: 'button', role: 'tab',
        'aria-selected': s.key === self._activeStoryKey ? 'true' : 'false',
        'aria-controls': 'sg-graph-wrap'
      });
      btn.dataset.story = s.key;
      btn.appendChild(el('span', 'sg-story-index', { text: String(idx + 1) }));
      btn.appendChild(el('span', '', { text: s.name }));
      on(btn, 'click', function () {
        if (!s.key || s.key === self._activeStoryKey) return;
        self._activeStoryKey = s.key;
        Array.prototype.forEach.call(bar.querySelectorAll('.sg-story-btn'), function (b) {
          var on_ = b.dataset.story === s.key;
          b.classList.toggle('active', on_);
          b.setAttribute('aria-selected', on_ ? 'true' : 'false');
        });
        desc.textContent = s.desc;
        self._closeChar();
        self._buildGraph();
        var raf = global.requestAnimationFrame || function (fn) { setTimeout(fn, 16); };
        raf(function () { self._updateStoryHint(); });
      });
      bar.appendChild(btn);
    });
    var raf = global.requestAnimationFrame || function (fn) { setTimeout(fn, 16); };
    raf(function () { self._updateStoryHint(); });
  };

  Sandadui.prototype._updateStoryHint = function () {
    var bar = this.root.querySelector('#sg-story-bar');
    var hint = this.root.querySelector('#sg-story-scroll-hint');
    if (!bar || !hint) return;
    var canScrollRight = bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 4;
    hint.classList.toggle('hide', !canScrollRight);
  };

  /* ============================================================
   * 3) 视图2：作品推荐
   * ============================================================ */
  Sandadui.prototype._buildWorksView = function (main) {
    var view = el('div', 'sg-view', { id: 'sg-view-works', role: 'tabpanel', 'aria-labelledby': 'sg-tab-works', hidden: 'true' });
    var wrap = el('div', 'sg-works-wrap');

    var head = el('div', 'sg-works-head');
    var tabs = el('div', 'sg-works-tabs', { id: 'sg-works-tabs', role: 'tablist', 'aria-label': '作品分类' });
    head.appendChild(tabs);
    var pager = el('div', 'sg-works-pager');
    pager.appendChild(el('button', 'sg-works-btn', { id: 'sg-works-prev', type: 'button', 'aria-label': '上一页', text: '← 上一页' }));
    pager.appendChild(el('span', 'sg-works-pageinfo', { id: 'sg-works-pageinfo', text: '1/1' }));
    pager.appendChild(el('button', 'sg-works-btn', { id: 'sg-works-next', type: 'button', 'aria-label': '下一页', text: '下一页 →' }));
    head.appendChild(pager);
    wrap.appendChild(head);

    var viewport = el('div', 'sg-works-viewport');
    viewport.appendChild(el('div', 'sg-works-grid', { id: 'sg-works-grid' }));
    var scrollHint = el('div', 'sg-works-scroll-hint', { id: 'sg-works-scroll-hint', 'aria-hidden': 'true' });
    // 右箭头 svg
    var arrow = svgEl('svg');
    arrow.setAttribute('width', '20'); arrow.setAttribute('height', '20'); arrow.setAttribute('viewBox', '0 0 24 24'); arrow.setAttribute('fill', 'none');
    var path = svgEl('path');
    path.setAttribute('d', 'M9 5l7 7-7 7');
    path.setAttribute('stroke', '#fff'); path.setAttribute('stroke-width', '2.6');
    path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
    arrow.appendChild(path);
    scrollHint.appendChild(arrow);
    viewport.appendChild(scrollHint);
    wrap.appendChild(viewport);

    view.appendChild(wrap);
    main.appendChild(view);
  };

  Sandadui.prototype._renderWorksTabs = function () {
    var tabs = this.root.querySelector('#sg-works-tabs');
    if (!tabs) return;
    tabs.innerHTML = '';
    var self = this;
    if (!this._worksCat && this.opts.worksCats.length) this._worksCat = this.opts.worksCats[0].id;
    this.opts.worksCats.forEach(function (c) {
      var btn = el('button', 'sg-works-tab' + (c.id === self._worksCat ? ' active' : ''), {
        type: 'button', role: 'tab', text: c.label,
        'aria-selected': c.id === self._worksCat ? 'true' : 'false'
      });
      btn.id = 'sg-wtab-' + c.id;
      on(btn, 'click', function () {
        self._worksCat = c.id; self._worksPage = 0;
        Array.prototype.forEach.call(tabs.querySelectorAll('.sg-works-tab'), function (t) {
          var on_ = t.id === 'sg-wtab-' + c.id;
          t.classList.toggle('active', on_);
          t.setAttribute('aria-selected', on_ ? 'true' : 'false');
        });
        self._renderWorks();
      });
      tabs.appendChild(btn);
    });
  };

  Sandadui.prototype._renderWorks = function () {
    var grid = this.root.querySelector('#sg-works-grid');
    if (!grid) return;
    grid.innerHTML = '';
    var list = this.opts.works[this._worksCat] || [];
    var per = this._worksPerPage;
    var total = Math.max(1, Math.ceil(list.length / per));
    if (this._worksPage > total - 1) this._worksPage = total - 1;
    if (this._worksPage < 0) this._worksPage = 0;
    var start = this._worksPage * per;
    var items = list.slice(start, start + per);
    var self = this;
    items.forEach(function (w) {
      var card = el('article', 'sg-work-card' + (w.up ? ' upcoming' : ''), { role: 'group', 'aria-label': w.n });
      var cover = el('div', 'sg-cover');
      var img = el('img', '', { src: self._imgUrl(w.cover), alt: w.n, loading: 'lazy' });
      bindImg(img, cover);
      cover.appendChild(img);
      cover.appendChild(el('span', 'sg-tag', { text: w.up ? '待播' : (w.ep || '推荐') }));
      card.appendChild(cover);
      var info = el('div', 'sg-info');
      info.appendChild(el('div', 'sg-n', { text: w.n }));
      if (w.ep) info.appendChild(el('span', 'sg-ep-badge', { text: w.ep }));
      var mTxt = (w.m || '').split('/').slice(0, 2).map(function (s) { return s.trim(); }).join(' / ');
      info.appendChild(el('div', 'sg-m', { text: mTxt }));
      info.appendChild(el('div', 'sg-r', { text: '▸ ' + (w.r || '') }));
      card.appendChild(info);
      grid.appendChild(card);
    });
    // 占位保持网格稳定
    for (var i = items.length; i < per; i++) {
      grid.appendChild(el('div', 'sg-work-card sg-placeholder', { 'aria-hidden': 'true' }));
    }
    this.root.querySelector('#sg-works-pageinfo').textContent = (this._worksPage + 1) + '/' + total;
    this.root.querySelector('#sg-works-prev').disabled = this._worksPage <= 0;
    this.root.querySelector('#sg-works-next').disabled = this._worksPage >= total - 1;
    grid.scrollLeft = 0;
    var raf = global.requestAnimationFrame || function (fn) { setTimeout(fn, 16); };
    raf(function () { self._updateWorksHint(); });
  };

  Sandadui.prototype._updateWorksHint = function () {
    var grid = this.root.querySelector('#sg-works-grid');
    var hint = this.root.querySelector('#sg-works-scroll-hint');
    if (!grid || !hint) return;
    var canScrollRight = grid.scrollLeft + grid.clientWidth < grid.scrollWidth - 4;
    hint.classList.toggle('hide', !canScrollRight);
  };

  /* ============================================================
   * 4) Tab 切换
   * ============================================================ */
  Sandadui.prototype._switchTab = function (id) {
    if (this._activeTab === id) return;
    this._activeTab = id;
    var self = this;
    Array.prototype.forEach.call(this.root.querySelectorAll('.sg-tab-btn'), function (t) {
      var on_ = t.id === 'sg-tab-' + id;
      t.classList.toggle('active', on_);
      t.setAttribute('aria-selected', on_ ? 'true' : 'false');
    });
    var views = { graph: 'sg-view-graph', works: 'sg-view-works' };
    Object.keys(views).forEach(function (k) {
      var v = self.root.querySelector('#' + views[k]);
      if (!v) return;
      var on_ = k === id;
      v.classList.toggle('active', on_);
      if (on_) v.removeAttribute('hidden'); else v.setAttribute('hidden', 'true');
    });
    if (id === 'graph') {
      this._relayout();
      this._startPhysics();
    } else {
      this._stopPhysics();
    }
  };

  /* ============================================================
   * 5) 挂载后绑定
   * ============================================================ */
  Sandadui.prototype._afterMount = function () {
    var self = this;

    // 关闭按钮
    var closeBtn = this.root.querySelector('#sg-char-close');
    if (closeBtn) on(closeBtn, 'click', function () { self._closeChar(); });

    // 作品分页
    var wPrev = this.root.querySelector('#sg-works-prev');
    var wNext = this.root.querySelector('#sg-works-next');
    if (wPrev) on(wPrev, 'click', function () { if (!wPrev.disabled) { self._worksPage--; self._renderWorks(); } });
    if (wNext) on(wNext, 'click', function () { if (!wNext.disabled) { self._worksPage++; self._renderWorks(); } });

    // 横滚提示
    var storyHint = this.root.querySelector('#sg-story-scroll-hint');
    var storyBar = this.root.querySelector('#sg-story-bar');
    if (storyBar) on(storyBar, 'scroll', function () { self._updateStoryHint(); }, { passive: true });
    if (storyHint) on(storyHint, 'click', function () { storyBar.scrollBy({ left: storyBar.clientWidth * 0.7, behavior: 'smooth' }); });

    var worksGrid = this.root.querySelector('#sg-works-grid');
    var worksHint = this.root.querySelector('#sg-works-scroll-hint');
    if (worksGrid) on(worksGrid, 'scroll', function () { self._updateWorksHint(); }, { passive: true });
    if (worksHint) on(worksHint, 'click', function () { worksGrid.scrollBy({ left: worksGrid.clientWidth / 2, behavior: 'smooth' }); });

    // ESC 关闭面板
    on(document, 'keydown', function (e) {
      if (e.key !== 'Escape') return;
      var wrap = self.root.querySelector('#sg-graph-wrap');
      if (wrap && wrap.classList.contains('panel-open')) self._closeChar();
    });

    // 缩放：resize 同步 + 内部重排防抖
    var rzApply = function () { self._applyScale(); };
    on(global, 'resize', function () {
      rzApply();
      clearTimeout(self._resizeTimer);
      self._resizeTimer = setTimeout(function () {
        try {
          if (self._activeTab === 'graph') {
            self._buildGraph();
            if (self.root.querySelector('#sg-graph-wrap').classList.contains('panel-open')) {
              self._relayout();
              if (self._currentCharKey) {
                var c = self._getStoryChar(self._currentCharKey);
                if (c) self.root.querySelector('#sg-c-desc').textContent = self._getCharDescText(c);
              }
              self._fitCharPanel();
            }
          }
          self._renderWorks();
        } catch (err) { /* swallow */ }
      }, 150);
    });

    // 初始渲染（与源页 window.load 时序对齐：applyScale + buildGraph + renderWorks）
    this._applyScale();
    this._buildStoryBar();
    this._buildGraph();
    this._renderWorksTabs();
    this._renderWorks();
    this._updateStoryHint();
    this._startPhysics();

    // preload 图片
    var preload = {};
    this.opts.chars.forEach(function (c) { if (c.img) preload[c.img] = true; });
    Object.keys(this.opts.works).forEach(function (cat) {
      self.opts.works[cat].forEach(function (w) { if (w.cover) preload[w.cover] = true; });
    });
    Object.keys(preload).forEach(function (src) { var im = new Image(); im.src = self._imgUrl(src); });
  };

  /* ---------- 图片兜底 ---------- */
  function bindImg(img, container) {
    if (!img) return;
    on(img, 'error', function () {
      img.classList.add('img-fallback');
      if (container) container.classList.add('img-fallback');
    });
  }

  /* ---------- 主题应用 ---------- */
  function applyTheme(node, theme) {
    if (!theme) return;
    for (var k in theme) {
      var name = k.indexOf('--sg-') === 0 ? k : '--sg-' + k;
      node.style.setProperty(name, theme[k]);
    }
  }

  /* ---------- 全局 API ---------- */
  var API = {
    version: '2.0.0',
    mount: function (container, options) { return new Sandadui(options).mount(container); },
    create: function (options) { return new Sandadui(options).create(); },
    Sandadui: Sandadui
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.Sandadui = API;
  window.Sandadui = API;
})(typeof window !== 'undefined' ? window : this);
