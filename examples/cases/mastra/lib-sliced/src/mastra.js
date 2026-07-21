(function (global) {
  'use strict';

  /* ---- 工具函数 ---- */
  function el(tag, cls, attrs) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (attrs) {
      for (var k in attrs) {
        if (k === 'html') node.innerHTML = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
      }
    }
    return node;
  }

  function on(node, evt, fn) {
    node.addEventListener(evt, fn);
    return node;
  }

  function deepMerge(target) {
    var sources = Array.prototype.slice.call(arguments, 1);
    sources.forEach(function (src) {
      if (!src || typeof src !== 'object') return;
      Object.keys(src).forEach(function (k) {
        var v = src[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && v.nodeType === undefined) {
          if (!target[k] || typeof target[k] !== 'object') target[k] = {};
          deepMerge(target[k], v);
        } else {
          target[k] = v;
        }
      });
    });
    return target;
  }

  function qs(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function qsa(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }

  // SVG namespace 常量（结构性必需，非业务 URL）
  /* http://www.w3.org/2000/svg 是 SVG 规范要求的 namespace 标识符 */
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        node.setAttribute(k, attrs[k]);
      });
    }
    return node;
  }

  function buildLogoSvg() {
    var svg = svgEl('svg', { fill: 'none', viewBox: '0 0 131 32', style: 'height:24px;width:100px' });
    var path = svgEl('path', {
      fill: 'currentColor',
      d: 'M20 4h6l-6 24H14L10 14l-4 14H0L-4 4h6l4 14z M30 4h6v24h-6z M40 4h6l6 14V4h6v24h-6l-6-14v14h-6z M60 4h18v6h-12v4h10v6h-10v8h-6z M82 4h6l8 24h-6l-2-6h-6l-2 6h-6z M94 4h6v18h10v6H94z'
    });
    svg.appendChild(path);
    return svg;
  }

  /* ---- 默认数据 ---- */
  var DEFAULTS = {
    // 导航栏
    nav: {
      logoSvg: null, // 运行时通过 buildLogoSvg() 构建，可在 options 传入自定义 SVG 元素
      links: [
        { label: 'Product', href: '#product' },
        { label: 'Docs', href: '#docs' },
        { label: 'Pricing', href: '#pricing' },
        { label: 'Blog', href: '#blog' }
      ],
      cta: { label: 'Get Started', href: '#get-started' }
    },

    // Hero 区域
    hero: {
      badge: 'New · v0.5',
      title: 'Workflows. Memory. Harness.<br>Mastra agents have the tools<br>you need to ship fast.',
      subtitle: 'TypeScript AI framework for building production-ready agents. Open source, extensible, and built for teams.',
      primaryCta: { label: 'Get Started', href: '#get-started' },
      secondaryCta: { label: 'View on GitHub', href: '#github' }
    },

    // 特性 Tabs
    tabs: [
      { id: 'agents', label: 'Agents', title: 'Build sophisticated AI agents with ease', desc: 'Create agents with custom tools, memory, and context management. Mastra gives you the building blocks to create production-ready AI agents.', cta: 'Explore Agents' },
      { id: 'workflows', label: 'Workflows', title: 'Orchestrate complex multi-step workflows', desc: 'Define, execute, and monitor workflows that chain multiple AI calls, tools, and human-in-the-loop steps.', cta: 'Explore Workflows' },
      { id: 'harness', label: 'Harness', title: 'Test and evaluate your agents rigorously', desc: 'Built-in testing framework for AI agents. Run evals, measure performance, and iterate with confidence.', cta: 'Explore Harness' },
      { id: 'memory', label: 'Memory', title: 'Persistent context for your agents', desc: 'Give your agents long-term memory with semantic search, conversation history, and state management.', cta: 'Explore Memory' },
      { id: 'server', label: 'Server', title: 'Deploy agents as production APIs', desc: 'Expose your agents via REST APIs, WebSockets, or MCP servers. Built-in observability and monitoring.', cta: 'Explore Server' }
    ],

    // 特性 Tab 面板内容
    tabPanels: {
      agents: {
        features: [
          'Custom tool integration',
          'Context window management',
          'Multi-model support',
          'Streaming responses'
        ]
      },
      workflows: {
        features: [
          'Visual flow builder',
          'Conditional branching',
          'Human-in-the-loop',
          'Error recovery'
        ]
      },
      harness: {
        features: [
          'Automated evals',
          'Performance metrics',
          'Regression testing',
          'Scenario generation'
        ]
      },
      memory: {
        features: [
          'Semantic search',
          'Conversation history',
          'State persistence',
          'Context pruning'
        ]
      },
      server: {
        features: [
          'REST & WebSocket APIs',
          'MCP server support',
          'Rate limiting',
          'Observability dashboards'
        ]
      }
    },

    // 客户故事
    customerStories: [
      { title: 'How Acme Corp built their AI support agent in 2 weeks', desc: 'From zero to production with Mastra workflows and memory.', tag: 'Case Study', wide: true },
      { title: 'StartupX scales customer onboarding with AI', desc: 'Automated 90% of manual onboarding tasks.', tag: 'Case Study' },
      { title: 'EnterpriseY transforms document processing', desc: 'Processing 10,000+ documents daily with AI agents.', tag: 'Case Study' },
      { title: 'DevTeam ships AI features 3x faster', desc: 'Mastra\'s testing harness accelerated their iteration cycle.', tag: 'Case Study' },
      { title: 'GlobalTech deploys AI agents across 12 regions', desc: 'Multi-region, multi-model deployment at scale.', tag: 'Case Study', wide: true },
      { title: 'FinTechZ achieves 99.9% accuracy with evals', desc: 'Continuous evaluation pipeline ensures quality at scale.', tag: 'Case Study' },
      { title: 'HealthAI builds compliant patient intake agents', desc: 'HIPAA-compliant AI agents with audit trails.', tag: 'Case Study' },
      { title: 'EduPlatform personalizes learning at scale', desc: 'AI tutors powered by Mastra memory and context.', tag: 'Case Study' },
      { title: 'LogisticsAI optimizes global supply chains', desc: 'Real-time routing optimization with AI agents.', tag: 'Case Study' }
    ],

    // FAQ
    faq: [
      { q: 'What is Mastra?', a: 'Mastra is a TypeScript AI framework for building production-ready agents. It provides tools for creating agents, orchestrating workflows, managing memory, and deploying at scale.' },
      { q: 'Is Mastra an agent builder?', a: 'Yes, Mastra is a framework for building AI agents. It provides the building blocks — agents, workflows, memory, and tools — to create sophisticated AI applications.' },
      { q: 'What can you build with Mastra?', a: 'You can build AI agents, automated workflows, customer support systems, document processing pipelines, and any application that needs AI-powered decision making.' },
      { q: 'What AI models and providers does Mastra support?', a: 'Mastra supports OpenAI, Anthropic, Google, and other major AI providers through a unified interface, making it easy to switch between models.' },
      { q: 'How do you deploy Mastra applications?', a: 'Mastra applications can be deployed as REST APIs, WebSocket servers, or MCP servers. They work with any Node.js hosting provider.' },
      { q: 'Is Mastra open source?', a: 'Yes, Mastra is open source and available on GitHub. It\'s free to use and community-driven.' }
    ],

    // CTA 区域
    cta: {
      title: 'Empower your customers,<br>turbo-charge your company.',
      desc: 'Mastra agents can do it all. Start building today.',
      placeholder: 'Enter your email',
      button: 'Get Started'
    },

    // 页脚
    footer: {
      brand: 'Mastra',
      desc: 'TypeScript AI Framework for Agents and Apps',
      columns: [
        {
          title: 'Product',
          links: [
            { label: 'Agents', href: '#agents' },
            { label: 'Workflows', href: '#workflows' },
            { label: 'Memory', href: '#memory' },
            { label: 'Pricing', href: '#pricing' }
          ]
        },
        {
          title: 'Resources',
          links: [
            { label: 'Documentation', href: '#docs' },
            { label: 'API Reference', href: '#api' },
            { label: 'GitHub', href: '#github' },
            { label: 'Blog', href: '#blog' }
          ]
        },
        {
          title: 'Company',
          links: [
            { label: 'About', href: '#about' },
            { label: 'Careers', href: '#careers' },
            { label: 'Contact', href: '#contact' },
            { label: 'Privacy', href: '#privacy' }
          ]
        }
      ],
      copyright: '© 2026 Mastra. All rights reserved.',
      social: [
        { label: 'GitHub', href: '#', icon: 'gh' },
        { label: 'Twitter', href: '#', icon: 'tw' }
      ]
    }
  };

  /* ---- Mastra 组件 ---- */
  function Mastra(options) {
    this.opts = deepMerge({}, DEFAULTS, options || {});
    this.root = null;
    this._activeTab = null;
  }

  Mastra.prototype._buildNav = function () {
    var nav = el('nav', 'sg-nav');
    var logo = el('div', 'sg-nav-logo');
    var logoSvg = this.opts.nav.logoSvg || buildLogoSvg();
    logo.appendChild(logoSvg);
    nav.appendChild(logo);

    var links = el('div', 'sg-nav-links');
    this.opts.nav.links.forEach(function (l) {
      var a = el('a', 'sg-nav-link', { href: l.href, text: l.label });
      links.appendChild(a);
    });
    nav.appendChild(links);

    var cta = el('a', 'sg-nav-cta', { href: this.opts.nav.cta.href, text: this.opts.nav.cta.label });
    nav.appendChild(cta);

    return nav;
  };

  Mastra.prototype._buildHero = function () {
    var hero = el('section', 'sg-hero');
    var h = this.opts.hero;

    var badge = el('span', 'sg-hero-badge', { text: h.badge });
    hero.appendChild(badge);

    var title = el('h1', 'sg-hero-title');
    title.innerHTML = h.title;
    hero.appendChild(title);

    var sub = el('p', 'sg-hero-subtitle', { text: h.subtitle });
    hero.appendChild(sub);

    var actions = el('div', 'sg-hero-actions');
    var primary = el('a', 'sg-hero-cta-primary', { href: h.primaryCta.href, text: h.primaryCta.label });
    actions.appendChild(primary);
    var secondary = el('a', 'sg-hero-cta-secondary', { href: h.secondaryCta.href, text: h.secondaryCta.label });
    actions.appendChild(secondary);
    hero.appendChild(actions);

    var visual = el('div', 'sg-hero-visual');
    visual.innerHTML = '<div class="sg-hero-agent-anim" style="padding:40px;text-align:left;color:var(--sg-ds-main-gray);font-family:var(--sg-font-mono);font-size:14px;line-height:1.8"><div style="color:var(--sg-ds-green);margin-bottom:16px">$ npx create-mastra</div><div>> Creating your Mastra project...</div><div>> Agents configured</div><div>> Workflows ready</div><div>> Memory enabled</div><div style="color:var(--sg-ds-green);margin-top:16px">✓ Done! Run <span style="color:var(--sg-ds-main-white)">npm run dev</span> to start</div></div>';
    hero.appendChild(visual);

    return hero;
  };

  Mastra.prototype._buildTabs = function () {
    var section = el('div', 'sg-feature-tabs');
    var tabBar = el('div', 'sg-tab-bar', { role: 'tablist', 'aria-label': 'Feature tabs' });
    var self = this;

    this.opts.tabs.forEach(function (t, i) {
      var btn = el('button', 'sg-tab' + (i === 0 ? ' active' : ''), {
        text: t.label,
        role: 'tab',
        'aria-selected': i === 0 ? 'true' : 'false',
        'aria-controls': 'sg-tab-panel-' + t.id,
        tabindex: i === 0 ? '0' : '-1'
      });
      btn.dataset.tabId = t.id;
      on(btn, 'click', function () { self._switchTab(t.id); });
      on(btn, 'keydown', function (e) {
        var tabs = qsa('.sg-tab', section);
        var idx = tabs.indexOf(btn);
        if (e.key === 'ArrowRight') {
          var next = tabs[(idx + 1) % tabs.length];
          if (next) { next.focus(); self._switchTab(next.dataset.tabId); }
        } else if (e.key === 'ArrowLeft') {
          var prev = tabs[(idx - 1 + tabs.length) % tabs.length];
          if (prev) { prev.focus(); self._switchTab(prev.dataset.tabId); }
        }
      });
      tabBar.appendChild(btn);
    });
    section.appendChild(tabBar);

    // 面板容器
    var panelContainer = el('div', 'sg-tab-panel active', {
      role: 'tabpanel',
      id: 'sg-tab-panel-' + this.opts.tabs[0].id,
      'aria-live': 'polite',
      'aria-label': this.opts.tabs[0].label + ' feature panel'
    });
    var panelContent = this._buildTabPanel(this.opts.tabs[0]);
    panelContainer.appendChild(panelContent);
    panelContainer.dataset.panelFor = this.opts.tabs[0].id;
    section.appendChild(panelContainer);
    this._panelContainer = panelContainer;

    this._activeTab = this.opts.tabs[0].id;
    return section;
  };

  Mastra.prototype._buildTabPanel = function (tab) {
    var content = el('div', 'sg-tab-panel-content');

    var textCol = el('div', 'sg-tab-panel-text');
    var title = el('h2', 'sg-tab-panel-title', { text: tab.title });
    textCol.appendChild(title);
    var desc = el('p', 'sg-tab-panel-desc', { text: tab.desc });
    textCol.appendChild(desc);
    var cta = el('a', 'sg-tab-panel-cta', { href: '#', text: tab.cta + ' →' });
    textCol.appendChild(cta);
    content.appendChild(textCol);

    var visualCol = el('div', 'sg-tab-panel-visual');
    var panelData = this.opts.tabPanels[tab.id];
    if (panelData) {
      var list = el('ul', '', { style: 'list-style:none;gap:12px;display:flex;flex-direction:column;width:100%' });
      panelData.features.forEach(function (f) {
        var li = el('li', '', { style: 'padding:12px 16px;border:1px solid var(--sg-c15t-border);border-radius:8px;color:var(--sg-ds-main-gray);font-size:14px' });
        li.textContent = '✓ ' + f;
        list.appendChild(li);
      });
      visualCol.appendChild(list);
    }
    content.appendChild(visualCol);

    return content;
  };

  Mastra.prototype._switchTab = function (tabId) {
    if (this._activeTab === tabId) return;
    this._activeTab = tabId;

    // 更新 tab 按钮状态
    qsa('.sg-tab', this.root).forEach(function (btn) {
      var isActive = btn.dataset.tabId === tabId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    // 更新面板
    var tab = this.opts.tabs.filter(function (t) { return t.id === tabId; })[0];
    if (tab) {
      var newPanel = el('div', 'sg-tab-panel active', {
        role: 'tabpanel',
        id: 'sg-tab-panel-' + tab.id,
        'aria-live': 'polite',
        'aria-label': tab.label + ' feature panel'
      });
      newPanel.appendChild(this._buildTabPanel(tab));
      newPanel.dataset.panelFor = tabId;
      this._panelContainer.parentNode.replaceChild(newPanel, this._panelContainer);
      this._panelContainer = newPanel;
    }
  };

  Mastra.prototype._buildCardGrid = function () {
    var grid = el('div', 'sg-card-grid');
    var self = this;

    this.opts.customerStories.forEach(function (story) {
      var card = el('a', 'sg-card' + (story.wide ? ' sg-card-wide' : ''), { href: '#' });
      var tag = el('span', 'sg-card-tag', { text: story.tag });
      card.appendChild(tag);
      var title = el('h3', 'sg-card-title', { text: story.title });
      card.appendChild(title);
      var desc = el('p', 'sg-card-desc', { text: story.desc });
      card.appendChild(desc);
      var arrow = el('span', 'sg-card-arrow', { html: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M7 7h10v10"/></svg>' });
      card.appendChild(arrow);
      grid.appendChild(card);
    });

    return grid;
  };

  Mastra.prototype._buildFAQ = function () {
    var faq = el('div', 'sg-faq');
    var self = this;

    this.opts.faq.forEach(function (item) {
      var faqItem = el('details', 'sg-faq-item');
      var summary = el('summary', 'sg-faq-trigger');
      var label = el('span', '', { text: item.q });
      summary.appendChild(label);
      var icon = el('span', 'sg-faq-icon', { html: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4l6 6-6 6"/></svg>' });
      summary.appendChild(icon);
      faqItem.appendChild(summary);

      var panel = el('div', 'sg-faq-panel');
      var answer = el('p', 'sg-faq-answer', { text: item.a });
      panel.appendChild(answer);
      faqItem.appendChild(panel);

      on(faqItem, 'toggle', function () {
        faqItem.classList.toggle('open', faqItem.open);
      });

      faq.appendChild(faqItem);
    });

    return faq;
  };

  Mastra.prototype._buildCTA = function () {
    var section = el('section', 'sg-cta-section');
    var cta = this.opts.cta;
    var title = el('h2', 'sg-cta-title');
    title.innerHTML = cta.title;
    section.appendChild(title);
    var desc = el('p', 'sg-cta-desc', { text: cta.desc });
    section.appendChild(desc);

    var form = el('form', 'sg-cta-form');
    var input = el('input', 'sg-cta-input', { type: 'email', placeholder: cta.placeholder });
    form.appendChild(input);
    var submit = el('button', 'sg-cta-submit', { text: cta.button, type: 'submit' });
    form.appendChild(submit);
    section.appendChild(form);

    return section;
  };

  Mastra.prototype._buildFooter = function () {
    var footer = el('footer', 'sg-footer');
    var ft = this.opts.footer;
    var inner = el('div', 'sg-footer-inner');

    // Brand column
    var brandCol = el('div', 'sg-footer-brand');
    var logoWrap = el('div', 'sg-footer-logo');
    var logoSvg = this.opts.nav.logoSvg || buildLogoSvg();
    logoWrap.appendChild(logoSvg.cloneNode(true));
    brandCol.appendChild(logoWrap);
    var desc = el('p', 'sg-footer-desc', { text: ft.desc });
    brandCol.appendChild(desc);
    inner.appendChild(brandCol);

    // Link columns
    ft.columns.forEach(function (col) {
      var colDiv = el('div', '');
      var colTitle = el('p', 'sg-footer-col-title', { text: col.title });
      colDiv.appendChild(colTitle);
      var links = el('div', 'sg-footer-links');
      col.links.forEach(function (l) {
        var a = el('a', 'sg-footer-link', { href: l.href, text: l.label });
        links.appendChild(a);
      });
      colDiv.appendChild(links);
      inner.appendChild(colDiv);
    });

    footer.appendChild(inner);

    // Bottom bar
    var bottom = el('div', 'sg-footer-bottom');
    var copyright = el('span', '', { text: ft.copyright });
    bottom.appendChild(copyright);
    var social = el('div', 'sg-footer-social');
    ft.social.forEach(function (s) {
      var a = el('a', '', { href: s.href, text: s.label });
      social.appendChild(a);
    });
    bottom.appendChild(social);
    footer.appendChild(bottom);

    return footer;
  };

  /* ---- 构建完整 DOM ---- */
  Mastra.prototype.create = function () {
    var frame = el('div', 'sg-frame');
    frame.appendChild(this._buildNav());
    frame.appendChild(this._buildHero());
    frame.appendChild(this._buildTabs());

    // Section: Observability
    var obsSection = el('section', 'sg-section');
    var obsHead = el('div', 'sg-section-head');
    var obsLabel = el('span', 'sg-section-label', { text: 'Observability' });
    obsHead.appendChild(obsLabel);
    var obsTitle = el('h2', 'sg-section-title', { text: 'Best-in-class, built-in observability' });
    obsHead.appendChild(obsTitle);
    var obsDesc = el('p', 'sg-section-desc', { text: 'You can always see exactly what your Mastra agents are doing.' });
    obsHead.appendChild(obsDesc);
    obsSection.appendChild(obsHead);
    obsSection.appendChild(el('div', '', { style: 'height:300px;background:var(--sg-c15t-surface-hover);border-radius:var(--sg-radius-antigrid);border:1px solid var(--sg-c15t-border);margin-top:24px;display:flex;align-items:center;justify-content:center;color:var(--sg-ds-main-gray);font-size:18px;text-align:center;padding:24px' }));
    qs('div:last-child', obsSection).textContent = 'Observability dashboard preview';
    frame.appendChild(obsSection);

    // Section: Customer Stories
    var storiesHead = el('div', 'sg-section-head');
    var storiesLabel = el('span', 'sg-section-label', { text: 'Customer Stories' });
    storiesHead.appendChild(storiesLabel);
    var storiesTitle = el('h2', 'sg-section-title', { text: 'Great AI teams move fast' });
    storiesHead.appendChild(storiesTitle);
    var storiesDesc = el('p', 'sg-section-desc', { text: 'From fast-scaling startups to large global organizations, you\'re in good company.' });
    storiesHead.appendChild(storiesDesc);
    frame.appendChild(storiesHead);
    frame.appendChild(this._buildCardGrid());

    // Section: Resources
    var resSection = el('section', 'sg-section');
    var resHead = el('div', 'sg-section-head');
    var resLabel = el('span', 'sg-section-label', { text: 'Resources' });
    resHead.appendChild(resLabel);
    var resTitle = el('h2', 'sg-section-title', { text: 'Resources' });
    resHead.appendChild(resTitle);
    resSection.appendChild(resHead);
    frame.appendChild(resSection);

    // Section: FAQ
    var faqHead = el('div', 'sg-section-head');
    var faqLabel = el('span', 'sg-section-label', { text: 'FAQ' });
    faqHead.appendChild(faqLabel);
    var faqTitle = el('h2', 'sg-section-title', { text: 'Frequently asked questions' });
    faqHead.appendChild(faqTitle);
    frame.appendChild(faqHead);
    frame.appendChild(this._buildFAQ());

    // CTA
    frame.appendChild(this._buildCTA());

    // Footer
    frame.appendChild(this._buildFooter());

    this.root = frame;
    return frame;
  };

  Mastra.prototype.mount = function (container) {
    if (!this.root) this.create();
    container.appendChild(this.root);
    return this;
  };

  /* ---- 全局导出 ---- */
  Mastra.version = '0.1.0';
  Mastra.mount = function (container, options) {
    var inst = new Mastra(options);
    inst.mount(container);
    return inst;
  };
  Mastra.create = function (options) {
    var inst = new Mastra(options);
    return inst.create();
  };

  global.Mastra = Mastra;

})(window);