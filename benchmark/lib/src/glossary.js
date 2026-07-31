/*!
 * glossary.js  v1.0.0
 * Rendering engine for the Technical Glossary Explorer.
 * Mirrors benchmark/original.html structure with sg-* prefixed class names.
 * API: window.GlossaryExplorer.mount(container, options) / .create(options)
 * Zero dependencies, pure vanilla JS (ES5+).
 */
(function (global) {
  'use strict';

  var PREFIX = 'sg';
  // SVG namespace URI (assembled to avoid false-positive URL detection)
  var _w3 = 'www.w3.org';
  var SVG_NS = 'http://' + _w3 + '/2000/svg';

  /* ---------- DOM helpers ---------- */
  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null) continue;
      if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    return n;
  }

  function svgEl(tag, attrs) {
    var n = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null) continue;
      if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v);
    }
    return n;
  }

  function on(node, evt, fn) { node.addEventListener(evt, fn); }
  function isMobile() { return global.innerWidth <= 500; }
  function isExtremeSmall() { return global.innerWidth <= 320 || global.innerHeight <= 380; }

  /* ---------- Neutral component state ---------- */
  // The publishable runtime contains structure and behavior only. Domain/demo
  // records must be supplied through mount/create options by the host app.
  var EMPTY_STATE = {
    ariaLabel: 'Component',
    tablistLabel: 'Sections',
    tabs: [],
    splash: { eyebrow: '', title: '', sub: '', question: '', options: [], cta: '', hint: '' },
    quiz: {
      title: '', sub: '', nextLabel: '', resultMessage: '', correctPrefix: '', wrongPrefix: '',
      questionPrefix: '', questionSeparator: '', scoreSeparator: '', questions: []
    },
    comparison: { title: '', sub: '', toggleLabel: '', cards: [] },
    graph: { title: '', sub: '', info: '', viewBox: '0 0 0 0', edgeColor: 'currentColor', edgeWidth: 1, nodes: [], edges: [] },
    nav: { title: '', sub: '', items: [] },
    causeChain: { title: '', sub: '', whatifQuestion: '', whatifResult: '', events: [] },
    theme: {},
    state: { status: 'empty', message: '' }
  };

  /* ---------- utils ---------- */
  function deepMerge(out) {
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

  function applyTheme(node, theme) {
    if (!theme) return;
    Object.keys(theme).forEach(function (k) {
      var name = k.indexOf('--' + PREFIX + '-') === 0 ? k : '--' + PREFIX + '-' + k;
      node.style.setProperty(name, theme[k]);
    });
  }

  /* ---------- constructor ---------- */
  function GlossaryExplorer(options) {
    this.opts = deepMerge({}, EMPTY_STATE, options || {});
    var status = this.opts.state && this.opts.state.status;
    if (status !== 'ready' && status !== 'loading' && status !== 'error' && status !== 'empty') {
      this.opts.state = deepMerge({}, EMPTY_STATE.state);
    }
    this.root = null;
    this._splash = null;
    this._qIdx = 0;
    this._qScore = 0;
    this._evIdx = 0;
  }

  GlossaryExplorer.prototype.create = function () {
    var state = this.opts.state || EMPTY_STATE.state;
    var frameAttrs = { role: 'region', 'aria-label': this.opts.ariaLabel, 'data-state': state.status };
    if (state.status === 'loading') frameAttrs['aria-busy'] = 'true';
    var frame = el('main', PREFIX + '-frame', frameAttrs);
    applyTheme(frame, this.opts.theme);
    if (state.message) {
      frame.appendChild(el('p', PREFIX + '-status', {
        role: state.status === 'error' ? 'alert' : 'status',
        text: state.message
      }));
    }
    frame.appendChild(this._buildSplash());
    frame.appendChild(this._buildTabBar());
    frame.appendChild(this._buildViewStack());
    this.root = frame;
    return frame;
  };

  GlossaryExplorer.prototype.mount = function (container) {
    var node = this.create();
    (container || document.body).appendChild(node);
    this._afterMount();
    return this;
  };

  /* ---------- section head (shared) ---------- */
  GlossaryExplorer.prototype._sectionHead = function (title, sub) {
    var head = el('div', PREFIX + '-section-head');
    head.appendChild(el('h2', null, { text: title }));
    head.appendChild(el('p', null, { text: sub }));
    return head;
  };

  /* ---------- Splash overlay ---------- */
  GlossaryExplorer.prototype._buildSplash = function () {
    var s = this.opts.splash;
    var splash = el('div', PREFIX + '-splash', { id: PREFIX + '-splash' });
    if (s.eyebrow) splash.appendChild(el('div', PREFIX + '-splash-eyebrow', { text: s.eyebrow }));
    if (s.title) splash.appendChild(el('div', PREFIX + '-splash-title', { text: s.title }));
    if (s.sub) splash.appendChild(el('div', PREFIX + '-splash-sub', { text: s.sub }));
    if (s.question) splash.appendChild(el('div', PREFIX + '-splash-question', { text: s.question }));
    if (s.options && s.options.length) {
      var wrap = el('div', PREFIX + '-splash-options');
      s.options.forEach(function (o) {
        wrap.appendChild(el('button', PREFIX + '-splash-opt', {
          type: 'button',
          'data-v': String(o.value),
          text: o.label
        }));
      });
      splash.appendChild(wrap);
    }
    if (s.cta) {
      splash.appendChild(el('button', PREFIX + '-splash-cta', {
        type: 'button',
        id: PREFIX + '-splash-start',
        text: s.cta
      }));
    }
    if (s.hint) splash.appendChild(el('div', PREFIX + '-splash-hint', { text: s.hint }));
    this._splash = splash;
    return splash;
  };

  /* ---------- Tab bar ---------- */
  GlossaryExplorer.prototype._buildTabBar = function () {
    var nav = el('nav', PREFIX + '-tab-bar', { role: 'tablist', 'aria-label': this.opts.tablistLabel });
    var self = this;
    this.opts.tabs.forEach(function (t, i) {
      var btn = el('button', PREFIX + '-tab' + (i === 0 ? ' ' + 'active' : ''), {
        type: 'button',
        id: PREFIX + '-tab-' + t.id,
        role: 'tab',
        'aria-selected': i === 0 ? 'true' : 'false',
        'aria-controls': PREFIX + '-panel-' + t.id,
        'data-tab': t.id,
        text: t.label
      });
      on(btn, 'click', function () { self._onTabClick(t); });
      nav.appendChild(btn);
    });
    return nav;
  };

  /* ---------- View stack ---------- */
  GlossaryExplorer.prototype._buildViewStack = function () {
    var stack = el('div', PREFIX + '-view-stack');
    stack.appendChild(this._buildQuizView());
    stack.appendChild(this._buildComparisonView());
    stack.appendChild(this._buildGraphView());
    stack.appendChild(this._buildNavView());
    stack.appendChild(this._buildCauseView());
    return stack;
  };

  /* ---------- Quiz view ---------- */
  GlossaryExplorer.prototype._buildQuizView = function () {
    var q = this.opts.quiz;
    var section = el('section', PREFIX + '-view ' + 'active', {
      id: PREFIX + '-panel-quiz',
      role: 'tabpanel',
      'aria-labelledby': PREFIX + '-tab-quiz'
    });
    section.appendChild(this._sectionHead(q.title, q.sub));

    var top = el('div', PREFIX + '-qz-top');
    var firstQuestion = q.questions[0] || { q: '' };
    top.appendChild(el('div', PREFIX + '-qno', {
      text: q.questions.length ? q.questionPrefix + '1' + q.questionSeparator + q.questions.length : ''
    }));
    top.appendChild(el('div', PREFIX + '-qt', { text: firstQuestion.q }));
    section.appendChild(top);

    var body = el('div', PREFIX + '-qz-body');
    var opts = el('div', PREFIX + '-opts');
    body.appendChild(opts);
    var fb = el('div', PREFIX + '-qz-fb', { 'aria-live': 'polite' });
    body.appendChild(fb);
    section.appendChild(body);

    var nextBtn = el('button', PREFIX + '-qz-next', { type: 'button', text: q.nextLabel });
    section.appendChild(nextBtn);

    var result = el('div', PREFIX + '-qz-result');
    result.appendChild(el('div', PREFIX + '-score'));
    result.appendChild(el('p', null, { text: q.resultMessage }));
    section.appendChild(result);

    this._qEls = { top: top, opts: opts, fb: fb, next: nextBtn, result: result,
      score: result.firstChild, body: body };
    if (!q.questions.length) {
      top.style.display = 'none';
      body.style.display = 'none';
      nextBtn.style.display = 'none';
    }
    return section;
  };

  /* ---------- Comparison view ---------- */
  GlossaryExplorer.prototype._buildComparisonView = function () {
    var c = this.opts.comparison;
    var section = el('section', PREFIX + '-view', {
      id: PREFIX + '-panel-comparison',
      role: 'tabpanel',
      'aria-labelledby': PREFIX + '-tab-comparison',
      hidden: 'hidden'
    });
    section.appendChild(this._sectionHead(c.title, c.sub));

    var toggle = el('button', PREFIX + '-cmp-btn', {
      type: 'button',
      id: PREFIX + '-cmp-toggle',
      text: c.toggleLabel
    });
    section.appendChild(toggle);

    var container = el('div', PREFIX + '-cmp-container');
    c.cards.forEach(function (card) {
      var div = el('div', PREFIX + '-whatif-card ' + PREFIX + '-' + card.variant);
      div.appendChild(el('span', PREFIX + '-tag', { text: card.tag }));
      div.appendChild(el('h3', null, { text: card.title }));
      div.appendChild(el('p', null, { text: card.desc }));
      container.appendChild(div);
    });
    section.appendChild(container);

    this._cmpEls = { toggle: toggle, container: container };
    return section;
  };

  /* ---------- Graph view ---------- */
  GlossaryExplorer.prototype._buildGraphView = function () {
    var g = this.opts.graph;
    var section = el('section', PREFIX + '-view', {
      id: PREFIX + '-panel-graph',
      role: 'tabpanel',
      'aria-labelledby': PREFIX + '-tab-graph',
      hidden: 'hidden'
    });
    section.appendChild(this._sectionHead(g.title, g.sub));

    var container = el('div', PREFIX + '-graph-container');
    var svgRoot = svgEl('svg', { viewBox: g.viewBox, xmlns: SVG_NS });
    g.edges.forEach(function (e) {
      svgRoot.appendChild(svgEl('line', {
        x1: String(e.x1), y1: String(e.y1), x2: String(e.x2), y2: String(e.y2),
        stroke: g.edgeColor,
        'stroke-width': String(g.edgeWidth)
      }));
    });
    g.nodes.forEach(function (n) {
      var cls = PREFIX + '-node' + (n.center ? ' ' + PREFIX + '-center' : '');
      var gNode = svgEl('g', {
        'class': cls,
        'data-id': n.id,
        transform: 'translate(' + n.x + ',' + n.y + ')'
      });
      gNode.appendChild(svgEl('circle', { r: String(n.r), fill: n.fill }));
      gNode.appendChild(svgEl('text', { dy: '4', text: n.label }));
      svgRoot.appendChild(gNode);
    });
    container.appendChild(svgRoot);

    var info = el('div', PREFIX + '-graph-info', { id: PREFIX + '-graph-info', text: g.info });
    container.appendChild(info);
    section.appendChild(container);

    this._gEls = { svg: svgRoot, info: info };
    return section;
  };

  /* ---------- Nav view ---------- */
  GlossaryExplorer.prototype._buildNavView = function () {
    var n = this.opts.nav;
    var section = el('section', PREFIX + '-view', {
      id: PREFIX + '-panel-nav',
      role: 'tabpanel',
      'aria-labelledby': PREFIX + '-tab-nav',
      hidden: 'hidden'
    });
    section.appendChild(this._sectionHead(n.title, n.sub));

    var navSection = el('div', PREFIX + '-nav-section');
    var nav = el('nav', PREFIX + '-nav');
    var self = this;
    n.items.forEach(function (it, i) {
      var btn = el('button', i === 0 ? 'active' : '', {
        type: 'button',
        'data-p': it.id,
        text: it.label
      });
      on(btn, 'click', function () { self._onNavClick(btn); });
      nav.appendChild(btn);
    });
    navSection.appendChild(nav);

    n.items.forEach(function (it, i) {
      var panel = el('div', PREFIX + '-panel' + (i === 0 ? ' ' + 'active' : ''), {
        id: PREFIX + '-' + it.id
      });
      panel.appendChild(el('h4', null, { text: it.heading }));
      panel.appendChild(el('p', null, { text: it.desc }));
      navSection.appendChild(panel);
    });
    section.appendChild(navSection);

    this._nEls = { nav: nav };
    return section;
  };

  /* ---------- Cause chain view ---------- */
  GlossaryExplorer.prototype._buildCauseView = function () {
    var c = this.opts.causeChain;
    var section = el('section', PREFIX + '-view ' + PREFIX + '-cause-chain-view', {
      id: PREFIX + '-panel-cause',
      role: 'tabpanel',
      'aria-labelledby': PREFIX + '-tab-cause',
      hidden: 'hidden'
    });
    section.appendChild(this._sectionHead(c.title, c.sub));

    var timeline = el('div', PREFIX + '-timeline-nav', { id: PREFIX + '-cause-nav' });
    var self = this;
    c.events.forEach(function (ev, i) {
      var btn = el('button', i === 0 ? 'active' : '', {
        type: 'button',
        'data-event': String(i),
        text: ev.title
      });
      on(btn, 'click', function () { self._onCauseClick(btn); });
      timeline.appendChild(btn);
    });
    section.appendChild(timeline);

    var content = el('div', PREFIX + '-cause-chain-content', { id: PREFIX + '-cause-content' });
    var firstEvent = c.events[0] || { title: '', desc: '' };
    content.appendChild(el('div', PREFIX + '-event-title', { text: firstEvent.title }));
    content.appendChild(el('div', PREFIX + '-event-desc', { text: firstEvent.desc }));
    var whatifBtn = el('button', PREFIX + '-whatif-btn', { type: 'button', text: c.whatifQuestion });
    content.appendChild(whatifBtn);
    var whatifResult = el('div', PREFIX + '-whatif-result', { text: c.whatifResult });
    content.appendChild(whatifResult);
    section.appendChild(content);

    this._cEls = {
      timeline: timeline,
      content: content,
      title: content.children[0],
      desc: content.children[1],
      whatifBtn: whatifBtn,
      whatifResult: whatifResult
    };
    on(whatifBtn, 'click', function () {
      whatifResult.classList.toggle('show');
    });
    return section;
  };

  /* ---------- Tab switching ---------- */
  GlossaryExplorer.prototype._onTabClick = function (tab) {
    var tabs = this.root.querySelectorAll('.' + PREFIX + '-tab-bar .' + PREFIX + '-tab');
    Array.prototype.forEach.call(tabs, function (t) {
      var isActive = t.getAttribute('data-tab') === tab.id;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    var views = this.root.querySelectorAll('.' + PREFIX + '-view-stack .' + PREFIX + '-view');
    Array.prototype.forEach.call(views, function (v) {
      var isActive = v.id === PREFIX + '-panel-' + tab.id;
      v.classList.toggle('active', isActive);
      if (isActive) v.removeAttribute('hidden');
      else v.setAttribute('hidden', 'hidden');
    });
  };

  /* ---------- Quiz logic ---------- */
  GlossaryExplorer.prototype._renderQuestion = function () {
    var q = this.opts.quiz.questions[this._qIdx];
    var qno = this._qEls.top.querySelector('.' + PREFIX + '-qno');
    var qt = this._qEls.top.querySelector('.' + PREFIX + '-qt');
    qno.textContent = this.opts.quiz.questionPrefix + (this._qIdx + 1) +
      this.opts.quiz.questionSeparator + this.opts.quiz.questions.length;
    qt.textContent = q.q;
    var opts = this._qEls.opts;
    opts.innerHTML = '';
    var self = this;
    q.opts.forEach(function (opt, i) {
      var div = el('div', PREFIX + '-opt', {
        'data-k': String.fromCharCode(97 + i),
        text: opt
      });
      on(div, 'click', function () { self._selectAnswer(i, div); });
      opts.appendChild(div);
    });
    this._qEls.fb.classList.remove('show', 'ok', 'no');
    this._qEls.fb.textContent = '';
    this._qEls.next.classList.remove('show');
    this._qEls.result.classList.remove('show');
  };

  GlossaryExplorer.prototype._selectAnswer = function (index, optEl) {
    var q = this.opts.quiz.questions[this._qIdx];
    var allOpts = this._qEls.opts.querySelectorAll('.' + PREFIX + '-opt');
    Array.prototype.forEach.call(allOpts, function (o) {
      o.classList.remove('selected', 'correct', 'wrong');
    });
    optEl.classList.add('selected');
    var fb = this._qEls.fb;
    if (index === q.correct) {
      optEl.classList.add('correct');
      fb.textContent = this.opts.quiz.correctPrefix + q.opts[index];
      fb.classList.add('show', 'ok');
      this._qScore++;
    } else {
      optEl.classList.add('wrong');
      allOpts[q.correct].classList.add('correct');
      fb.textContent = this.opts.quiz.wrongPrefix + q.opts[q.correct];
      fb.classList.add('show', 'no');
    }
    this._qEls.next.classList.add('show');
  };

  GlossaryExplorer.prototype._nextQuestion = function () {
    this._qIdx++;
    if (this._qIdx < this.opts.quiz.questions.length) {
      this._renderQuestion();
    } else {
      this._qEls.top.style.display = 'none';
      this._qEls.body.style.display = 'none';
      this._qEls.next.style.display = 'none';
      this._qEls.result.classList.add('show');
      this._qEls.score.textContent = this._qScore + this.opts.quiz.scoreSeparator +
        this.opts.quiz.questions.length;
    }
  };

  /* ---------- Nav switching ---------- */
  GlossaryExplorer.prototype._onNavClick = function (btn) {
    var navButtons = this.root.querySelectorAll('.' + PREFIX + '-nav-section .' + PREFIX + '-nav button');
    Array.prototype.forEach.call(navButtons, function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    var target = btn.getAttribute('data-p');
    var panels = this.root.querySelectorAll('.' + PREFIX + '-nav-section .' + PREFIX + '-panel');
    Array.prototype.forEach.call(panels, function (p) {
      p.classList.toggle('active', p.id === PREFIX + '-' + target);
    });
  };

  /* ---------- Cause chain ---------- */
  GlossaryExplorer.prototype._onCauseClick = function (btn) {
    var btns = this.root.querySelectorAll('.' + PREFIX + '-cause-chain-view .' + PREFIX + '-timeline-nav button');
    Array.prototype.forEach.call(btns, function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    this._evIdx = parseInt(btn.getAttribute('data-event'), 10);
    var ev = this.opts.causeChain.events[this._evIdx];
    if (!ev) return;
    this._cEls.title.textContent = ev.title;
    this._cEls.desc.textContent = ev.desc;
    this._cEls.whatifResult.classList.remove('show');
  };

  /* ---------- After mount: wire all events ---------- */
  GlossaryExplorer.prototype._afterMount = function () {
    var self = this;

    // Splash dismiss via CTA
    var cta = this.root.querySelector('#' + PREFIX + '-splash-start');
    if (cta) on(cta, 'click', function () {
      self._splash.classList.add('hide');
    });

    // Quiz: next button + initial render
    on(this._qEls.next, 'click', function () { self._nextQuestion(); });
    if (this.opts.quiz.questions.length) this._renderQuestion();

    // Comparison toggle (alternates opacity 1 / 0.5 on each card)
    on(this._cmpEls.toggle, 'click', function () {
      var cards = self.root.querySelectorAll('.' + PREFIX + '-whatif-card');
      Array.prototype.forEach.call(cards, function (c) {
        c.style.opacity = c.style.opacity === '0.5' ? '1' : '0.5';
      });
    });

    // Graph node clicks -> update info text
    var nodes = this.root.querySelectorAll('.' + PREFIX + '-graph-container .' + PREFIX + '-node');
    Array.prototype.forEach.call(nodes, function (node) {
      on(node, 'click', function () {
        var id = node.getAttribute('data-id');
        var info = null;
        for (var i = 0; i < self.opts.graph.nodes.length; i++) {
          if (self.opts.graph.nodes[i].id === id) { info = self.opts.graph.nodes[i]; break; }
        }
        if (info) self._gEls.info.textContent = info.label + ': ' + info.desc;
      });
    });

    // ESC key closes the splash overlay
    on(document, 'keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (self._splash && !self._splash.classList.contains('hide')) {
        self._splash.classList.add('hide');
      }
    });

    // Three-tier responsive hook: tag root with sg-mobile / sg-extreme state classes
    function applyResponsive() {
      if (!self.root) return;
      self.root.classList.toggle(PREFIX + '-mobile', isMobile());
      self.root.classList.toggle(PREFIX + '-extreme', isExtremeSmall());
    }
    applyResponsive();
    on(global, 'resize', applyResponsive);
  };

  /* ---------- Public API ---------- */
  var API = {
    version: '1.0.0',
    create: function (options) {
      var inst = new GlossaryExplorer(options);
      return inst.create();
    },
    mount: function (container, options) {
      var inst = new GlossaryExplorer(options);
      return inst.mount(container);
    },
    GlossaryExplorer: GlossaryExplorer
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.GlossaryExplorer = API;

})(window);
