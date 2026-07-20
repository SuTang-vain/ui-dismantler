/* ============================================================
 * gan.js — 鳡特征互动观察 渲染引擎
 *
 *   window.Gan.mount(container, options)  // 挂载到容器
 *   window.Gan.create(options)            // 创建并返回 DOM
 *
 * 范式：双视图画框（特征图鉴 + 体型对比）+ 物种切换栏 + 详情/对比 Modal
 * 数据驱动：subject/competitors/hotspots/dimensions/imageMeta 全走 options
 * A11y：tablist/tab/tabpanel、dialog aria-modal + ESC、aria-label、aria-live
 * 零依赖：雷达图用纯 CSS 条形图实现，不引 Chart.js
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 工具函数 ---------- */
  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) {
      for (var k in attrs) {
        if (k === 'text') { n.textContent = attrs[k]; }
        else if (k === 'html') { n.innerHTML = attrs[k]; }
        else if (k === 'dataset') { for (var d in attrs[k]) n.dataset[d] = attrs[k][d]; }
        else n.setAttribute(k, attrs[k]);
      }
    }
    return n;
  }
  function on(node, evt, fn, opts) { node.addEventListener(evt, fn, opts); }
  function isMobile() { return global.innerWidth <= 600 || global.innerHeight <= 420; }
  function isExtremeSmall() { return global.innerWidth <= 340 || global.innerHeight <= 380; }
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
  function parseLengthCm(value) {
    return parseFloat(String(value).replace(/[^\d.]/g, '')) || 0;
  }
  function bindImg(img, fallbackText) {
    if (!img) return;
    on(img, 'load', function () { img.classList.add('is-loaded'); });
    on(img, 'error', function () {
      img.classList.add('is-error');
      var ph = img.parentElement;
      if (ph && fallbackText) {
        ph.classList.add('is-error');
        ph.setAttribute('data-fallback', fallbackText.charAt(0));
      }
    });
  }

  /* ---------- 默认配置 ---------- */
  var DEFAULTS = {
    title: '物种对比图鉴',
    subject: {
      key: 'main',
      name: '',
      imageFront: '',
      imageSide: '',
      stats: {},                 // dimensions 各项真实值
      imageMeta: { contentW: 470, contentH: 134 }  // 主图内容尺寸（用于 scaleX 换算）
    },
    competitors: [],             // [{ key, name, image, stats, chartScores, imageMeta }]
    subjectChartScores: [],
    dimensions: [],
    hotspots: [],                // [{ id, pose, left, top, title, subtitle, text, zoomImage, zoomLeft, zoomTop, zoomSize }]
    compareWidthPct: 60.6,       // 对比图固定宽度 %
    disclaimer: '体型对比作为参考，具体因个体不同有略微差异',
    chartLegend: { base: '主角', target: '对比物种' },
    defaultCompetitorIdx: 0,
    theme: {}
  };

  /* ---------- 主类 ---------- */
  function Gan(options) {
    this.opts = deepMerge({}, DEFAULTS, options || {});
    this.root = null;
    this.currentView = 0;
    this.currentPose = 0;
    this.currentCompetitorIdx = this.opts.defaultCompetitorIdx || 0;
    this._resizeTimer = null;
    this._lastMobile = false;
  }

  Gan.prototype.create = function () {
    var root = el('div', 'sg-frame');
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', this.opts.title);
    root.appendChild(this._buildMain());
    root.appendChild(this._buildSwitchBar());
    root.appendChild(this._buildModal());
    this.root = root;
    return root;
  };

  Gan.prototype.mount = function (container) {
    var node = this.create();
    (container || document.body).appendChild(node);
    this._afterMount();
    return node;
  };

  /* ---------- 主区：双视图 ---------- */
  Gan.prototype._buildMain = function () {
    var main = el('main', 'sg-main');
    main.appendChild(this._buildFeatureView());
    main.appendChild(this._buildCompareView());
    return main;
  };

  Gan.prototype._buildFeatureView = function () {
    var view = el('div', 'sg-view feature active', {
      role: 'tabpanel', id: 'sg-view-feature', 'aria-label': '特征图鉴'
    });
    var panel = el('div', 'sg-panel sg-panel-visual');

    var ruler = el('div', 'sg-ruler', { 'aria-hidden': 'true' });
    [0, 25, 50, 75, 100].forEach(function (p, i) {
      ruler.appendChild(el('div', 'sg-ruler-tick' + (i % 2 === 0 ? ' major' : ''), { style: 'top:' + p + '%;' }));
    });
    panel.appendChild(ruler);
    panel.appendChild(el('div', 'sg-length-axis', { 'aria-hidden': 'true' }));

    var self = this;
    var poses = this._getPoses();
    var poseTabs = el('div', 'sg-pose-tabs', { role: 'tablist', 'aria-label': '视角切换' });
    poses.forEach(function (p, i) {
      var tab = el('button', 'sg-pose-tab' + (i === 0 ? ' active' : ''), {
        text: p.label, type: 'button', role: 'tab',
        id: 'sg-pose-' + i,
        'aria-selected': i === 0 ? 'true' : 'false',
        'aria-controls': 'sg-lynx-stage'
      });
      tab.dataset.idx = i;
      on(tab, 'click', function () { self._switchPose(i); });
      poseTabs.appendChild(tab);
    });
    panel.appendChild(poseTabs);

    var stage = el('div', 'sg-lynx-stage', { id: 'sg-lynx-stage', role: 'tabpanel', 'aria-labelledby': 'sg-pose-0' });
    poses.forEach(function (p, i) {
      var fig = el('div', 'sg-lynx-figure' + (i === 0 ? ' active' : ''));
      fig.dataset.idx = i;
      var img = el('img', '', { alt: p.alt, loading: 'lazy', decoding: 'async' });
      img.src = p.image;
      bindImg(img, p.alt);
      fig.appendChild(img);
      stage.appendChild(fig);
    });
    panel.appendChild(stage);
    view.appendChild(panel);
    return view;
  };

  Gan.prototype._getPoses = function () {
    var s = this.opts.subject;
    return [
      { label: '正面', image: s.imageFront, alt: s.name + '正面' },
      { label: '侧面', image: s.imageSide, alt: s.name + '侧面' }
    ];
  };

  Gan.prototype._renderHotspots = function () {
    var stage = this.root.querySelector('#sg-lynx-stage');
    if (!stage) return;
    stage.querySelectorAll('.sg-lynx-figure').forEach(function (fig) {
      fig.querySelectorAll('.sg-hotspot').forEach(function (h) { h.remove(); });
    });
    var poseKey = this.currentPose === 0 ? 'front' : 'side';
    var self = this;
    this.opts.hotspots.forEach(function (h) {
      if (h.pose !== poseKey) return;
      var fig = stage.querySelectorAll('.sg-lynx-figure')[self.currentPose];
      if (!fig) return;
      var spot = el('div', 'sg-hotspot', {
        role: 'button', tabindex: '0',
        'aria-label': '查看' + h.title + '详情',
        title: h.title,
        style: 'left:' + h.left + '%;top:' + h.top + '%;'
      });
      spot.dataset.id = h.id;
      on(spot, 'click', function () { self._showDetail(h.id); });
      on(spot, 'keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self._showDetail(h.id); }
      });
      fig.appendChild(spot);
    });
  };

  Gan.prototype._buildCompareView = function () {
    var view = el('div', 'sg-view compare', {
      role: 'tabpanel', id: 'sg-view-compare', 'aria-label': '体型对比', hidden: 'hidden'
    });
    var self = this;
    var visual = el('div', 'sg-panel sg-panel-visual');
    var detailBtn = el('button', 'sg-compare-detail-btn', {
      text: '详细对比', type: 'button',
      'aria-label': '查看参数详细对比', 'aria-haspopup': 'dialog'
    });
    on(detailBtn, 'click', function () { self._showCompareDetail(); });
    visual.appendChild(detailBtn);

    var stage = el('div', 'sg-compare-stage');
    var baseRow = el('div', 'sg-compare-row');
    baseRow.appendChild(el('div', 'sg-compare-axis-label base', { text: this.opts.subject.name }));
    var baseTrack = el('div', 'sg-compare-track');
    var baseAnimal = el('div', 'sg-compare-animal', {
      'data-key': this.opts.subject.key,
      style: 'width:' + this.opts.compareWidthPct + '%;'
    });
    var baseImg = el('img', '', { alt: this.opts.subject.name + '对比图', loading: 'lazy', decoding: 'async' });
    baseImg.src = this.opts.subject.imageSide;
    bindImg(baseImg, this.opts.subject.name);
    baseAnimal.appendChild(baseImg);
    baseTrack.appendChild(baseAnimal);
    baseRow.appendChild(baseTrack);
    stage.appendChild(baseRow);

    var targetRow = el('div', 'sg-compare-row');
    targetRow.appendChild(el('div', 'sg-compare-axis-label', { id: 'sg-compare-target-name', text: '' }));
    var targetTrack = el('div', 'sg-compare-track');
    var targetAnimal = el('div', 'sg-compare-animal', {
      id: 'sg-compare-target-container', 'data-key': '',
      style: 'width:' + this.opts.compareWidthPct + '%;'
    });
    var targetImg = el('img', '', { id: 'sg-compare-target-img', alt: '对比图', loading: 'lazy', decoding: 'async' });
    bindImg(targetImg, '');
    targetAnimal.appendChild(targetImg);
    targetTrack.appendChild(targetAnimal);
    targetRow.appendChild(targetTrack);
    stage.appendChild(targetRow);

    var shared = el('div', 'sg-compare-shared-axis', { 'aria-hidden': 'true' });
    shared.appendChild(el('div', ''));
    var sharedTrack = el('div', 'sg-compare-track');
    sharedTrack.appendChild(el('div', 'sg-compare-length-axis'));
    shared.appendChild(sharedTrack);
    stage.appendChild(shared);
    stage.appendChild(el('div', 'sg-compare-disclaimer', { text: this.opts.disclaimer }));
    visual.appendChild(stage);
    view.appendChild(visual);
    view.appendChild(this._buildCompareDetailPanel());
    return view;
  };

  Gan.prototype._buildCompareDetailPanel = function () {
    var panel = el('div', 'sg-panel sg-panel-detail is-drawer');
    panel.id = 'sg-compare-detail';
    var handle = el('div', 'sg-drawer-handle', { role: 'button', tabindex: '0', 'aria-label': '展开或收起对比详情' });
    handle.appendChild(el('div', 'sg-drawer-handle-bar'));
    handle.appendChild(el('span', 'sg-drawer-handle-text'));
    var self = this;
    on(handle, 'click', function () { panel.classList.toggle('expanded'); });
    on(handle, 'keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); panel.classList.toggle('expanded'); }
    });
    panel.appendChild(handle);

    var section = el('div', 'sg-data-section');
    var chartWrap = el('div', 'sg-chart-wrapper', { 'aria-label': '能力对比图' });
    chartWrap.appendChild(el('div', 'sg-radar', { id: 'sg-radar' }));
    chartWrap.appendChild(el('div', 'sg-radar-legend', {
      html: '<span class="lg-base">' + this.opts.chartLegend.base + '</span><span class="lg-target">' + this.opts.chartLegend.target + '</span>'
    }));
    section.appendChild(chartWrap);
    section.appendChild(el('div', 'sg-stats-list', { id: 'sg-stats-grid' }));
    panel.appendChild(section);
    return panel;
  };

  Gan.prototype._buildSwitchBar = function () {
    var bar = el('div', 'sg-switch-bar');
    var group = el('div', 'sg-switch-group');
    var items = el('div', 'sg-switch-items');
    var self = this;

    var featureBtn = el('div', 'sg-switch-item feature active', {
      role: 'tab', tabindex: '0',
      'aria-selected': 'true',
      'aria-controls': 'sg-view-feature',
      'aria-label': '查看' + this.opts.subject.name + '特征'
    });
    featureBtn.id = 'sg-switch-feature';
    var fImg = el('img', 'sg-switch-avatar', { alt: this.opts.subject.name, loading: 'lazy', decoding: 'async' });
    fImg.src = this.opts.subject.imageFront;
    bindImg(fImg, this.opts.subject.name);
    featureBtn.appendChild(fImg);
    featureBtn.appendChild(el('span', 'sg-switch-name', { text: this.opts.subject.name }));
    on(featureBtn, 'click', function () { self._switchToFeature(); });
    on(featureBtn, 'keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self._switchToFeature(); }
    });
    items.appendChild(featureBtn);

    this.opts.competitors.forEach(function (c, i) {
      var item = el('div', 'sg-switch-item' + (i === self.currentCompetitorIdx ? ' active' : ''), {
        role: 'tab', tabindex: '0',
        'aria-selected': i === self.currentCompetitorIdx ? 'true' : 'false',
        'aria-controls': 'sg-view-compare',
        'aria-label': '对比' + c.name
      });
      item.id = 'sg-switch-comp-' + i;
      item.dataset.key = c.key;
      item.dataset.idx = i;
      var img = el('img', 'sg-switch-avatar', { alt: c.name, loading: 'lazy', decoding: 'async' });
      img.src = c.image;
      bindImg(img, c.name);
      item.appendChild(img);
      item.appendChild(el('span', 'sg-switch-name', { text: c.name }));
      on(item, 'click', function () { self._switchToCompare(i); });
      on(item, 'keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self._switchToCompare(i); }
      });
      items.appendChild(item);
    });

    group.appendChild(items);
    bar.appendChild(group);
    return bar;
  };

  Gan.prototype._buildModal = function () {
    var overlay = el('div', 'sg-modal-overlay', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '详情' });
    overlay.id = 'sg-modal-overlay';
    var content = el('div', 'sg-modal-content', { id: 'sg-modal-content' });
    var close = el('button', 'sg-modal-close', { text: '×', type: 'button', 'aria-label': '关闭' });
    content.appendChild(close);
    var header = el('div', 'sg-modal-header');
    header.appendChild(el('h3', 'sg-modal-title', { id: 'sg-modal-title' }));
    header.appendChild(el('p', 'sg-modal-subtitle', { id: 'sg-modal-subtitle' }));
    content.appendChild(header);
    var layout = el('div', 'sg-modal-detail-layout');
    var zoom = el('div', 'sg-modal-zoom', { id: 'sg-modal-zoom' });
    zoom.appendChild(el('img', '', { id: 'sg-modal-zoom-img', alt: '放大图' }));
    layout.appendChild(zoom);
    layout.appendChild(el('p', 'sg-modal-text', { id: 'sg-modal-text' }));
    content.appendChild(layout);
    content.appendChild(el('div', 'sg-modal-compare-list', { id: 'sg-modal-compare-list' }));
    overlay.appendChild(content);
    var self = this;
    on(close, 'click', function () { self._closeModal(); });
    on(overlay, 'click', function (ev) { if (ev.target === overlay) self._closeModal(); });
    return overlay;
  };

  /* ---------- 视图/视角/物种切换 ---------- */
  Gan.prototype._switchView = function (idx) {
    this.currentView = idx;
    var views = this.root.querySelectorAll('.sg-view');
    views.forEach(function (v, i) {
      var on = i === idx;
      v.classList.toggle('active', on);
      if (on) v.removeAttribute('hidden'); else v.setAttribute('hidden', 'hidden');
    });
    var featureBtn = this.root.querySelector('#sg-switch-feature');
    if (featureBtn) featureBtn.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
    this.root.querySelectorAll('.sg-switch-item:not(.feature)').forEach(function (c) { c.setAttribute('aria-selected', 'false'); });
    if (idx === 1) {
      var cur = this.root.querySelector('#sg-switch-comp-' + this.currentCompetitorIdx);
      if (cur) cur.setAttribute('aria-selected', 'true');
    }
  };

  Gan.prototype._switchToFeature = function () {
    this._switchView(0);
    var featureBtn = this.root.querySelector('#sg-switch-feature');
    if (featureBtn) featureBtn.classList.add('active');
    this.root.querySelectorAll('.sg-switch-item:not(.feature)').forEach(function (c) { c.classList.remove('active'); });
  };

  Gan.prototype._switchToCompare = function (compIdx) {
    this.currentCompetitorIdx = compIdx;
    this._switchView(1);
    var featureBtn = this.root.querySelector('#sg-switch-feature');
    if (featureBtn) featureBtn.classList.remove('active');
    this.root.querySelectorAll('.sg-switch-item:not(.feature)').forEach(function (c, i) {
      c.classList.toggle('active', i === compIdx);
    });
    this._selectCompetitor(compIdx);
  };

  Gan.prototype._switchPose = function (idx) {
    this.currentPose = idx;
    var figs = this.root.querySelectorAll('.sg-lynx-figure');
    figs.forEach(function (fig, i) { fig.classList.toggle('active', i === idx); });
    var tabs = this.root.querySelectorAll('.sg-pose-tab');
    tabs.forEach(function (t, i) {
      t.classList.toggle('active', i === idx);
      t.setAttribute('aria-selected', i === idx ? 'true' : 'false');
    });
    this._renderHotspots();
  };

  /* ---------- 对比物种切换 ---------- */
  Gan.prototype._selectCompetitor = function (idx) {
    var c = this.opts.competitors[idx];
    if (!c) return;
    var targetImg = this.root.querySelector('#sg-compare-target-img');
    var targetContainer = this.root.querySelector('#sg-compare-target-container');
    var targetName = this.root.querySelector('#sg-compare-target-name');
    targetImg.style.opacity = 0;
    targetImg.src = c.image;
    targetImg.alt = c.name + '对比图';
    targetContainer.dataset.key = c.key;
    targetName.textContent = c.name;
    this._renderRadar(c.chartScores || []);
    this._renderStats(c);
    var live = this.root.querySelector('#sg-aria-live');
    if (live) live.textContent = '已切换对比物种：' + c.name;
    requestAnimationFrame(function () { targetImg.style.opacity = 1; });
    this._layoutCompare();
  };

  Gan.prototype._renderRadar = function (targetScores) {
    var radar = this.root.querySelector('#sg-radar');
    if (!radar) return;
    radar.innerHTML = '';
    var dims = this.opts.dimensions;
    var baseScores = this.opts.subjectChartScores || [];
    dims.forEach(function (dim, i) {
      var row = el('div', 'sg-radar-row');
      row.appendChild(el('div', 'sg-radar-label', { text: dim }));
      var bars = el('div', 'sg-radar-bars');
      bars.appendChild(el('div', 'sg-radar-axis', { 'aria-hidden': 'true' }));
      var baseBar = el('div', 'sg-radar-bar base'); baseBar.style.width = '0%';
      bars.appendChild(baseBar);
      var tgtBar = el('div', 'sg-radar-bar target'); tgtBar.style.width = '0%';
      bars.appendChild(tgtBar);
      row.appendChild(bars);
      radar.appendChild(row);
      requestAnimationFrame(function () {
        baseBar.style.width = (baseScores[i] || 0) + '%';
        tgtBar.style.width = (targetScores[i] || 0) + '%';
      });
    });
  };

  Gan.prototype._renderStats = function (competitor) {
    var grid = this.root.querySelector('#sg-stats-grid');
    if (!grid) return;
    grid.innerHTML = '';
    var subj = this.opts.subject;
    var header = el('div', 'sg-stat-row sg-is-header');
    header.appendChild(el('span', 'sg-stat-label', { text: '' }));
    header.appendChild(el('span', 'sg-stat-lynx', { text: subj.name }));
    header.appendChild(el('span', 'sg-stat-vs', { text: 'VS', style: 'opacity:0;' }));
    header.appendChild(el('span', 'sg-stat-target', { text: competitor.name }));
    grid.appendChild(header);
    this.opts.dimensions.forEach(function (dim, i) {
      var row = el('div', 'sg-stat-row');
      row.appendChild(el('span', 'sg-stat-label', { text: dim }));
      row.appendChild(el('span', 'sg-stat-lynx', { text: subj.stats['d' + (i + 1)] || '' }));
      row.appendChild(el('span', 'sg-stat-vs', { text: 'VS' }));
      row.appendChild(el('span', 'sg-stat-target', { text: competitor.stats['d' + (i + 1)] || '' }));
      grid.appendChild(row);
    });
  };

  /* 对比图布局：固定宽度 + scaleX 体长比例缩放（复刻原案例逻辑） */
  Gan.prototype._layoutCompare = function () {
    var trackEl = this.root.querySelector('.sg-compare-row .sg-compare-track');
    if (!trackEl) return;
    var trackW = trackEl.clientWidth || 350;
    var trackH = trackEl.clientHeight || 140;
    if (isMobile()) {
      var ratio = 110 / 140;
      this.root.querySelectorAll('.sg-compare-stage .sg-compare-animal').forEach(function (el) {
        el.style.width = (this.opts.compareWidthPct * ratio) + '%';
      }.bind(this));
    } else {
      this.root.querySelectorAll('.sg-compare-stage .sg-compare-animal').forEach(function (el) {
        el.style.width = this.opts.compareWidthPct + '%';
      }.bind(this));
    }
    var subj = this.opts.subject;
    var comp = this.opts.competitors[this.currentCompetitorIdx];
    var mainLen = parseLengthCm(subj.stats.d1);
    var targetLen = comp ? parseLengthCm(comp.stats.d1) : mainLen;
    var mainMeta = subj.imageMeta || { contentW: 470, contentH: 134 };
    var meta = (comp && comp.imageMeta) || mainMeta;
    var mainContainerW = trackW * this.opts.compareWidthPct / 100;
    var mainScale = Math.min(mainContainerW / 500, trackH / 500);
    var mainFishW = mainMeta.contentW * mainScale;
    var targetFishW = mainLen ? mainFishW * (targetLen / mainLen) : mainFishW;
    var fitScale = Math.min(mainContainerW / 500, trackH / 500);
    var actualFishW = meta.contentW * fitScale;
    var imageScaleX = actualFishW > 0 ? targetFishW / actualFishW : 1;

    var baseImg = this.root.querySelector('.sg-compare-animal[data-key="' + subj.key + '"] img');
    if (baseImg) {
      baseImg.style.transformOrigin = 'left center';
      baseImg.style.transform = '';
    }
    var targetImg = this.root.querySelector('#sg-compare-target-img');
    if (targetImg) {
      targetImg.style.transformOrigin = 'left center';
      targetImg.style.transform = Math.abs(imageScaleX - 1) < 0.001 ? '' : 'scaleX(' + (+imageScaleX.toFixed(3)) + ')';
    }
  };

  /* ---------- Modal ---------- */
  Gan.prototype._showDetail = function (hotspotId) {
    var h = this.opts.hotspots.filter(function (x) { return x.id === hotspotId; })[0];
    if (!h) return;
    var content = this.root.querySelector('#sg-modal-content');
    var zoom = this.root.querySelector('#sg-modal-zoom');
    var zoomImg = this.root.querySelector('#sg-modal-zoom-img');
    content.classList.remove('is-compare');
    this.root.querySelector('#sg-modal-title').textContent = h.title;
    this.root.querySelector('#sg-modal-subtitle').textContent = h.subtitle || '外形细节说明';
    this.root.querySelector('#sg-modal-text').textContent = h.text;
    this.root.querySelector('#sg-modal-compare-list').innerHTML = '';
    if (h.zoomImage) {
      zoom.classList.add('active');
      var focusLeft = h.zoomLeft !== undefined ? h.zoomLeft : h.left;
      var focusTop = h.zoomTop !== undefined ? h.zoomTop : h.top;
      zoomImg.onload = function () {
        var box = zoom.offsetWidth || 168;
        var sizeMatch = (h.zoomSize || '300% auto').match(/(\d+)%/);
        var scale = sizeMatch ? parseInt(sizeMatch[1], 10) / 100 : 3;
        var imgRatio = zoomImg.naturalHeight / zoomImg.naturalWidth;
        var scaledW = box * scale;
        var scaledH = scaledW * imgRatio;
        var offsetX = box / 2 - scaledW * focusLeft / 100;
        var offsetY = box / 2 - scaledH * focusTop / 100;
        zoomImg.style.transform = 'translate(' + offsetX + 'px,' + offsetY + 'px) scale(' + scale + ')';
      };
      zoomImg.src = h.zoomImage;
    } else {
      zoom.classList.remove('active');
    }
    this._openModal();
  };

  Gan.prototype._showCompareDetail = function () {
    var comp = this.opts.competitors[this.currentCompetitorIdx];
    if (!comp) return;
    var content = this.root.querySelector('#sg-modal-content');
    var list = this.root.querySelector('#sg-modal-compare-list');
    content.classList.add('is-compare');
    this.root.querySelector('#sg-modal-title').textContent = '参数对比';
    this.root.querySelector('#sg-modal-subtitle').textContent = this.opts.subject.name + ' vs ' + comp.name;
    this.root.querySelector('#sg-modal-text').textContent = '';
    this.root.querySelector('#sg-modal-zoom').classList.remove('active');
    list.innerHTML = '';
    var subj = this.opts.subject;
    this.opts.dimensions.forEach(function (dim, i) {
      var row = el('div', 'sg-compare-row-list');
      row.appendChild(el('span', 'sg-compare-label', { text: dim }));
      row.appendChild(el('span', 'sg-compare-lynx', { text: subj.stats['d' + (i + 1)] || '' }));
      row.appendChild(el('span', 'sg-compare-vs', { text: 'VS' }));
      row.appendChild(el('span', 'sg-compare-target', { text: comp.stats['d' + (i + 1)] || '' }));
      list.appendChild(row);
    });
    this._openModal();
  };

  Gan.prototype._openModal = function () {
    var overlay = this.root.querySelector('#sg-modal-overlay');
    overlay.classList.add('active');
    var close = overlay.querySelector('.sg-modal-close');
    if (close) close.focus();
  };
  Gan.prototype._closeModal = function () {
    var overlay = this.root.querySelector('#sg-modal-overlay');
    overlay.classList.remove('active');
    overlay.querySelector('#sg-modal-content').classList.remove('is-compare');
  };

  Gan.prototype._afterMount = function () {
    var self = this;
    applyTheme(this.root, this.opts.theme);

    var live = el('div', 'sg-aria-live', { 'aria-live': 'polite', style: 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);' });
    live.id = 'sg-aria-live';
    this.root.appendChild(live);

    this._renderHotspots();
    this._selectCompetitor(this.currentCompetitorIdx);
    this._layoutCompare();
    this._lastMobile = isMobile();

    on(document, 'keydown', function (e) {
      if (e.key === 'Escape') { self._closeModal(); return; }
      if (self.root.querySelector('#sg-modal-overlay.active')) return;
      if (e.key === 'ArrowLeft' && self.currentView === 1) self._switchToFeature();
      if (e.key === 'ArrowRight' && self.currentView === 0 && self.opts.competitors.length) self._switchToCompare(self.currentCompetitorIdx);
    });

    on(global, 'resize', function () {
      clearTimeout(self._resizeTimer);
      self._resizeTimer = setTimeout(function () {
        self._layoutCompare();
        var nowMobile = isMobile();
        if (nowMobile !== self._lastMobile) {
          self._lastMobile = nowMobile;
          self._renderHotspots();
        }
      }, 150);
    });
  };

  function applyTheme(root, theme) {
    if (!theme) return;
    for (var k in theme) {
      if (k.indexOf('--') === 0) root.style.setProperty(k, theme[k]);
    }
  }

  var API = {
    mount: function (container, options) { return new Gan(options).mount(container); },
    create: function (options) { return new Gan(options).create(); }
  };
  global.Gan = API;
  window.Gan = API;
})(window);
