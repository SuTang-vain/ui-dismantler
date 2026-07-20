/*!
 * star-group.js  v1.1.0
 * 明星组合 · 动态百科成员探索卡 - 渲染引擎（BLACKPINK v10 提炼）
 *
 * 全局 API：
 *   window.StarGroup.mount(rootEl, options)   // 挂载到容器
 *   window.StarGroup.create(options)          // 创建并返回 DOM
 *
 * options 见 README.md 数据契约部分。
 * 无第三方依赖，纯原生 ES5+。
 *
 * 与 v1.0 的差异：
 *   - 时间线支持「原地展开经历背景故事」（点击卡片展开 is-expanded，显示 sg-t-story）
 *   - timeline 数据新增 story 字段（经历背景长文）
 *   - 不再为时间线单独弹 Modal（v10 行为：所有屏幕尺寸均原地展开）
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
      else if (k.indexOf('data-') === 0 || k === 'role' || k === 'aria-hidden') n.setAttribute(k, attrs[k]);
      else n[k] = attrs[k];
    }
    return n;
  }
  function on(node, evt, fn) { node.addEventListener(evt, fn); }
  function raf(fn) {
    if (typeof global.requestAnimationFrame === 'function') global.requestAnimationFrame(fn);
    else setTimeout(fn, 0);
  }
  function isExtremeSmall() {
    return global.innerWidth <= 320 || global.innerHeight <= 380;
  }
  function isMobile() { return global.innerWidth <= 500; }
  // 去掉 "队内定位:" / "队内定位：" 前缀（兼容中英文冒号）
  function stripRolePrefix(s) {
    return (s || '').replace(/^队内定位[：:]\s*/, '');
  }

  /* ============================================================
   * 默认配置
   * ============================================================ */
  var DEFAULTS = {
    title: '组合名称',
    ariaLabel: '明星组合 · 动态百科成员探索卡',
    detailKicker: '成员 ↔ 团体 关系',
    sourceNote: '资料为可核实的公开事实;未列出的个人作品或履历留待补充。',
    timelineHeadTitle: '组合阶段',
    timelineHeadSub: '关键节点',
    worksHeadTitle: '团体作品概览',
    worksHeadSub: '仅收录团体作品 · 个人作品另列',
    worksStoryCta: '展开创作故事',
    timelineStoryLabel: '经历背景',
    timelineHint: '了解背景 ›',
    timelineCollapse: '收起',
    memberModalTitle: '成员详情',
    memberModalDecl: '点击卡片查看详情',
    tabs: [
      { id: 'members',  label: '成员详情', count: 0 },
      { id: 'timeline', label: '经历',     count: 0 },
      { id: 'works',    label: '团体作品', count: 0 },
      { id: 'more',     label: '其它',     more: true }
    ],
    members: [],
    timeline: [],
    works: [],
    moreFacts: [],          // [{label, value, full?}]
    moreTitle: '资料与说明',
    moreSub: '本卡片仅使用可核实的公开事实,具体年代、关系以官方与权威来源为准。',
    moreDecl: '动态百科 · 资料与说明',
    autoPlayMember: 3000,
    autoPlayWorks: 3500,
    theme: {}               // 覆盖 --sg-* 变量
  };

  /* ============================================================
   * 主构造器
   * ============================================================ */
  function StarGroup(options) {
    this.opts = deepMerge({}, DEFAULTS, options || {});
    this.root = null;
    this._memberTimer = null;
    this._worksTimer = null;
    this._memberIdx = 0;
    this._workIdx = 0;
    this._memberSelected = null;
    this._expandedTlItem = null;
  }

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

  /* ---------- 公共：创建并返回 DOM ---------- */
  StarGroup.prototype.create = function () {
    var frame = el('main', 'sg-frame', { role: 'region' });
    frame.setAttribute('aria-label', this.opts.ariaLabel);
    applyTheme(frame, this.opts.theme);

    // tab count 变量
    frame.style.setProperty('--sg-tab-count', this.opts.tabs.length);

    frame.appendChild(this._buildTabBar());
    frame.appendChild(this._buildViewStack());

    this.root = frame;
    return frame;
  };

  /* ---------- 公共：挂载 ---------- */
  StarGroup.prototype.mount = function (container) {
    var node = this.create();
    (container || document.body).appendChild(node);
    this._afterMount();
    return this;
  };

  /* ============================================================
   * 1) Tab Bar
   * ============================================================ */
  StarGroup.prototype._buildTabBar = function () {
    var nav = el('nav', 'sg-tab-bar', { role: 'tablist' });
    nav.setAttribute('aria-label', this.opts.title + ' 探索视图');
    var self = this;
    this.opts.tabs.forEach(function (t, i) {
      var btn = el('button', 'sg-tab' + (t.more ? ' sg-tab-more' : ''), {
        type: 'button',
        role: 'tab',
        text: t.label
      });
      btn.id = 'sg-tab-' + t.id;
      btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      btn.setAttribute('aria-controls', 'sg-panel-' + t.id);
      if (t.count != null && !t.more) {
        var s = el('small', null, { text: String(t.count) });
        btn.appendChild(s);
      }
      on(btn, 'click', function () { self._onTabClick(t); });
      nav.appendChild(btn);
    });
    return nav;
  };

  /* ============================================================
   * 2) View Stack
   * ============================================================ */
  StarGroup.prototype._buildViewStack = function () {
    var stack = el('div', 'sg-view-stack');
    stack.appendChild(this._buildMembersView());
    stack.appendChild(this._buildTimelineView());
    stack.appendChild(this._buildWorksView());
    return stack;
  };

  /* ============================================================
   * 3) 成员视图
   * ============================================================ */
  StarGroup.prototype._buildMembersView = function () {
    var section = el('section', 'sg-view sg-members-view active', {
      id: 'sg-panel-members', role: 'tabpanel'
    });
    section.setAttribute('aria-labelledby', 'sg-tab-members');

    var stage = el('div', 'sg-member-stage');
    var grid = el('div', 'sg-member-grid', { role: 'list' });
    stage.appendChild(grid);

    var prev = el('button', 'sg-arrow sg-prev', { type: 'button', 'aria-label': '上一页', text: '‹' });
    var next = el('button', 'sg-arrow sg-next', { type: 'button', 'aria-label': '下一页', text: '›' });
    var dots = el('div', 'sg-dots');
    stage.appendChild(prev);
    stage.appendChild(next);
    stage.appendChild(dots);

    // 详情面板
    var panel = el('aside', 'sg-detail-panel', { 'aria-live': 'polite' });
    panel.appendChild(el('span', 'sg-detail-kicker', { id: 'sg-rel-kicker', text: this.opts.detailKicker }));
    panel.appendChild(el('h2', null, { id: 'sg-rel-name' }));
    panel.appendChild(el('p', 'sg-subtitle', { id: 'sg-rel-sub' }));
    panel.appendChild(el('div', 'sg-relation-list', { id: 'sg-rel-list' }));
    panel.appendChild(el('span', 'sg-source-note', { text: this.opts.sourceNote }));

    section.appendChild(stage);
    section.appendChild(panel);

    this._memberEls = { grid: grid, prev: prev, next: next, dots: dots,
                        name: panel.querySelector('#sg-rel-name'),
                        sub: panel.querySelector('#sg-rel-sub'),
                        list: panel.querySelector('#sg-rel-list'),
                        stage: stage };
    return section;
  };

  StarGroup.prototype._renderMemberPage = function (page) {
    var perPage = 4;
    var total = Math.max(1, Math.ceil(this.opts.members.length / perPage));
    if (page < 1) page = 1;
    if (page > total) page = total;
    var start = (page - 1) * perPage;
    var pageMembers = this.opts.members.slice(start, start + perPage);
    var self = this;
    var g = this._memberEls.grid;
    g.innerHTML = '';
    pageMembers.forEach(function (m) {
      var btn = el('button', 'sg-member', { type: 'button', role: 'listitem' });
      btn.dataset.member = m.key;
      btn.setAttribute('aria-pressed', m.key === self._memberSelected ? 'true' : 'false');
      var fig = el('figure', 'sg-avatar', { 'aria-hidden': 'true' });
      var img = el('img');
      img.src = m.img; img.alt = m.name;
      on(img, 'load', function () { img.classList.add('is-loaded'); });
      on(img, 'error', function () { img.classList.add('is-error'); });
      fig.appendChild(img);
      fig.appendChild(el('span', 'sg-avatar-fallback', { text: m.shortName || m.name.slice(0, 2) }));
      if (m.photoSource) fig.appendChild(el('span', 'sg-photo-source', { text: m.photoSource }));

      var info = el('span', 'sg-member-info');
      info.appendChild(el('span', 'sg-member-name', { text: m.name }));
      info.appendChild(el('span', 'sg-member-role', { text: stripRolePrefix(m.role) || '' }));
      info.appendChild(el('span', 'sg-member-state', { text: m.state || '在团' }));
      fig.appendChild(info);
      btn.appendChild(fig);
      on(btn, 'click', function () { self._selectMember(m.key, true); });
      g.appendChild(btn);
    });
    this._memberEls.prev.classList.toggle('is-hidden', page <= 1);
    this._memberEls.next.classList.toggle('is-hidden', page >= total);
    // dots
    var d = this._memberEls.dots; d.innerHTML = '';
    for (var i = 1; i <= total; i++) {
      (function (i) {
        var dot = el('button', 'sg-dot' + (i === page ? ' is-active' : ''), { type: 'button', 'aria-label': '第 ' + i + ' 页' });
        on(dot, 'click', function () { self._goMemberPage(i); self._stopMemberAutoPlay(); });
        d.appendChild(dot);
      })(i);
    }
    this._memberPage = page;
  };

  StarGroup.prototype._goMemberPage = function (page) {
    this._renderMemberPage(page);
  };

  StarGroup.prototype._selectMember = function (key, fromUser) {
    this._memberSelected = key;
    var nodes = this._memberEls.grid.querySelectorAll('.sg-member');
    Array.prototype.forEach.call(nodes, function (n) {
      n.setAttribute('aria-pressed', n.dataset.member === key ? 'true' : 'false');
    });
    var d = null;
    for (var i = 0; i < this.opts.members.length; i++) {
      if (this.opts.members[i].key === key) { d = this.opts.members[i]; break; }
    }
    if (!d) return;
    this._memberEls.name.textContent = d.name;
    this._memberEls.sub.textContent = d.role || '';
    var list = this._memberEls.list; list.innerHTML = '';
    (d.relations || []).forEach(function (row) {
      var div = el('div', 'sg-relation-row');
      div.appendChild(el('span', 'sg-rel-label', { text: row[0] }));
      div.appendChild(el('span', 'sg-rel-value', { text: row[1] }));
      list.appendChild(div);
    });
    // kicker 保持静态（不追加成员名），与原案例静态 DOM 一致
    if (fromUser && (isMobile() || isExtremeSmall())) this._openMemberModal(d);
  };

  StarGroup.prototype._startMemberAutoPlay = function () {
    this._stopMemberAutoPlay();
    var self = this;
    this._memberTimer = setInterval(function () {
      self._memberIdx = (self._memberIdx + 1) % self.opts.members.length;
      self._selectMember(self.opts.members[self._memberIdx].key);
    }, this.opts.autoPlayMember);
  };
  StarGroup.prototype._stopMemberAutoPlay = function () {
    if (this._memberTimer) { clearInterval(this._memberTimer); this._memberTimer = null; }
  };

  /* ============================================================
   * 4) 时间线视图（含原地展开经历背景故事）
   * ============================================================ */
  StarGroup.prototype._buildTimelineView = function () {
    var section = el('section', 'sg-view sg-timeline-view', {
      id: 'sg-panel-timeline', role: 'tabpanel', hidden: true
    });
    section.setAttribute('aria-labelledby', 'sg-tab-timeline');

    var head = el('div', 'sg-section-head');
    head.appendChild(el('strong', null, { text: this.opts.timelineHeadTitle }));
    head.appendChild(el('span', null, { id: 'sg-tl-page-label', text: '第 1 / 1 页 · ' + this.opts.timelineHeadSub }));
    section.appendChild(head);

    var wrap = el('div', 'sg-tl-scroll-wrap');
    var prevPc = el('button', 'sg-arrow sg-tl-prev sg-tl-prev-pc is-hidden', { type: 'button', 'aria-label': '上一页', text: '‹' });
    var nextPc = el('button', 'sg-arrow sg-tl-next sg-tl-next-pc is-hidden', { type: 'button', 'aria-label': '下一页', text: '›' });
    var track = el('div', 'sg-tl-track', { id: 'sg-tl-track' });
    wrap.appendChild(prevPc); wrap.appendChild(nextPc); wrap.appendChild(track);

    var self = this;
    this.opts.timeline.forEach(function (t, idx) {
      var item = el('article', 'sg-t-item');
      item.setAttribute('data-index', String(idx));
      if (t.img) {
        var img = el('img', 'sg-t-img');
        img.src = t.img; img.alt = t.alt || t.title || ''; img.loading = 'lazy';
        item.appendChild(img);
      }
      // 简短信息（默认显示）
      var info = el('div', 'sg-t-info');
      info.appendChild(el('time', null, { text: t.time }));
      info.appendChild(el('b', null, { text: t.title }));
      info.appendChild(el('p', null, { text: t.desc }));
      info.appendChild(el('span', 'sg-t-hint', { text: self.opts.timelineHint }));
      item.appendChild(info);

      // 经历背景故事（默认隐藏，展开时显示）
      var story = el('div', 'sg-t-story');
      var storyHead = el('div', 'sg-t-story-head');
      storyHead.appendChild(el('time', null, { text: t.time }));
      storyHead.appendChild(el('b', null, { text: t.title }));
      story.appendChild(storyHead);
      story.appendChild(el('span', 'sg-t-story-label', { text: self.opts.timelineStoryLabel }));
      story.appendChild(el('p', 'sg-t-story-text', { text: t.story || '' }));
      story.appendChild(el('button', 'sg-t-story-close', { type: 'button', text: self.opts.timelineCollapse }));
      item.appendChild(story);

      on(item, 'click', function (e) {
        if (e.target.closest('.sg-t-story-close')) { self._collapseTlItem(item); return; }
        self._toggleTlItem(item);
      });
      track.appendChild(item);
    });
    section.appendChild(wrap);

    // 移动端控制栏
    var controls = el('div', 'sg-tl-controls');
    var prevMb = el('button', 'sg-arrow sg-tl-prev sg-tl-prev-mobile is-hidden', { type: 'button', 'aria-label': '上一页', text: '‹' });
    var nextMb = el('button', 'sg-arrow sg-tl-next sg-tl-next-mobile', { type: 'button', 'aria-label': '下一页', text: '›' });
    var tlDots = el('div', 'sg-tl-dots', { id: 'sg-tl-dots' });
    controls.appendChild(prevMb);
    controls.appendChild(tlDots);
    controls.appendChild(nextMb);
    section.appendChild(controls);

    this._tlEls = {
      track: track, prevPc: prevPc, nextPc: nextPc,
      prevMb: prevMb, nextMb: nextMb, dots: tlDots,
      label: head.querySelector('#sg-tl-page-label')
    };
    return section;
  };

  StarGroup.prototype._tlPerPage = function () {
    if (isExtremeSmall()) return 2;
    if (isMobile()) return 2;
    return 3;
  };
  StarGroup.prototype._tlItemWidth = function () {
    var item = this._tlEls.track.querySelector('.sg-t-item:not(.is-expanded)');
    if (!item) item = this._tlEls.track.querySelector('.sg-t-item');
    return item ? item.offsetWidth + 10 : 0;
  };
  StarGroup.prototype._tlTotalPages = function () {
    var items = this._tlEls.track.querySelectorAll('.sg-t-item').length;
    return Math.max(1, Math.ceil(items / this._tlPerPage()));
  };
  StarGroup.prototype._buildTlDots = function () {
    var d = this._tlEls.dots; d.innerHTML = '';
    var total = this._tlTotalPages();
    var self = this;
    for (var i = 0; i < total; i++) {
      (function (i) {
        var dot = el('button', 'sg-tl-dot' + (i === 0 ? ' is-active' : ''), { type: 'button', 'data-index': String(i) });
        on(dot, 'click', function () {
          var w = self._tlItemWidth();
          self._tlEls.track.scrollTo({ left: i * w * self._tlPerPage(), behavior: 'smooth' });
        });
        d.appendChild(dot);
      })(i);
    }
  };
  StarGroup.prototype._updateTlArrows = function () {
    var tr = this._tlEls.track;
    var sl = tr.scrollLeft;
    var max = tr.scrollWidth - tr.clientWidth;
    this._setTlHidden(this._tlEls.prevPc, this._tlEls.prevMb, sl <= 5);
    this._setTlHidden(this._tlEls.nextPc, this._tlEls.nextMb, sl >= max - 5);
    var perPage = this._tlPerPage();
    var total = this._tlTotalPages();
    var w = this._tlItemWidth();
    var page = 1;
    if (w > 0) {
      page = Math.round(sl / (w * perPage)) + 1;
      page = Math.max(1, Math.min(page, total));
    }
    this._tlEls.label.textContent = '第 ' + page + ' / ' + total + ' 页 · ' + this.opts.timelineHeadSub;
    var dots = this._tlEls.dots.querySelectorAll('.sg-tl-dot');
    Array.prototype.forEach.call(dots, function (d, i) {
      d.classList.toggle('is-active', i === page - 1);
    });
  };
  StarGroup.prototype._setTlHidden = function (pc, mb, hidden) {
    pc.classList.toggle('is-hidden', hidden);
    mb.classList.toggle('is-hidden', hidden);
  };
  StarGroup.prototype._resetTlScroll = function () {
    var tr = this._tlEls.track;
    tr.scrollTo({ left: 0, behavior: 'auto' });
    var self = this;
    raf(function () {
      tr.scrollTo({ left: 0, behavior: 'auto' });
      self._updateTlArrows();
    });
  };
  // ---- 原地展开/收起时间线条目 ----
  StarGroup.prototype._toggleTlItem = function (item) {
    if (this._expandedTlItem && this._expandedTlItem !== item) {
      this._collapseTlItem(this._expandedTlItem);
    }
    if (item.classList.contains('is-expanded')) {
      this._collapseTlItem(item);
    } else {
      this._expandTlItem(item);
    }
  };
  StarGroup.prototype._expandTlItem = function (item) {
    item.classList.add('is-expanded');
    this._expandedTlItem = item;
    var tr = this._tlEls.track;
    // 展开时关闭 scroll-snap 避免干扰定位
    tr.style.scrollSnapType = 'none';
    var self = this;
    // 等卡片宽度过渡完成后再居中定位
    setTimeout(function () {
      var trackRect = tr.getBoundingClientRect();
      var itemRect = item.getBoundingClientRect();
      var offset = itemRect.left - trackRect.left - (trackRect.width - itemRect.width) / 2;
      tr.scrollLeft += offset;
      tr.style.scrollSnapType = 'x proximity';
      // 同步箭头/页码
      self._updateTlArrows();
    }, 420);
  };
  StarGroup.prototype._collapseTlItem = function (item) {
    item.classList.remove('is-expanded');
    if (this._expandedTlItem === item) this._expandedTlItem = null;
  };

  /* ============================================================
   * 5) 作品视图
   * ============================================================ */
  StarGroup.prototype._buildWorksView = function () {
    var section = el('section', 'sg-view sg-works-view', {
      id: 'sg-panel-works', role: 'tabpanel', hidden: true
    });
    section.setAttribute('aria-labelledby', 'sg-tab-works');

    var head = el('div', 'sg-section-head');
    head.appendChild(el('strong', null, { text: this.opts.worksHeadTitle }));
    head.appendChild(el('span', null, { text: this.opts.worksHeadSub }));
    section.appendChild(head);

    var wrap = el('div', 'sg-ws-scroll-wrap');
    var prev = el('button', 'sg-arrow sg-ws-prev', { type: 'button', 'aria-label': '上一个', text: '‹' });
    var next = el('button', 'sg-arrow sg-ws-next', { type: 'button', 'aria-label': '下一个', text: '›' });
    var carousel = el('div', 'sg-works-carousel', { id: 'sg-works-carousel' });
    var dots = el('div', 'sg-ws-dots', { id: 'sg-ws-dots' });
    wrap.appendChild(prev); wrap.appendChild(next);
    wrap.appendChild(carousel); wrap.appendChild(dots);
    section.appendChild(wrap);

    var cta = el('button', 'sg-ws-story-cta', { type: 'button', text: this.opts.worksStoryCta });
    section.appendChild(cta);

    // 故事面板
    var storyPanel = el('div', 'sg-work-story-panel', { id: 'sg-work-story-panel', hidden: true });
    var storyClose = el('button', 'sg-ws-story-close', { type: 'button', 'aria-label': '关闭故事', html: '&times;' });
    var storyBody = el('div', 'sg-ws-story-body', { id: 'sg-ws-story-body' });
    storyPanel.appendChild(storyClose);
    storyPanel.appendChild(storyBody);
    section.appendChild(storyPanel);

    this._worksEls = {
      carousel: carousel, dots: dots, prev: prev, next: next,
      cta: cta, storyPanel: storyPanel, storyClose: storyClose, storyBody: storyBody,
      cards: []
    };
    return section;
  };

  StarGroup.prototype._renderWorksCarousel = function () {
    var self = this;
    var c = this._worksEls.carousel;
    var d = this._worksEls.dots;
    c.innerHTML = ''; d.innerHTML = '';
    this._worksEls.cards = [];
    this.opts.works.forEach(function (w, i) {
      var card = el('article', 'sg-work-item');
      card.dataset.index = String(i);
      card.innerHTML =
        '<img class="sg-w-img" src="' + w.img + '" alt="' + (w.alt || w.title || '') + '" loading="lazy" />' +
        '<div class="sg-work-info">' +
          '<span class="sg-work-year">' + w.year + '</span>' +
          '<b>' + w.title + '</b>' +
          '<p>' + w.desc + '</p>' +
        '</div>';
      c.appendChild(card);
      self._worksEls.cards.push(card);

      var dot = el('button', 'sg-ws-dot' + (i === 0 ? ' is-active' : ''), { type: 'button', 'aria-label': '第 ' + (i + 1) + ' 个作品' });
      on(dot, 'click', function () { self._goWork(i); });
      d.appendChild(dot);

      on(card, 'click', function () {
        var idx = Number(this.dataset.index);
        if (idx === self._workIdx) self._openWorkStory(idx);
        else self._goWork(idx);
      });
    });
  };

  StarGroup.prototype._updateWorksLayout = function () {
    var total = this._worksEls.cards.length;
    var self = this;
    this._worksEls.cards.forEach(function (card, i) {
      card.classList.remove('is-center', 'is-prev-side', 'is-next-side', 'is-prev-far', 'is-next-far');
      if (i === self._workIdx) card.classList.add('is-center');
      else if (i === (self._workIdx - 1 + total) % total) card.classList.add('is-prev-side');
      else if (i === (self._workIdx + 1) % total) card.classList.add('is-next-side');
      else if (i === (self._workIdx - 2 + total) % total) card.classList.add('is-prev-far');
      else if (i === (self._workIdx + 2) % total) card.classList.add('is-next-far');
    });
    var dots = this._worksEls.dots.querySelectorAll('.sg-ws-dot');
    Array.prototype.forEach.call(dots, function (dt, i) {
      dt.classList.toggle('is-active', i === self._workIdx);
    });
  };

  StarGroup.prototype._nextWork = function () {
    var total = this._worksEls.cards.length;
    if (!total) return;
    this._workIdx = (this._workIdx + 1) % total;
    this._updateWorksLayout();
  };
  StarGroup.prototype._prevWork = function () {
    var total = this._worksEls.cards.length;
    if (!total) return;
    this._workIdx = (this._workIdx - 1 + total) % total;
    this._updateWorksLayout();
  };
  StarGroup.prototype._goWork = function (idx) {
    this._workIdx = idx;
    this._updateWorksLayout();
    this._restartWorksAutoPlay();
  };
  StarGroup.prototype._startWorksAutoPlay = function () {
    this._stopWorksAutoPlay();
    if (!this._worksEls.cards.length) return;
    var self = this;
    this._worksTimer = setInterval(function () { self._nextWork(); }, this.opts.autoPlayWorks);
  };
  StarGroup.prototype._stopWorksAutoPlay = function () {
    if (this._worksTimer) { clearInterval(this._worksTimer); this._worksTimer = null; }
  };
  StarGroup.prototype._restartWorksAutoPlay = function () {
    this._stopWorksAutoPlay();
    this._startWorksAutoPlay();
  };

  StarGroup.prototype._openWorkStory = function (idx) {
    var d = this.opts.works[idx];
    if (!d) return;
    this._worksEls.storyBody.innerHTML =
      '<img class="sg-ws-story-cover" src="' + d.img + '" alt="' + (d.alt || d.title || '') + '" />' +
      '<div class="sg-ws-story-content">' +
        '<span class="sg-ws-year">' + d.year + '</span>' +
        '<h3>' + d.title + '</h3>' +
        '<div class="sg-ws-story-divider"></div>' +
        '<span class="sg-ws-story-label">创作背景</span>' +
        '<p class="sg-ws-story-text">' + d.story + '</p>' +
      '</div>';
    this._worksEls.storyPanel.classList.add('open');
    this._worksEls.storyPanel.hidden = false;
    this._stopWorksAutoPlay();
  };
  StarGroup.prototype._closeWorkStory = function () {
    this._worksEls.storyPanel.classList.remove('open');
    this._worksEls.storyPanel.hidden = true;
    this._startWorksAutoPlay();
  };

  /* ============================================================
   * 6) Modal
   * ============================================================ */
  StarGroup.prototype._buildModals = function () {
    var self = this;

    // 资料说明 Modal（"其它"Tab 触发）
    var modal = el('div', 'sg-modal-overlay', { id: 'sg-modal', role: 'dialog', 'aria-modal': 'true' });
    modal.hidden = true;
    modal.setAttribute('aria-labelledby', 'sg-modal-title');
    var card = el('div', 'sg-modal-card');
    var xBtn = el('button', 'sg-modal-x-btn', { type: 'button', 'aria-label': '关闭', html: '&times;' });
    var head = el('div', 'sg-modal-head');
    head.appendChild(el('h3', null, { id: 'sg-modal-title', text: this.opts.moreTitle }));
    var body = el('div', 'sg-modal-body');
    this.opts.moreFacts.forEach(function (f) {
      var row = el('div', 'sg-m-row' + (f.full ? ' full' : ''));
      row.appendChild(el('small', null, { text: f.label }));
      row.appendChild(el('span', null, { text: f.value }));
      body.appendChild(row);
    });
    var foot = el('div', 'sg-modal-foot');
    foot.appendChild(el('span', 'sg-modal-decl', { text: this.opts.moreDecl }));
    card.appendChild(xBtn); card.appendChild(head);
    if (this.opts.moreSub) card.appendChild(el('p', 'sg-modal-sub', { text: this.opts.moreSub }));
    card.appendChild(body); card.appendChild(foot);
    modal.appendChild(card);
    on(xBtn, 'click', function () { self._closeModal(); });
    on(modal, 'click', function (e) { if (e.target === modal) self._closeModal(); });
    this.root.appendChild(modal);
    this._modal = modal;

    // 成员详情 Modal（小屏点成员卡触发）
    var memberModal = el('div', 'sg-modal-overlay', { id: 'sg-member-modal', role: 'dialog', 'aria-modal': 'true' });
    memberModal.hidden = true;
    memberModal.setAttribute('aria-labelledby', 'sg-member-modal-title');
    var mCard = el('div', 'sg-modal-card sg-member-detail-modal');
    var mX = el('button', 'sg-modal-x-btn', { type: 'button', 'aria-label': '关闭', html: '&times;' });
    var mHead = el('div', 'sg-modal-head');
    mHead.appendChild(el('h3', null, { id: 'sg-member-modal-title', text: this.opts.memberModalTitle }));
    var mBody = el('div', 'sg-modal-body', { id: 'sg-member-modal-body' });
    var mFoot = el('div', 'sg-modal-foot');
    mFoot.appendChild(el('span', 'sg-modal-decl', { text: this.opts.memberModalDecl }));
    mCard.appendChild(mX); mCard.appendChild(mHead); mCard.appendChild(mBody); mCard.appendChild(mFoot);
    memberModal.appendChild(mCard);
    on(mX, 'click', function () { self._closeMemberModal(); });
    on(memberModal, 'click', function (e) { if (e.target === memberModal) self._closeMemberModal(); });
    this.root.appendChild(memberModal);
    this._memberModal = memberModal;
    this._memberModalBody = mBody;
    this._memberModalTitle = mHead.querySelector('#sg-member-modal-title');
  };

  StarGroup.prototype._openModal = function () {
    this._modal.hidden = false;
    this._modal.classList.add('open');
    var moreTab = this.root.querySelector('#sg-tab-more');
    if (moreTab) {
      moreTab.setAttribute('aria-selected', 'true');
      moreTab.setAttribute('aria-expanded', 'true');
    }
  };
  StarGroup.prototype._closeModal = function () {
    this._modal.classList.remove('open');
    this._modal.hidden = true;
    var moreTab = this.root.querySelector('#sg-tab-more');
    if (moreTab) {
      moreTab.setAttribute('aria-selected', 'false');
      moreTab.setAttribute('aria-expanded', 'false');
    }
  };

  StarGroup.prototype._openMemberModal = function (d) {
    this._memberModalTitle.textContent = d.name;
    var b = this._memberModalBody; b.innerHTML = '';
    // 头像信息头
    var header = el('div', 'sg-mdm-header');
    var avatar = el('div', 'sg-mdm-avatar');
    if (d.img) {
      var img = el('img');
      img.src = d.img; img.alt = d.name;
      avatar.appendChild(img);
    } else {
      avatar.textContent = d.shortName || (d.name || '').charAt(0);
    }
    var headText = el('div', 'sg-mdm-head-text');
    headText.appendChild(el('b', null, { text: d.name }));
    headText.appendChild(el('span', null, { text: stripRolePrefix(d.role) || '' }));
    header.appendChild(avatar);
    header.appendChild(headText);
    b.appendChild(header);
    // 关系列表
    (d.relations || []).forEach(function (row) {
      var r = el('div', 'sg-m-row');
      r.appendChild(el('small', null, { text: row[0] }));
      r.appendChild(el('span', null, { text: row[1] }));
      b.appendChild(r);
    });
    this._memberModal.hidden = false;
    this._memberModal.classList.add('open');
  };
  StarGroup.prototype._closeMemberModal = function () {
    this._memberModal.classList.remove('open');
    this._memberModal.hidden = true;
  };

  /* ============================================================
   * 7) Tab 切换
   * ============================================================ */
  StarGroup.prototype._onTabClick = function (tab) {
    var self = this;
    var tabs = this.root.querySelectorAll('.sg-tab-bar .sg-tab');
    var panels = {
      members: this.root.querySelector('#sg-panel-members'),
      timeline: this.root.querySelector('#sg-panel-timeline'),
      works: this.root.querySelector('#sg-panel-works')
    };
    if (tab.more) {
      if (this._modal.hidden) this._openModal(); else this._closeModal();
      return;
    }
    Array.prototype.forEach.call(tabs, function (t) {
      t.setAttribute('aria-selected', t.id === 'sg-tab-' + tab.id ? 'true' : 'false');
    });
    Object.keys(panels).forEach(function (k) {
      var p = panels[k];
      var active = k === tab.id;
      p.hidden = !active;
      p.classList.toggle('active', active);
    });
    if (tab.id === 'timeline') this._resetTlScroll();
    if (tab.id === 'works') this._startWorksAutoPlay();
    else this._stopWorksAutoPlay();
    if (!this._modal.hidden) this._closeModal();
  };

  /* ============================================================
   * 8) 挂载后绑定
   * ============================================================ */
  StarGroup.prototype._afterMount = function () {
    this._buildModals();

    // 成员
    if (this.opts.members.length) {
      this._memberSelected = this.opts.members[0].key;
      this._renderMemberPage(1);
      this._selectMember(this._memberSelected);
      var self = this;
      on(this._memberEls.prev, 'click', function () { self._goMemberPage((self._memberPage || 1) - 1); self._stopMemberAutoPlay(); });
      on(this._memberEls.next, 'click', function () { self._goMemberPage((self._memberPage || 1) + 1); self._stopMemberAutoPlay(); });
      on(this._memberEls.stage, 'click', function () { self._stopMemberAutoPlay(); });
      on(this._memberEls.stage, 'touchstart', function () { self._stopMemberAutoPlay(); });
      this._startMemberAutoPlay();
    }

    // 时间线
    if (this.opts.timeline.length) {
      var self2 = this;
      this._buildTlDots();
      on(this._tlEls.prevPc, 'click', function () { self2._scrollTl(-1); });
      on(this._tlEls.nextPc, 'click', function () { self2._scrollTl(1); });
      on(this._tlEls.prevMb, 'click', function () { self2._scrollTl(-1); });
      on(this._tlEls.nextMb, 'click', function () { self2._scrollTl(1); });
      on(this._tlEls.track, 'scroll', function () { self2._updateTlArrows(); });
      on(global, 'resize', function () { self2._buildTlDots(); self2._updateTlArrows(); });
      // 同步计算一次页码/箭头（保证 jsdom 无 rAF 时也能得到正确的 "第 1 / 2 页"）
      this._updateTlArrows();
      raf(function () { self2._updateTlArrows(); });
    }

    // 作品
    if (this.opts.works.length) {
      var self3 = this;
      this._renderWorksCarousel();
      this._updateWorksLayout();
      on(this._worksEls.prev, 'click', function () { self3._prevWork(); self3._restartWorksAutoPlay(); });
      on(this._worksEls.next, 'click', function () { self3._nextWork(); self3._restartWorksAutoPlay(); });
      on(this._worksEls.carousel, 'mouseenter', function () { self3._stopWorksAutoPlay(); });
      on(this._worksEls.carousel, 'mouseleave', function () { self3._startWorksAutoPlay(); });
      on(this._worksEls.cta, 'click', function () { self3._openWorkStory(self3._workIdx); });
      on(this._worksEls.storyClose, 'click', function () { self3._closeWorkStory(); });
      on(this._worksEls.storyPanel, 'click', function (e) {
        if (e.target === self3._worksEls.storyPanel) self3._closeWorkStory();
      });
    }

    // ESC 关闭：优先级 时间线展开 > 故事面板 > 成员 Modal > 资料 Modal
    var self4 = this;
    on(document, 'keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (self4._expandedTlItem) { self4._collapseTlItem(self4._expandedTlItem); return; }
      if (!self4._memberModal.hidden) { self4._closeMemberModal(); return; }
      if (self4._worksEls && !self4._worksEls.storyPanel.hidden) { self4._closeWorkStory(); return; }
      if (!self4._modal.hidden) self4._closeModal();
    });

    // 初始 more Tab
    var moreTab = this.root.querySelector('#sg-tab-more');
    if (moreTab) moreTab.setAttribute('aria-expanded', 'false');
  };

  StarGroup.prototype._scrollTl = function (dir) {
    var perPage = this._tlPerPage();
    var w = this._tlItemWidth();
    this._tlEls.track.scrollBy({ left: dir * w * perPage, behavior: 'smooth' });
  };

  /* ============================================================
   * 主题应用
   * ============================================================ */
  function applyTheme(node, theme) {
    if (!theme) return;
    Object.keys(theme).forEach(function (k) {
      // 接受 'primary' 或 '--sg-primary' 两种写法
      var name = k.indexOf('--sg-') === 0 ? k : '--sg-' + k;
      node.style.setProperty(name, theme[k]);
    });
  }

  /* ============================================================
   * 暴露 API
   * ============================================================ */
  var API = {
    version: '1.1.0',
    create: function (options) {
      var inst = new StarGroup(options);
      return inst.create();
    },
    mount: function (container, options) {
      var inst = new StarGroup(options);
      return inst.mount(container);
    },
    StarGroup: StarGroup
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.StarGroup = API;

})(typeof window !== 'undefined' ? window : this);
