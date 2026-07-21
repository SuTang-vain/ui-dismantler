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
   * 类名契约（CSS-JS 共享单一事实源）
   * CSS (star-group.css) 的所有 .sg-* 选择器必须来自此清单
   * JS 中所有 el() 调用的 cls 参数必须来自此清单
   * 增删类名时先改这里，再同步 CSS 和 JS
   * ============================================================
   * sg-frame, sg-view-stack, sg-view
   * sg-tab-bar, sg-tab, sg-tab-more
   * sg-members-view, sg-member-stage, sg-member-grid, sg-member,
   * sg-avatar, sg-avatar-fallback, sg-photo-source, sg-member-info,
   * sg-member-name, sg-member-role, sg-member-state,
   * sg-arrow, sg-prev, sg-next, sg-dots, sg-dot
   * sg-detail-panel, sg-detail-kicker, sg-subtitle, sg-relation-list,
   * sg-relation-row, sg-rel-label, sg-rel-value, sg-source-note
   * sg-timeline-view, sg-section-head, sg-tl-scroll-wrap,
   * sg-tl-track, sg-t-item, sg-t-img, sg-t-info, sg-t-hint,
   * sg-t-story, sg-t-story-head, sg-t-story-label, sg-t-story-text, sg-t-story-close,
   * sg-tl-prev, sg-tl-next, sg-tl-prev-pc, sg-tl-next-pc,
   * sg-tl-prev-mobile, sg-tl-next-mobile, sg-tl-controls, sg-tl-dots, sg-tl-dot
   * sg-works-view, sg-ws-scroll-wrap, sg-works-carousel, sg-work-item,
   * sg-w-img, sg-work-info, sg-work-year, sg-ws-prev, sg-ws-next,
   * sg-ws-dots, sg-ws-dot, sg-ws-story-cta, sg-work-story-panel,
   * sg-ws-story-close, sg-ws-story-body, sg-ws-story-cover,
   * sg-ws-story-content, sg-ws-year, sg-ws-story-divider, sg-ws-story-label, sg-ws-story-text
   * sg-modal-overlay, sg-modal-card, sg-modal-x-btn, sg-modal-head,
   * sg-modal-title, sg-modal-sub, sg-modal-body, sg-m-row, sg-modal-foot, sg-modal-decl,
   * sg-member-detail-modal, sg-mdm-header, sg-mdm-avatar, sg-mdm-head-text
   * ============================================================ */

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
   *   - DEFAULTS 仅提供占位文案与结构骨架，不含任何案例数据
   *   - members / timeline / works / moreFacts 默认为空数组
   *   - 真实案例数据由调用方在 options 中传入（见 examples/blackpink.html）
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
    worksStoryLabel: '创作背景',
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
    members: [],            // [{key,name,role,shortName,color,state,img,photoSource,relations}]
    timeline: [],           // [{time,title,alt,img,desc,story}]
    works: [],              // [{img,alt,year,title,desc,story}]
    moreFacts: [],          // [{label,value,full?}]
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
    var els = this._memberEls;

    els.grid.innerHTML = '';
    pageMembers.forEach(function (m) {
      var btn = el('button', 'sg-member', { type: 'button', role: 'listitem' });
      btn.dataset.member = m.key;
      btn.setAttribute('aria-pressed', m.key === self._memberSelected ? 'true' : 'false');

      var fig = el('figure', 'sg-avatar', { 'aria-hidden': 'true' });
      if (m.img) {
        var img = el('img');
        img.src = m.img;
        img.alt = m.name;
        img.addEventListener('load', function () { img.classList.add('is-loaded'); });
        img.addEventListener('error', function () { img.classList.add('is-error'); });
        fig.appendChild(img);
      }
      var fb = el('span', 'sg-avatar-fallback', { text: m.shortName || m.name.charAt(0) });
      fig.appendChild(fb);
      if (m.photoSource) {
        fig.appendChild(el('span', 'sg-photo-source', { text: m.photoSource }));
      }
      var info = el('span', 'sg-member-info');
      info.appendChild(el('span', 'sg-member-name', { text: m.name }));
      info.appendChild(el('span', 'sg-member-role', { text: stripRolePrefix(m.role) }));
      if (m.state) info.appendChild(el('span', 'sg-member-state', { text: m.state }));
      fig.appendChild(info);
      btn.appendChild(fig);

      on(btn, 'click', function () { self._selectMember(m.key, true); });
      els.grid.appendChild(btn);
    });

    // arrows
    els.prev.classList.toggle('is-hidden', page <= 1);
    els.next.classList.toggle('is-hidden', page >= total);

    // dots
    els.dots.innerHTML = '';
    for (var i = 1; i <= total; i++) {
      var d = el('button', 'sg-dot' + (i === page ? ' is-active' : ''), { type: 'button' });
      d.setAttribute('aria-label', '第 ' + i + ' 页');
      (function (p) { on(d, 'click', function () { self._goToPage(p); }); })(i);
      els.dots.appendChild(d);
    }
    this._memberPage = page;
    this._memberTotalPages = total;
  };

  StarGroup.prototype._goToPage = function (p) {
    this._renderMemberPage(p);
    this._stopAutoPlay();
  };

  StarGroup.prototype._selectMember = function (key, showModal) {
    this._memberSelected = key;
    var els = this._memberEls;
    var nodes = els.grid.querySelectorAll('.sg-member');
    Array.prototype.forEach.call(nodes, function (n) {
      n.setAttribute('aria-pressed', n.dataset.member === key ? 'true' : 'false');
    });
    var m = null;
    for (var i = 0; i < this.opts.members.length; i++) {
      if (this.opts.members[i].key === key) { m = this.opts.members[i]; break; }
    }
    if (!m) return;
    els.name.textContent = m.name;
    els.sub.textContent = m.role;
    els.list.innerHTML = '';
    (m.relations || []).forEach(function (row) {
      var r = el('div', 'sg-relation-row');
      r.appendChild(el('span', 'sg-rel-label', { text: row[0] }));
      r.appendChild(el('span', 'sg-rel-value', { text: row[1] }));
      els.list.appendChild(r);
    });
    if (showModal && isExtremeSmall()) {
      this._openMemberModal(m);
    }
  };

  StarGroup.prototype._startAutoPlay = function () {
    var self = this;
    this._stopAutoPlay();
    if (this.opts.members.length === 0) return;
    this._memberIdx = 0;
    this._memberTimer = setInterval(function () {
      self._memberIdx = (self._memberIdx + 1) % self.opts.members.length;
      self._selectMember(self.opts.members[self._memberIdx].key);
    }, this.opts.autoPlayMember);
  };
  StarGroup.prototype._stopAutoPlay = function () {
    if (this._memberTimer) { clearInterval(this._memberTimer); this._memberTimer = null; }
  };

  /* ============================================================
   * 4) 时间线视图
   * ============================================================ */
  StarGroup.prototype._buildTimelineView = function () {
    var section = el('section', 'sg-view sg-timeline-view', {
      id: 'sg-panel-timeline', role: 'tabpanel', hidden: true
    });
    section.setAttribute('aria-labelledby', 'sg-tab-timeline');

    var head = el('div', 'sg-section-head');
    head.appendChild(el('strong', null, { text: this.opts.timelineHeadTitle }));
    var label = el('span', null, { text: '第 1 / 1 页 · ' + this.opts.timelineHeadSub });
    label.id = 'sg-tl-page-label';
    head.appendChild(label);
    section.appendChild(head);

    var scrollWrap = el('div', 'sg-tl-scroll-wrap');
    var prevPc = el('button', 'sg-arrow sg-tl-prev sg-tl-prev-pc is-hidden', { type: 'button', 'aria-label': '上一页', text: '‹' });
    var nextPc = el('button', 'sg-arrow sg-tl-next sg-tl-next-pc is-hidden', { type: 'button', 'aria-label': '下一页', text: '›' });
    var track = el('div', 'sg-tl-track', { id: 'sg-tl-track' });
    scrollWrap.appendChild(prevPc);
    scrollWrap.appendChild(nextPc);
    scrollWrap.appendChild(track);
    section.appendChild(scrollWrap);

    var controls = el('div', 'sg-tl-controls');
    var prevMb = el('button', 'sg-arrow sg-tl-prev sg-tl-prev-mobile is-hidden', { type: 'button', 'aria-label': '上一页', text: '‹' });
    var nextMb = el('button', 'sg-arrow sg-tl-next sg-tl-next-mobile', { type: 'button', 'aria-label': '下一页', text: '›' });
    var tlDots = el('div', 'sg-tl-dots');
    controls.appendChild(prevMb);
    controls.appendChild(tlDots);
    controls.appendChild(nextMb);
    section.appendChild(controls);

    this._tlEls = { track: track, prevPc: prevPc, nextPc: nextPc, prevMb: prevMb, nextMb: nextMb,
                    dots: tlDots, label: label, scrollWrap: scrollWrap };
    return section;
  };

  StarGroup.prototype._renderTimeline = function () {
    var self = this;
    var els = this._tlEls;
    els.track.innerHTML = '';
    this.opts.timeline.forEach(function (t, i) {
      var item = el('article', 'sg-t-item');
      item.dataset.index = String(i);
      if (t.img) {
        var img = el('img', 'sg-t-img');
        img.src = t.img;
        img.alt = t.alt || t.title;
        img.loading = 'lazy';
        item.appendChild(img);
      }
      var info = el('div', 'sg-t-info');
      info.appendChild(el('time', null, { text: t.time }));
      info.appendChild(el('b', null, { text: t.title }));
      info.appendChild(el('p', null, { text: t.desc }));
      info.appendChild(el('span', 'sg-t-hint', { text: self.opts.timelineHint }));
      item.appendChild(info);

      var story = el('div', 'sg-t-story');
      var storyHead = el('div', 'sg-t-story-head');
      storyHead.appendChild(el('time', null, { text: t.time }));
      storyHead.appendChild(el('b', null, { text: t.title }));
      story.appendChild(storyHead);
      story.appendChild(el('span', 'sg-t-story-label', { text: self.opts.timelineStoryLabel }));
      story.appendChild(el('p', 'sg-t-story-text', { text: t.story }));
      story.appendChild(el('button', 'sg-t-story-close', { type: 'button', text: self.opts.timelineCollapse }));
      item.appendChild(story);

      on(item, 'click', function (e) {
        if (e.target.closest('.sg-t-story-close')) {
          self._collapseTlItem(item);
          return;
        }
        self._toggleTlItem(item);
      });
      els.track.appendChild(item);
    });
  };

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
    var track = this._tlEls.track;
    track.style.scrollSnapType = 'none';
    var self = this;
    setTimeout(function () {
      var trackRect = track.getBoundingClientRect();
      var itemRect = item.getBoundingClientRect();
      var offset = itemRect.left - trackRect.left - (trackRect.width - itemRect.width) / 2;
      track.scrollLeft += offset;
      track.style.scrollSnapType = 'x proximity';
      self._updateTlArrows();
    }, 420);
  };

  StarGroup.prototype._collapseTlItem = function (item) {
    item.classList.remove('is-expanded');
    if (this._expandedTlItem === item) this._expandedTlItem = null;
  };

  StarGroup.prototype._updateTlArrows = function () {
    var els = this._tlEls;
    var sl = els.track.scrollLeft;
    var max = els.track.scrollWidth - els.track.clientWidth;
    els.prevPc.classList.toggle('is-hidden', sl <= 5);
    els.nextPc.classList.toggle('is-hidden', sl >= max - 5);
    els.prevMb.classList.toggle('is-hidden', sl <= 5);
    els.nextMb.classList.toggle('is-hidden', sl >= max - 5);
  };

  StarGroup.prototype._buildTlDots = function () {
    var els = this._tlEls;
    var items = els.track.querySelectorAll('.sg-t-item');
    var total = items.length;
    var perPage = this._tlPerPage();
    var pages = Math.max(1, Math.ceil(total / perPage));
    els.dots.innerHTML = '';
    for (var i = 0; i < pages; i++) {
      var d = el('button', 'sg-tl-dot' + (i === 0 ? ' is-active' : ''), { type: 'button' });
      d.dataset.index = String(i);
      (function (idx, pp, t) {
        on(d, 'click', function () {
          var item = t.querySelector('.sg-t-item:not(.is-expanded)') || t.querySelector('.sg-t-item');
          var w = item ? item.offsetWidth + 10 : 0;
          t.scrollTo({ left: idx * w * pp, behavior: 'smooth' });
        });
      })(i, perPage, els.track);
      els.dots.appendChild(d);
    }
  };

  StarGroup.prototype._tlPerPage = function () {
    if (isExtremeSmall()) return 2;
    if (isMobile()) return 2;
    return 3;
  };

  StarGroup.prototype._updateTlLabel = function () {
    var els = this._tlEls;
    var items = els.track.querySelectorAll('.sg-t-item');
    var total = Math.max(1, Math.ceil(items.length / this._tlPerPage()));
    var item = els.track.querySelector('.sg-t-item:not(.is-expanded)') || els.track.querySelector('.sg-t-item');
    var w = item ? item.offsetWidth + 10 : 0;
    var page = 1;
    if (w > 0) {
      page = Math.round(els.track.scrollLeft / (w * this._tlPerPage())) + 1;
      page = Math.max(1, Math.min(page, total));
    }
    els.label.textContent = '第 ' + page + ' / ' + total + ' 页 · ' + this.opts.timelineHeadSub;
    var dots = els.dots.querySelectorAll('.sg-tl-dot');
    Array.prototype.forEach.call(dots, function (d, i) {
      d.classList.toggle('is-active', i === page - 1);
    });
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

    var scrollWrap = el('div', 'sg-ws-scroll-wrap');
    var prev = el('button', 'sg-arrow sg-ws-prev', { type: 'button', 'aria-label': '上一个', text: '‹' });
    var next = el('button', 'sg-arrow sg-ws-next', { type: 'button', 'aria-label': '下一个', text: '›' });
    var carousel = el('div', 'sg-works-carousel');
    var dots = el('div', 'sg-ws-dots');
    scrollWrap.appendChild(prev);
    scrollWrap.appendChild(next);
    scrollWrap.appendChild(carousel);
    scrollWrap.appendChild(dots);
    section.appendChild(scrollWrap);

    var cta = el('button', 'sg-ws-story-cta', { type: 'button', text: this.opts.worksStoryCta });
    section.appendChild(cta);

    var storyPanel = el('div', 'sg-work-story-panel', { hidden: true });
    var storyClose = el('button', 'sg-ws-story-close', { type: 'button', 'aria-label': '关闭故事', html: '&times;' });
    var storyBody = el('div', 'sg-ws-story-body');
    storyPanel.appendChild(storyClose);
    storyPanel.appendChild(storyBody);
    section.appendChild(storyPanel);

    this._worksEls = { carousel: carousel, prev: prev, next: next, dots: dots,
                       cta: cta, storyPanel: storyPanel, storyClose: storyClose, storyBody: storyBody };
    return section;
  };

  StarGroup.prototype._renderWorks = function () {
    var self = this;
    var els = this._worksEls;
    els.carousel.innerHTML = '';
    els.dots.innerHTML = '';
    this._workCards = [];
    this.opts.works.forEach(function (w, i) {
      var card = el('article', 'sg-work-item');
      card.dataset.index = String(i);
      if (w.img) {
        var img = el('img', 'sg-w-img');
        img.src = w.img;
        img.alt = w.alt || w.title;
        img.loading = 'lazy';
        card.appendChild(img);
      }
      var info = el('div', 'sg-work-info');
      info.appendChild(el('span', 'sg-work-year', { text: w.year }));
      info.appendChild(el('b', null, { text: w.title }));
      info.appendChild(el('p', null, { text: w.desc }));
      card.appendChild(info);

      on(card, 'click', function () {
        var idx = Number(this.dataset.index);
        if (idx === self._workIdx) {
          self._openWorkStory(idx);
        } else {
          self._goToWork(idx);
        }
      });
      els.carousel.appendChild(card);
      self._workCards.push(card);

      var d = el('button', 'sg-ws-dot' + (i === 0 ? ' is-active' : ''), { type: 'button' });
      d.setAttribute('aria-label', '第 ' + (i + 1) + ' 个作品');
      (function (idx) { on(d, 'click', function () { self._goToWork(idx); }); })(i);
      els.dots.appendChild(d);
    });
    this._updateWorksLayout();
  };

  StarGroup.prototype._updateWorksLayout = function () {
    var cards = this._workCards || [];
    var total = cards.length;
    var self = this;
    cards.forEach(function (card, i) {
      card.classList.remove('is-center', 'is-prev-side', 'is-next-side', 'is-prev-far', 'is-next-far');
      if (i === self._workIdx) {
        card.classList.add('is-center');
      } else if (i === (self._workIdx - 1 + total) % total) {
        card.classList.add('is-prev-side');
      } else if (i === (self._workIdx + 1) % total) {
        card.classList.add('is-next-side');
      } else if (i === (self._workIdx - 2 + total) % total) {
        card.classList.add('is-prev-far');
      } else if (i === (self._workIdx + 2) % total) {
        card.classList.add('is-next-far');
      }
    });
    var dots = this._worksEls.dots.querySelectorAll('.sg-ws-dot');
    Array.prototype.forEach.call(dots, function (d, i) {
      d.classList.toggle('is-active', i === self._workIdx);
    });
  };

  StarGroup.prototype._goToWork = function (idx) {
    this._workIdx = idx;
    this._updateWorksLayout();
    this._restartWorksAutoPlay();
  };

  StarGroup.prototype._nextWork = function () {
    if (!this._workCards || this._workCards.length === 0) return;
    this._workIdx = (this._workIdx + 1) % this._workCards.length;
    this._updateWorksLayout();
  };
  StarGroup.prototype._prevWork = function () {
    if (!this._workCards || this._workCards.length === 0) return;
    var total = this._workCards.length;
    this._workIdx = (this._workIdx - 1 + total) % total;
    this._updateWorksLayout();
  };

  StarGroup.prototype._startWorksAutoPlay = function () {
    var self = this;
    this._stopWorksAutoPlay();
    if (!this._workCards || this._workCards.length === 0) return;
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
    var w = this.opts.works[idx];
    if (!w) return;
    var body = this._worksEls.storyBody;
    body.innerHTML = '';
    if (w.img) {
      body.appendChild(el('img', 'sg-ws-story-cover'));
      body.querySelector('.sg-ws-story-cover').src = w.img;
      body.querySelector('.sg-ws-story-cover').alt = w.alt || w.title;
    }
    var content = el('div', 'sg-ws-story-content');
    content.appendChild(el('span', 'sg-ws-year', { text: w.year }));
    content.appendChild(el('h3', null, { text: w.title }));
    content.appendChild(el('div', 'sg-ws-story-divider'));
    content.appendChild(el('span', 'sg-ws-story-label', { text: this.opts.worksStoryLabel }));
    content.appendChild(el('p', 'sg-ws-story-text', { text: w.story }));
    body.appendChild(content);
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
   * 6) 资料与成员 Modal
   * ============================================================ */
  StarGroup.prototype._buildMoreModal = function () {
    var self = this;
    var overlay = el('div', 'sg-modal-overlay', { id: 'sg-modal', role: 'dialog', 'aria-modal': 'true' });
    overlay.setAttribute('aria-labelledby', 'sg-modal-title');
    overlay.hidden = true;
    var card = el('div', 'sg-modal-card');
    var xBtn = el('button', 'sg-modal-x-btn', { type: 'button', 'aria-label': '关闭', html: '&times;' });
    var head = el('div', 'sg-modal-head');
    head.appendChild(el('h3', null, { id: 'sg-modal-title', text: this.opts.moreTitle }));
    if (this.opts.moreSub) card.appendChild(el('p', 'sg-modal-sub', { text: this.opts.moreSub }));
    var body = el('div', 'sg-modal-body');
    this.opts.moreFacts.forEach(function (f) {
      var row = el('div', 'sg-m-row' + (f.full ? ' full' : ''));
      row.appendChild(el('small', null, { text: f.label }));
      row.appendChild(el('span', null, { text: f.value }));
      body.appendChild(row);
    });
    var foot = el('div', 'sg-modal-foot');
    foot.appendChild(el('span', 'sg-modal-decl', { text: this.opts.moreDecl }));
    card.appendChild(xBtn);
    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(foot);
    overlay.appendChild(card);

    on(xBtn, 'click', function () { self._closeModal(); });
    on(overlay, 'click', function (e) { if (e.target === overlay) self._closeModal(); });
    return overlay;
  };

  StarGroup.prototype._openModal = function () {
    var tabMore = this.root.querySelector('#sg-tab-more');
    this._modalOverlay.hidden = false;
    this._modalOverlay.classList.add('open');
    if (tabMore) {
      tabMore.setAttribute('aria-selected', 'true');
      tabMore.setAttribute('aria-expanded', 'true');
    }
  };
  StarGroup.prototype._closeModal = function () {
    var tabMore = this.root.querySelector('#sg-tab-more');
    this._modalOverlay.classList.remove('open');
    this._modalOverlay.hidden = true;
    if (tabMore) {
      tabMore.setAttribute('aria-selected', 'false');
      tabMore.setAttribute('aria-expanded', 'false');
    }
  };

  StarGroup.prototype._openMemberModal = function (m) {
    var self = this;
    if (!this._memberModalOverlay) return;
    var overlay = this._memberModalOverlay;
    var card = overlay.querySelector('.sg-modal-card');
    card.innerHTML = '';
    var xBtn = el('button', 'sg-modal-x-btn', { type: 'button', 'aria-label': '关闭', html: '&times;' });
    var head = el('div', 'sg-modal-head');
    head.appendChild(el('h3', null, { text: this.opts.memberModalTitle }));
    var body = el('div', 'sg-modal-body');

    var mdmHead = el('div', 'sg-mdm-header');
    var avatar = el('div', 'sg-mdm-avatar ' + (m.color || ''));
    if (m.img) {
      var img = el('img');
      img.src = m.img;
      img.alt = m.name;
      avatar.appendChild(img);
    } else {
      avatar.textContent = m.shortName || m.name.charAt(0);
    }
    var headText = el('div', 'sg-mdm-head-text');
    headText.appendChild(el('b', null, { text: m.name }));
    headText.appendChild(el('span', null, { text: stripRolePrefix(m.role) }));
    mdmHead.appendChild(avatar);
    mdmHead.appendChild(headText);
    body.appendChild(mdmHead);

    (m.relations || []).forEach(function (row) {
      var r = el('div', 'sg-m-row');
      r.appendChild(el('small', null, { text: row[0] }));
      r.appendChild(el('span', null, { text: row[1] }));
      body.appendChild(r);
    });

    var foot = el('div', 'sg-modal-foot');
    foot.appendChild(el('span', 'sg-modal-decl', { text: this.opts.memberModalDecl }));
    card.appendChild(xBtn);
    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(foot);
    overlay.hidden = false;
    overlay.classList.add('open');

    on(xBtn, 'click', function () { self._closeMemberModal(); });
  };
  StarGroup.prototype._closeMemberModal = function () {
    if (!this._memberModalOverlay) return;
    this._memberModalOverlay.classList.remove('open');
    this._memberModalOverlay.hidden = true;
  };

  /* ============================================================
   * 7) Tab 切换
   * ============================================================ */
  StarGroup.prototype._onTabClick = function (t) {
    if (t.more) {
      if (this._modalOverlay.hidden) this._openModal();
      else this._closeModal();
      return;
    }
    var self = this;
    var tabs = this.root.querySelectorAll('.sg-tab-bar .sg-tab');
    Array.prototype.forEach.call(tabs, function (tab) {
      var isMore = tab.id === 'sg-tab-more';
      if (isMore) {
        tab.setAttribute('aria-selected', 'false');
        tab.setAttribute('aria-expanded', 'false');
        return;
      }
      var isActive = tab.id === 'sg-tab-' + t.id;
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    ['members', 'timeline', 'works'].forEach(function (id) {
      var p = self.root.querySelector('#sg-panel-' + id);
      if (!p) return;
      var active = id === t.id;
      p.hidden = !active;
      p.classList.toggle('active', active);
    });
    if (t.id === 'timeline') {
      var self2 = this;
      raf(function () {
        self2._tlEls.track.scrollTo({ left: 0, behavior: 'auto' });
        raf(function () { self2._updateTlArrows(); self2._updateTlLabel(); });
      });
    }
    if (t.id === 'works') {
      this._startWorksAutoPlay();
    } else {
      this._stopWorksAutoPlay();
    }
    if (!this._modalOverlay.hidden) this._closeModal();
  };

  /* ============================================================
   * 8) 主题应用
   * ============================================================ */
  function applyTheme(frame, theme) {
    if (!theme) return;
    for (var k in theme) {
      var varName = k.indexOf('sg-') === 0 ? k : '--sg-' + k;
      frame.style.setProperty(varName, theme[k]);
    }
  }

  /* ============================================================
   * 9) 挂载后初始化
   * ============================================================ */
  StarGroup.prototype._afterMount = function () {
    var self = this;

    // 构建 Modal（页面级，放在 frame 外）
    this._modalOverlay = this._buildMoreModal();
    this.root.appendChild(this._modalOverlay);

    // 成员详情 Modal（小屏）
    var mmOverlay = el('div', 'sg-modal-overlay sg-member-detail-modal', { id: 'sg-member-modal', role: 'dialog', 'aria-modal': 'true' });
    mmOverlay.hidden = true;
    var mmCard = el('div', 'sg-modal-card');
    mmOverlay.appendChild(mmCard);
    this.root.appendChild(mmOverlay);
    this._memberModalOverlay = mmOverlay;

    // 渲染成员
    if (this.opts.members.length > 0) {
      this._memberSelected = this.opts.members[0].key;
      this._renderMemberPage(1);
      on(this._memberEls.prev, 'click', function () { self._goToPage(self._memberPage - 1); });
      on(this._memberEls.next, 'click', function () { self._goToPage(self._memberPage + 1); });
      var stage = this._memberEls.stage;
      on(stage, 'click', function () { self._stopAutoPlay(); });
      on(stage, 'touchstart', function () { self._stopAutoPlay(); });
      on(this._memberEls.grid, 'click', function () { self._stopAutoPlay(); });
      this._startAutoPlay();
    }

    // 渲染时间线
    if (this.opts.timeline.length > 0) {
      this._renderTimeline();
      this._buildTlDots();
      var tl = this._tlEls;
      on(tl.prevPc, 'click', function () { self._scrollTl(-1); });
      on(tl.nextPc, 'click', function () { self._scrollTl(1); });
      on(tl.prevMb, 'click', function () { self._scrollTl(-1); });
      on(tl.nextMb, 'click', function () { self._scrollTl(1); });
      on(tl.track, 'scroll', function () { self._updateTlArrows(); self._updateTlLabel(); });
      raf(function () { self._updateTlArrows(); self._updateTlLabel(); });
    }

    // 渲染作品
    if (this.opts.works.length > 0) {
      this._renderWorks();
      var we = this._worksEls;
      on(we.prev, 'click', function () { self._prevWork(); self._restartWorksAutoPlay(); });
      on(we.next, 'click', function () { self._nextWork(); self._restartWorksAutoPlay(); });
      on(we.cta, 'click', function () { self._openWorkStory(self._workIdx); });
      on(we.storyClose, 'click', function () { self._closeWorkStory(); });
      on(we.storyPanel, 'click', function (e) { if (e.target === we.storyPanel) self._closeWorkStory(); });
      on(we.carousel, 'mouseenter', function () { self._stopWorksAutoPlay(); });
      on(we.carousel, 'mouseleave', function () { self._startWorksAutoPlay(); });
    }

    // ESC 关闭
    on(document, 'keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!self._modalOverlay.hidden) self._closeModal();
      else if (!self._memberModalOverlay.hidden) self._closeMemberModal();
      else if (!self._worksEls.storyPanel.hidden) self._closeWorkStory();
      else if (self._expandedTlItem) self._collapseTlItem(self._expandedTlItem);
    });

    // resize
    on(global, 'resize', function () {
      if (self.opts.timeline.length > 0) {
        self._buildTlDots();
        self._updateTlArrows();
        self._updateTlLabel();
      }
    });

    // more tab 初始
    var tabMore = this.root.querySelector('#sg-tab-more');
    if (tabMore) tabMore.setAttribute('aria-expanded', 'false');
  };

  StarGroup.prototype._scrollTl = function (dir) {
    var els = this._tlEls;
    var perPage = this._tlPerPage();
    var item = els.track.querySelector('.sg-t-item:not(.is-expanded)') || els.track.querySelector('.sg-t-item');
    var w = item ? item.offsetWidth + 10 : 0;
    els.track.scrollBy({ left: dir * w * perPage, behavior: 'smooth' });
  };

  /* ============================================================
   * 静态 API
   * ============================================================ */
  StarGroup.mount = function (container, options) {
    var inst = new StarGroup(options);
    inst.mount(container);
    return inst;
  };
  StarGroup.create = function (options) {
    var inst = new StarGroup(options);
    return inst.create();
  };

  global.StarGroup = StarGroup;

})(typeof window !== 'undefined' ? window : this);
