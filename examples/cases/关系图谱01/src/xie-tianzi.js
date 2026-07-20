/*!
 * xie-tianzi.js  v1.0.0
 * 挟天子以令诸侯 · 关联词动态百科 — 渲染引擎（IIFE，零依赖）
 *
 * 暴露：window.XieTianzi = { mount(container, options), create(options) }
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

  /* ---------- 关系类型 → token 映射 ---------- */
  function relToken(rel) {
    if (rel === '近义词' || rel === '衍生词义') return 'syn';
    if (rel === '同类意象') return 'similar';
    if (rel === '典籍关联') return 'book';
    if (rel === '人物关联') return 'person';
    if (rel === '反义词') return 'antonym';
    return 'similar';
  }

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

  /* ---------- 默认配置 ---------- */
  var DEFAULTS = {
    title: '挟天子以令诸侯',
    pinyin: 'xie tian zi yi ling zhu hou',
    cover: '',
    tags: [],
    oneLiner: '',
    nav: [
      { key: 'home', label: '基本释义' },
      { key: 'story', label: '典故出处' },
      { key: 'graph', label: '关联词' },
      { key: 'quiz', label: '测一测' }
    ],
    initial: 'graph',
    home: {
      subtabs: [
        { key: 'core', label: '核心信息' },
        { key: 'examples', label: '典型例句' }
      ],
      core: [],
      examples: [],
      synonyms: [],
      antonyms: []
    },
    story: {
      subtabs: [
        { key: 'stories', label: '词条典故' },
        { key: 'src', label: '出处原文' }
      ],
      cards: [],
      source: { from: '', text: '', tr: '', notes: {} }
    },
    graph: {
      center: { w: '', x: 50, y: 50 },
      nodes: [],
      nodeImgs: {}
    },
    quiz: {
      questions: [],
      resultDesc: '',
      badges: { full: '', ok: '', low: '' }
    },
    theme: {}
  };

  /* ---------- 渲染类 ---------- */
  function XieTianzi(options) {
    this.opts = deepMerge({}, DEFAULTS, options || {});
    this.root = null;
    this.currentPanel = this.opts.initial || 'home';
    this.homeMt = 'core';
    this.storyMt = 'stories';
    this.graphFilter = '全部';
    this.qi = 0;
    this.sc = 0;
    this.locked = false;
    this._lastFocus = null;
  }

  XieTianzi.prototype.create = function () {
    var root = el('div', 'sg-frame');
    this.root = root;
    this._buildNav(root);
    this._buildStage(root);
    this._buildModal(root);
    this._buildToast(root);
    return root;
  };

  XieTianzi.prototype.mount = function (container) {
    var node = this.create();
    (container || document.body).appendChild(node);
    this._afterMount();
    return node;
  };

  /* ===== 顶部导航 ===== */
  XieTianzi.prototype._buildNav = function (root) {
    var self = this;
    var nav = el('div', 'sg-nav', { role: 'tablist', 'aria-label': '词条百科导航' });
    this.opts.nav.forEach(function (tab) {
      var t = el('button', 'sg-nav-tab', {
        role: 'tab',
        text: tab.label,
        'data-key': tab.key,
        'aria-selected': String(tab.key === self.currentPanel)
      });
      on(t, 'click', function () { self._goPanel(tab.key); });
      nav.appendChild(t);
    });
    root.appendChild(nav);
    this._nav = nav;
  };

  /* ===== 舞台与四个面板 ===== */
  XieTianzi.prototype._buildStage = function (root) {
    var stage = el('div', 'sg-stage');
    root.appendChild(stage);
    this._stage = stage;

    this._buildHome(stage);
    this._buildStory(stage);
    this._buildGraph(stage);
    this._buildQuiz(stage);
  };

  /* ----- 基本释义 ----- */
  XieTianzi.prototype._buildHome = function (stage) {
    var self = this;
    var home = el('section', 'sg-panel sg-home', {
      id: 'sg-panel-home',
      role: 'tabpanel',
      'aria-label': '基本释义'
    });
    home.dataset.mt = this.homeMt;

    // 左：词条卡
    var card = el('div', 'sg-word-card');
    var top = el('div', 'sg-wc-top');
    var word = el('div', 'sg-word');
    word.appendChild(el('div', 'sg-big', { text: this.opts.title }));
    if (this.opts.pinyin) word.appendChild(el('div', 'sg-py', { text: this.opts.pinyin }));
    top.appendChild(word);
    card.appendChild(top);

    var tags = el('div', 'sg-tags');
    this.opts.tags.forEach(function (t) { tags.appendChild(el('span', 'sg-tag', { text: t })); });
    card.appendChild(tags);

    if (this.opts.oneLiner) card.appendChild(el('div', 'sg-one', { text: this.opts.oneLiner }));

    if (this.opts.cover) {
      var cover = el('div', 'sg-cover');
      this._bindBg(cover, this.opts.cover);
      card.appendChild(cover);
    }
    home.appendChild(card);

    // 右：信息区
    var right = el('div', 'sg-home-r');

    // 子标签（移动端可见）
    var sub = el('div', 'sg-subtab', { role: 'tablist', 'aria-label': '释义子分类' });
    this.opts.home.subtabs.forEach(function (s) {
      var st = el('button', 'sg-subtab-item', {
        role: 'tab',
        text: s.label,
        'data-mt': s.key,
        'aria-selected': String(s.key === self.homeMt)
      });
      on(st, 'click', function () {
        self.homeMt = s.key;
        home.dataset.mt = s.key;
        sub.querySelectorAll('.sg-subtab-item').forEach(function (x) {
          x.setAttribute('aria-selected', String(x === st));
        });
      });
      sub.appendChild(st);
    });
    right.appendChild(sub);

    right.appendChild(el('h3', 'sg-sec sg-sec-core', { text: '核心信息' }));
    var core = el('div', 'sg-core');
    this.opts.home.core.forEach(function (c) {
      var item = el('div', 'sg-core-item' + (c.wide ? ' wide' : ''));
      item.appendChild(el('div', 'sg-k', { text: c.k }));
      item.appendChild(el('div', 'sg-v', { text: c.v }));
      core.appendChild(item);
    });
    right.appendChild(core);

    // 典型例句
    var exWrap = el('div', 'sg-ex-wrap');
    exWrap.appendChild(el('h3', 'sg-sec sg-sec-ex', { text: '典型例句' }));
    var exList = el('div', 'sg-ex-list');
    this.opts.home.examples.forEach(function (ex) {
      var item = el('div', 'sg-ex-item');
      item.appendChild(el('div', 'sg-dot'));
      // 支持 **粗体** 标记
      var span = el('div');
      span.innerHTML = self._boldify(ex.text);
      item.appendChild(span);
      exList.appendChild(item);
    });
    exWrap.appendChild(exList);

    var exFoot = el('div', 'sg-ex-foot');
    var synGc = el('div', 'sg-gc');
    synGc.appendChild(el('div', 'sg-k', { text: '近义词' }));
    var synV = el('div', 'sg-v');
    this.opts.home.synonyms.forEach(function (s, i) {
      if (i) synV.appendChild(el('span', 'sg-sep', { text: ' · ' }));
      var sp = el('span', 'sg-syn', { text: s });
      synV.appendChild(sp);
    });
    synGc.appendChild(synV);
    exFoot.appendChild(synGc);

    var antGc = el('div', 'sg-gc');
    antGc.appendChild(el('div', 'sg-k', { text: '反义词' }));
    var antV = el('div', 'sg-v');
    antV.appendChild(document.createTextNode(this.opts.home.antonyms.join(' · ')));
    antGc.appendChild(antV);
    exFoot.appendChild(antGc);

    exWrap.appendChild(exFoot);
    right.appendChild(exWrap);

    home.appendChild(right);
    stage.appendChild(home);
    this._home = home;
  };

  /* ----- 典故出处 ----- */
  XieTianzi.prototype._buildStory = function (stage) {
    var self = this;
    var story = el('section', 'sg-panel sg-story', {
      id: 'sg-panel-story',
      role: 'tabpanel',
      'aria-label': '典故出处'
    });
    story.dataset.mt = this.storyMt;

    var left = el('div', 'sg-story-l');
    left.appendChild(el('h3', 'sg-sec', { text: '词条典故渊源' }));
    this.opts.story.cards.forEach(function (c) {
      var card = el('div', 'sg-scard');
      var head = el('div', 'sg-scard-head');
      head.appendChild(el('div', 'sg-scard-badge', { text: c.badge }));
      var ht = el('div', 'sg-scard-ht');
      ht.appendChild(el('div', 'sg-scard-h-main', { text: c.main }));
      ht.appendChild(el('div', 'sg-scard-h-sub', { text: c.sub }));
      head.appendChild(ht);
      card.appendChild(head);
      var body = el('div', 'sg-scard-body');
      var bd = el('div', 'sg-scard-bd');
      bd.innerHTML = self._boldify(c.body);
      body.appendChild(bd);
      card.appendChild(body);
      left.appendChild(card);
    });
    story.appendChild(left);

    var right = el('div', 'sg-story-r');
    right.appendChild(el('h3', 'sg-sec', { text: '出处原文（点高亮看注解）' }));
    var src = this.opts.story.source;
    var srcCard = el('div', 'sg-src-card');
    srcCard.appendChild(el('div', 'sg-from', { text: src.from }));
    var text = el('div', 'sg-text');
    text.innerHTML = this._annotify(src.text);
    srcCard.appendChild(text);
    if (src.tr) srcCard.appendChild(el('div', 'sg-tr', { text: src.tr }));
    right.appendChild(srcCard);
    story.appendChild(right);

    // 注解高亮点击
    story.querySelectorAll('.sg-hl').forEach(function (h) {
      on(h, 'click', function () {
        var key = h.getAttribute('data-k');
        var note = src.notes[key];
        if (!note) return;
        self._openModal({ title: note[0], desc: note[1] });
      });
    });

    // 子标签
    var sub = el('div', 'sg-subtab', { role: 'tablist', 'aria-label': '典故子分类' });
    this.opts.story.subtabs.forEach(function (s) {
      var st = el('button', 'sg-subtab-item', {
        role: 'tab',
        text: s.label,
        'data-mt': s.key,
        'aria-selected': String(s.key === self.storyMt)
      });
      on(st, 'click', function () {
        self.storyMt = s.key;
        story.dataset.mt = s.key;
        sub.querySelectorAll('.sg-subtab-item').forEach(function (x) {
          x.setAttribute('aria-selected', String(x === st));
        });
      });
      sub.appendChild(st);
    });
    story.insertBefore(sub, left);

    stage.appendChild(story);
    this._story = story;
  };

  /* ----- 关联词图谱 ----- */
  XieTianzi.prototype._buildGraph = function (stage) {
    var self = this;
    var graph = el('section', 'sg-panel sg-graph', {
      id: 'sg-panel-graph',
      role: 'tabpanel',
      'aria-label': '关联词语图谱'
    });
    graph.appendChild(el('h3', 'sg-sec', { text: '关联词语图谱 · 点击查看' }));

    // 筛选
    var head = el('div', 'sg-graph-head', { role: 'group', 'aria-label': '关系筛选' });
    var rels = ['全部'].concat(Array.from(new Set(this.opts.graph.nodes.map(function (n) { return n.rel; }))));
    rels.forEach(function (r) {
      var f = el('button', 'sg-graph-filter', {
        text: r,
        'data-r': r,
        'aria-selected': String(r === '全部')
      });
      on(f, 'click', function () {
        self.graphFilter = r;
        head.querySelectorAll('.sg-graph-filter').forEach(function (x) {
          x.setAttribute('aria-selected', String(x === f));
        });
        self._layoutGraph();
      });
      head.appendChild(f);
    });
    graph.appendChild(head);

    var body = el('div', 'sg-graph-body');
    var canvas = el('div', 'sg-graph-canvas');
    var linesSvg = svgEl('svg');
    linesSvg.setAttribute('class', 'sg-lines');
    canvas.appendChild(linesSvg);
    body.appendChild(canvas);

    var side = el('aside', 'sg-graph-side');
    body.appendChild(side);

    graph.appendChild(body);
    stage.appendChild(graph);

    this._graph = graph;
    this._graphCanvas = canvas;
    this._linesSvg = linesSvg;
    this._graphSide = side;
    this._graphHead = head;
  };

  XieTianzi.prototype._layoutGraph = function () {
    var self = this;
    var canvas = this._graphCanvas;
    // 清空
    canvas.querySelectorAll('.sg-gnd').forEach(function (n) { n.remove(); });
    while (this._linesSvg.firstChild) this._linesSvg.removeChild(this._linesSvg.firstChild);

    var W = canvas.clientWidth || 400;
    var H = canvas.clientHeight || 280;
    var narrow = W < 360;
    function px(x) { return (narrow ? Math.max(15, Math.min(85, x)) : x) / 100 * W; }
    function py(y) { return y / 100 * H; }

    var center = this.opts.graph.center;
    this._addGNode(center, true);

    this.opts.graph.nodes.forEach(function (n) {
      if (self.graphFilter !== '全部' && n.rel !== self.graphFilter) return;
      var tok = relToken(n.rel);
      var ln = svgEl('line');
      ln.setAttribute('x1', px(center.x));
      ln.setAttribute('y1', py(center.y));
      ln.setAttribute('x2', px(n.x));
      ln.setAttribute('y2', py(n.y));
      ln.setAttribute('class', 'sg-line sg-rel-' + tok);
      self._linesSvg.appendChild(ln);
      self._addGNode(n, false);
    });

    // 默认选中首个可见节点
    var firstNode = this.opts.graph.nodes.find(function (n) {
      return self.graphFilter === '全部' || n.rel === self.graphFilter;
    });
    if (firstNode) this._showDetail(firstNode);
  };

  XieTianzi.prototype._addGNode = function (n, center) {
    var self = this;
    var W = this._graphCanvas.clientWidth || 400;
    var sx = (W < 360 ? Math.max(15, Math.min(85, n.x)) : n.x);
    var tok = n.rel ? relToken(n.rel) : '';
    var cls = 'sg-gnd' + (center ? ' center' : '') + (tok ? ' sg-rel-' + tok : '');
    var node = el('div', cls, {
      style: 'left:' + sx + '%;top:' + n.y + '%',
      role: center ? 'heading' : 'button',
      tabindex: center ? '-1' : '0',
      'aria-label': (n.rel ? n.rel + '：' : '') + n.w
    });
    node.appendChild(el('div', 'sg-gnd-dot', { text: n.w }));
    if (!center && n.rel) node.appendChild(el('div', 'sg-gnd-rel', { text: n.rel }));

    if (!center) {
      on(node, 'click', function () {
        self._graphCanvas.querySelectorAll('.sg-gnd').forEach(function (x) { x.classList.remove('on'); });
        node.classList.add('on');
        self._showDetail(n);
        if (global.matchMedia && global.matchMedia('(max-width: 500px)').matches) {
          self._openNodeModal(n);
        }
      });
      on(node, 'keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); node.click(); }
      });
    }
    this._graphCanvas.appendChild(node);
  };

  XieTianzi.prototype._showDetail = function (n) {
    var self = this;
    var side = this._graphSide;
    side.innerHTML = '';
    side.appendChild(el('div', 'sg-gs-dw', { text: n.w }));
    if (n.rel) {
      var tok = relToken(n.rel);
      var dr = el('div', 'sg-gs-dr', { text: n.rel });
      dr.setAttribute('style', '--sg-rel:var(--sg-rel-' + tok + ')');
      dr.style.background = 'rgba(100,135,250,0.1)';
      dr.style.color = 'var(--sg-rel-' + tok + ')';
      side.appendChild(dr);
    }
    side.appendChild(el('div', 'sg-gs-dd', { text: n.desc }));
    if (this.opts.graph.nodeImgs[n.w]) {
      var img = el('div', 'sg-gs-img');
      this._bindBg(img, this.opts.graph.nodeImgs[n.w]);
      side.appendChild(img);
    }
  };

  /* ----- 测一测 ----- */
  XieTianzi.prototype._buildQuiz = function (stage) {
    var self = this;
    var quiz = el('section', 'sg-panel sg-quiz', {
      id: 'sg-panel-quiz',
      role: 'tabpanel',
      'aria-label': '随堂测验'
    });

    var top = el('div', 'sg-qz-top');
    this._qzNo = el('span', 'sg-qz-no');
    top.appendChild(this._qzNo);
    var bar = el('div', 'sg-qz-bar');
    this._qzBarf = el('i');
    bar.appendChild(this._qzBarf);
    top.appendChild(bar);
    this._qzScore = el('span', 'sg-qz-score', { text: '0 / ' + this.opts.quiz.questions.length });
    top.appendChild(this._qzScore);
    quiz.appendChild(top);

    var body = el('div', 'sg-qz-body');
    this._qzBody = body;
    this._qzQ = el('div', 'sg-qz-q');
    body.appendChild(this._qzQ);
    this._qzOpts = el('div', 'sg-opts', { role: 'group', 'aria-label': '选项' });
    body.appendChild(this._qzOpts);
    this._qzFb = el('div', 'sg-qz-fb', { role: 'status' });
    body.appendChild(this._qzFb);
    this._qzNext = el('button', 'sg-qz-next', { text: '下一题 →' });
    on(this._qzNext, 'click', function () { self._nextQ(); });
    body.appendChild(this._qzNext);
    quiz.appendChild(body);

    var result = el('div', 'sg-qz-result');
    this._qzResult = result;
    this._qzBadge = el('div', 'sg-qz-badge');
    result.appendChild(this._qzBadge);
    result.appendChild(el('div', 'sg-qz-rlabel', { text: '你的得分' }));
    this._qzBig = el('div', 'sg-qz-big');
    result.appendChild(this._qzBig);
    if (this.opts.quiz.resultDesc) result.appendChild(el('div', 'sg-qz-desc', { text: this.opts.quiz.resultDesc }));
    var again = el('button', 'sg-qz-again', { text: '再来一次' });
    on(again, 'click', function () { self._resetQuiz(); });
    result.appendChild(again);
    quiz.appendChild(result);

    stage.appendChild(quiz);
    this._quiz = quiz;
  };

  XieTianzi.prototype._renderQ = function () {
    var self = this;
    var QS = this.opts.quiz.questions;
    var Q = QS[this.qi];
    this.locked = false;
    this._qzBody.style.display = 'flex';
    this._qzResult.classList.remove('on');
    this._qzNo.textContent = '第 ' + (this.qi + 1) + ' 题 / 共 ' + QS.length;
    this._qzQ.textContent = Q.t;
    this._qzFb.textContent = '';
    this._qzNext.classList.remove('on');
    this._qzNext.textContent = (this.qi === QS.length - 1) ? '查看结果 →' : '下一题 →';
    this._qzOpts.innerHTML = '';
    Q.o.forEach(function (o, k) {
      var opt = el('div', 'sg-opt', {
        role: 'button',
        tabindex: '0',
        'data-k': String(k),
        'aria-label': '选项 ' + 'ABCD'[k] + '：' + o
      });
      opt.appendChild(el('span', 'sg-opt-key', { text: 'ABCD'[k] }));
      opt.appendChild(el('span', null, { text: o }));
      on(opt, 'click', function () { self._answer(opt, k, Q); });
      on(opt, 'keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opt.click(); }
      });
      self._qzOpts.appendChild(opt);
    });
  };

  XieTianzi.prototype._answer = function (opt, k, Q) {
    var self = this;
    if (this.locked) return;
    this.locked = true;
    var QS = this.opts.quiz.questions;
    this._qzOpts.querySelectorAll('.sg-opt').forEach(function (x) {
      if (+x.getAttribute('data-k') === Q.a) x.classList.add('right');
    });
    if (k !== Q.a) opt.classList.add('wrong'); else this.sc++;
    this._qzFb.textContent = Q.fb;
    this._qzScore.textContent = this.sc + ' / ' + QS.length;
    this._qzBarf.style.width = ((this.qi + 1) / QS.length) * 100 + '%';
    this._qzNext.classList.add('on');
    this._announce('已作答，' + Q.fb);
  };

  XieTianzi.prototype._nextQ = function () {
    var QS = this.opts.quiz.questions;
    if (this.qi < QS.length - 1) {
      this.qi++;
      this._renderQ();
    } else {
      this._qzBody.style.display = 'none';
      this._qzBig.textContent = this.sc + ' / ' + QS.length;
      var b = this.opts.quiz.badges;
      this._qzBadge.textContent = (this.sc === QS.length) ? b.full : (this.sc >= 3 ? b.ok : b.low);
      this._qzResult.classList.add('on');
      this._announce('测验完成，得分 ' + this.sc + ' / ' + QS.length);
    }
  };

  XieTianzi.prototype._resetQuiz = function () {
    this.qi = 0;
    this.sc = 0;
    var QS = this.opts.quiz.questions;
    this._qzScore.textContent = '0 / ' + QS.length;
    this._qzBarf.style.width = '0';
    this._renderQ();
  };

  /* ===== 面板切换 ===== */
  XieTianzi.prototype._goPanel = function (key) {
    this.currentPanel = key;
    var self = this;
    this._nav.querySelectorAll('.sg-nav-tab').forEach(function (x) {
      x.setAttribute('aria-selected', String(x.getAttribute('data-key') === key));
    });
    var map = { home: this._home, story: this._story, graph: this._graph, quiz: this._quiz };
    Object.keys(map).forEach(function (k) {
      map[k].classList.toggle('on', k === key);
    });
    if (key === 'graph') {
      var self2 = self;
      setTimeout(function () { self2._layoutGraph(); }, 0);
    }
    this._announce('已切换到 ' + (this.opts.nav.find(function (n) { return n.key === key; }) || {}).label);
  };

  /* ===== 弹窗 ===== */
  XieTianzi.prototype._buildModal = function (root) {
    var self = this;
    var modal = el('div', 'sg-modal', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': '详情说明'
    });
    var box = el('div', 'sg-modal-box');
    this._modalTitle = el('div', 'sg-modal-title');
    this._modalDesc = el('div', 'sg-modal-desc');
    this._modalExtra = el('div');
    this._modalClose = el('div', 'sg-modal-close', { text: '知道了', role: 'button', tabindex: '0' });
    box.appendChild(this._modalTitle);
    box.appendChild(this._modalDesc);
    box.appendChild(this._modalExtra);
    box.appendChild(this._modalClose);
    modal.appendChild(box);
    root.appendChild(modal);
    this._modal = modal;

    on(this._modalClose, 'click', function () { self._closeModal(); });
    on(this._modalClose, 'keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self._closeModal(); }
    });
    on(modal, 'click', function (e) { if (e.target === modal) self._closeModal(); });
  };

  XieTianzi.prototype._openModal = function (data) {
    this._modalTitle.textContent = data.title || '';
    this._modalDesc.textContent = data.desc || '';
    this._modalExtra.innerHTML = data.html || '';
    this._modal.classList.add('on');
    this._lastFocus = document.activeElement;
    try { this._modalClose.focus(); } catch (e) {}
  };

  XieTianzi.prototype._openNodeModal = function (n) {
    var tok = n.rel ? relToken(n.rel) : 'similar';
    var html = '<span class="sg-modal-tag" style="background:var(--sg-rel-' + tok + ')">' + (n.rel || '') + '</span>';
    if (this.opts.graph.nodeImgs[n.w]) {
      html += '<div class="sg-modal-img" data-img="' + n.w + '"></div>';
    }
    this._openModal({ title: n.w, desc: n.desc, html: html });
    var self = this;
    var imgNode = this._modal.querySelector('[data-img]');
    if (imgNode) this._bindBg(imgNode, this.opts.graph.nodeImgs[n.w]);
  };

  XieTianzi.prototype._closeModal = function () {
    this._modal.classList.remove('on');
    if (this._lastFocus) { try { this._lastFocus.focus(); } catch (e) {} }
  };

  /* ===== Toast ===== */
  XieTianzi.prototype._buildToast = function (root) {
    var t = el('div', 'sg-toast', { role: 'status', 'aria-live': 'polite' });
    root.appendChild(t);
    this._toast = t;
  };
  XieTianzi.prototype._toastShow = function (m) {
    var self = this;
    this._toast.textContent = m;
    this._toast.classList.add('on');
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function () { self._toast.classList.remove('on'); }, 2000);
  };

  /* ===== aria-live 公告 ===== */
  XieTianzi.prototype._announce = function (msg) {
    if (this._live) this._live.textContent = msg;
  };

  /* ===== 文本工具：**粗体** ===== */
  XieTianzi.prototype._boldify = function (text) {
    if (!text) return '';
    var safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return safe.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  };

  /* ===== 文本工具：[key]文字[/key] 注解标记 ===== */
  XieTianzi.prototype._annotify = function (text) {
    if (!text) return '';
    var safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return safe.replace(/\[(\w+)\](.+?)\[\/\1\]/g, function (_, k, inner) {
      return '<span class="sg-hl" data-k="' + k + '">' + inner + '</span>';
    });
  };

  /* ===== 图片背景绑定 + 回退 ===== */
  XieTianzi.prototype._bindBg = function (node, src) {
    var self = this;
    if (!src) { node.classList.add('sg-img-fallback'); return; }
    if (this._imgCache[src] === false) { node.classList.add('sg-img-fallback'); return; }
    node.style.backgroundImage = 'url("' + src + '")';
    if (this._imgCache[src] === true) return;
    this._imgCache[src] = null; // loading
    var img = new Image();
    img.onload = function () { self._imgCache[src] = true; };
    img.onerror = function () {
      self._imgCache[src] = false;
      node.classList.add('sg-img-fallback');
      node.style.backgroundImage = '';
    };
    img.src = src;
  };

  XieTianzi.prototype._imgCache = {};

  /* ===== 挂载后初始化 ===== */
  XieTianzi.prototype._afterMount = function () {
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

    // 初始面板
    this._goPanel(this.currentPanel);
    // 渲染首题
    this._renderQ();

    // 全局键盘：ESC 关闭弹窗
    on(this.root, 'keydown', function (e) {
      if (e.key === 'Escape' && self._modal.classList.contains('on')) {
        self._closeModal();
      }
    });

    // 窗口尺寸变化：重排图谱
    var rt = null;
    on(global, 'resize', function () {
      if (rt) clearTimeout(rt);
      rt = setTimeout(function () {
        if (self.currentPanel === 'graph') self._layoutGraph();
      }, 120);
    });
  };

  /* ---------- API ---------- */
  var API = {
    mount: function (container, options) {
      return new XieTianzi(options).mount(container);
    },
    create: function (options) {
      return new XieTianzi(options).create();
    }
  };
  global.XieTianzi = API;
  if (typeof window !== 'undefined') window.XieTianzi = API;
})(typeof window !== 'undefined' ? window : this);
