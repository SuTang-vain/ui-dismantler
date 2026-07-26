(() => {
  const app = document.querySelector('#app');
  const nav = [
    { path: '/', label: '首页' },
    { path: '/explore', label: '发现' },
    { path: '/library', label: '音乐库' },
  ];
  const categories = ['全部', '推荐歌单', '精品歌单', '官方', '排行榜', '欧美', '流行', '摇滚', '电子', '说唱', 'ACG'];
  const routePath = () => `${location.pathname}${location.search}${location.hash}`;
  const activePath = () => location.pathname === '/' ? '/' : location.pathname.startsWith('/explore') ? '/explore' : location.pathname.startsWith('/library') ? '/library' : '';
  const searchValue = () => location.pathname.startsWith('/search/') ? decodeURIComponent(location.pathname.slice('/search/'.length)) : '';
  const navigate = (path, replace = false) => {
    const method = replace ? 'replaceState' : 'pushState';
    history[method]({ source: 'generated', route: path }, '', path);
    render();
  };
  const arrow = direction => `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${direction === 'back' ? 'M15 18l-6-6 6-6' : 'M9 6l6 6-6 6'}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const renderNav = () => `<nav aria-label="主导航">
    <div class="navigation-buttons"><button type="button" data-history="back" aria-label="后退">${arrow('back')}</button><button type="button" data-history="forward" aria-label="前进">${arrow('forward')}</button></div>
    <div class="navigation-links">${nav.map(item => `<a class="${activePath() === item.path ? 'active' : ''}" href="${item.path}">${item.label}</a>`).join('')}</div>
    <div class="right-part"><div class="search-box"><div class="search-container"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg><div class="input"><input type="search" placeholder="搜索" aria-label="搜索" value="${searchValue()}" /></div></div></div><img class="avatar" src="/img/default-avatar.jpg" alt="" /></div>
  </nav>`;

  const select = (value, options) => `<select aria-label="${value}">${options.map(([label, selected]) => `<option${selected ? ' selected' : ''}>${label}</option>`).join('')}</select>`;
  const toggle = (id, checked = false) => `<div class="toggle"><input id="${id}" type="checkbox"${checked ? ' checked' : ''}/><label for="${id}"></label></div>`;
  const item = (title, control) => `<div class="item"><div class="left"><div class="title">${title}</div></div><div class="right">${control}</div></div>`;
  const renderSettings = () => `<div class="settings-page"><div class="container">
    ${item('语言', select('语言', [['🇬🇧 English'], ['🇹🇷 Türkçe'], ['🇨🇳 简体中文', true], ['繁體中文']]))}
    ${item('外观', select('外观', [['自动', true], ['🌞 浅色'], ['🌚 深色']]))}
    ${item('主题颜色', select('主题颜色', [['原始颜色', true], ['日落渐变'], ['海洋渐变'], ['森林渐变']]))}
    ${item('音乐语种偏好', select('音乐语种偏好', [['无偏好', true], ['华语'], ['欧美'], ['日语'], ['韩语']]))}
    ${item('音质选择', select('音质选择', [['普通 - 128Kbps'], ['较高 - 192Kbps'], ['极高 - 320Kbps', true], ['无损 - FLAC'], ['Hi-Res']]))}
    <h3>歌词</h3>
    ${item('显示歌词翻译', toggle('show-lyrics-translation', true))}
    ${item('显示歌词背景', select('显示歌词背景', [['关闭'], ['打开', true], ['模糊封面'], ['动态（GPU 占用较高）']]))}
    ${item('显示当前时间', toggle('show-lyrics-time'))}
    ${item('歌词字体大小', select('歌词字体大小', [['小 - 16px'], ['中 - 22px'], ['大（默认） - 28px', true], ['超大 - 36px']]))}
    <h3>自定义</h3>
    ${item('连接 Last.fm', '<button type="button">授权连接</button>')}
    <h3>其他</h3>
    ${item('首页显示来自 Apple Music 的歌单', toggle('show-apple-playlists', true))}
    ${item('副标题使用别名', toggle('subtitle-alias'))}
    ${item('启用倒序播放功能 (实验性功能)', toggle('reversed-mode'))}
    ${item('<span class="reversed-cat">🐈️ 🏳️‍🌈</span>', toggle('nyancat-style'))}
    <div class="footer"><p class="author">MADE BY <a href="http://github.com/qier222">QIER222</a></p><p class="version">v0.4.10</p><div class="vercel-mark">▲</div></div>
  </div></div>`;
  const renderExplore = () => `<div class="explore-page"><h1>发现</h1><div class="buttons">${categories.map((label, i) => `<div class="button${i === 0 ? ' active' : ''}">${label}</div>`).join('')}<div class="button more" aria-label="更多"><span>•••</span></div></div><div class="playlists"></div><div class="load-more"><button hidden>加载更多</button></div></div>`;
  const renderLogin = () => `<div class="login"><div class="section-1"><img src="/img/logos/yesplaymusic.png" alt=""/><svg class="x-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg><img src="/img/logos/netease-music.png" alt=""/></div><div class="section-2"><div class="card"><div class="card-container"><div class="title-info"><div class="title">登录网易云账号</div><div class="info">可访问全部数据</div></div><span class="card-arrow">›</span></div></div><div class="card"><div class="card-container"><div class="title-info"><div class="title">搜索网易云账号</div><div class="info">只能读取账号公开数据</div></div><span class="card-arrow">›</span></div></div></div></div>`;
  const renderSearch = () => `<div class="search-page"><h1>搜索</h1><div class="search-result">搜索结果：${decodeURIComponent(location.pathname.slice('/search/'.length))}</div></div>`;
  const renderRoute = () => {
    if (location.pathname === '/explore') return renderExplore();
    if (location.pathname === '/login') return renderLogin();
    if (location.pathname.startsWith('/search/')) return renderSearch();
    return renderSettings();
  };
  const bind = () => {
    app.querySelectorAll('.navigation-links a').forEach(link => link.addEventListener('click', event => {
      event.preventDefault();
      const href = link.getAttribute('href');
      if (href === '/library') return navigate('/login');
      navigate(href);
    }));
    app.querySelector('[data-history="back"]')?.addEventListener('click', () => history.back());
    app.querySelector('[data-history="forward"]')?.addEventListener('click', () => history.forward());
    app.querySelector('input[type="search"]')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') navigate(`/search/${encodeURIComponent(event.currentTarget.value)}`);
    });
  };
  const render = () => { app.innerHTML = `${renderNav()}<main>${renderRoute()}</main>`; bind(); };
  history.replaceState({ source: 'generated', route: routePath() }, '', routePath());
  addEventListener('popstate', render);
  render();
})();
