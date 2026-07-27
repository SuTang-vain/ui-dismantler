(() => {
  const app = document.querySelector('#app');
  const hasToken = () => localStorage.getItem('generated-vue-admin-token') === 'admin';
  const setToken = () => localStorage.setItem('generated-vue-admin-token', 'admin');
  const route = () => decodeURIComponent(location.hash.replace(/^#/, '') || '/');
  const routePath = () => route().split('?')[0] || '/';
  const redirectTarget = () => new URLSearchParams(route().split('?')[1] || '').get('redirect') || '/dashboard';
  const protectedRoute = path => path !== '/login';
  const navigate = (path, replace = false) => {
    const target = path.startsWith('#') ? path : `#${path}`;
    if (replace) history.replaceState({ route: target }, '', target);
    else history.pushState({ route: target }, '', target);
    render();
  };
  const isOpen = { nested: false, menu1: false, permission: false };
  let activePermissionRole = 'admin';
  const link = (path, label) => `<a href="#${path}" class="${routePath() === path ? 'router-link-active' : ''}"><li class="el-menu-item">${label}</li></a>`;
  const submenu = (id, title, body) => `<div class="el-submenu"><div class="el-submenu__title" data-submenu="${id}">${title}<span style="margin-left:auto">⌄</span></div><ul class="el-menu el-menu--inline ${isOpen[id] ? 'is-open' : ''}">${body}</ul></div>`;
  const renderSidebar = () => `<aside class="sidebar-container"><div class="sidebar-title">Vue Element Admin</div><ul class="el-menu">
    ${link('/dashboard', 'Dashboard')}
    ${link('/documentation/index', 'Documentation')}
    ${submenu('permission', 'Permission', link('/permission/directive', 'Directive Permission'))}
    ${submenu('nested', 'Nested Routes', submenu('menu1', 'Menu 1', link('/nested/menu1/menu1-1', 'Menu 1-1')))}
  </ul></aside>`;
  const dashboardIcons = {
    people: 'M95.648 118.762c0 5.035-3.563 9.121-7.979 9.121H7.98c-4.416 0-7.979-4.086-7.979-9.121C0 100.519 15.408 83.47 31.152 76.75c-9.099-6.43-15.216-17.863-15.216-30.987v-9.128c0-20.16 14.293-36.518 31.893-36.518s31.894 16.358 31.894 36.518v9.122c0 13.137-6.123 24.556-15.216 30.993 15.738 6.726 31.141 23.769 31.141 42.012zM106.032 118.252h15.867c3.376 0 6.101-3.125 6.101-6.972 0-13.957-11.787-26.984-23.819-32.123 6.955-4.919 11.638-13.66 11.638-23.704v-6.985c0-15.416-10.928-27.926-24.39-27.926-1.674 0-3.306.193-4.89.561 1.936 4.713 3.018 9.974 3.018 15.526v9.121c0 13.137-3.056 23.111-11.066 30.993 14.842 4.41 27.312 23.42 27.541 41.509z',
    message: 'M0 20.967v59.59c0 11.59 8.537 20.966 19.075 20.966h28.613l1 26.477L76.8 101.523h32.125c10.538 0 19.075-9.377 19.075-20.966v-59.59C128 9.377 119.463 0 108.925 0h-89.85C8.538 0 0 9.377 0 20.967zm82.325 33.1c0-5.524 4.013-9.935 9.037-9.935 5.026 0 9.038 4.41 9.038 9.934 0 5.524-4.025 9.934-9.038 9.934-5.024 0-9.037-4.41-9.037-9.934zm-27.613 0c0-5.524 4.013-9.935 9.038-9.935s9.037 4.41 9.037 9.934c0 5.524-4.025 9.934-9.037 9.934-5.025 0-9.038-4.41-9.038-9.934zm-27.1 0c0-5.524 4.013-9.935 9.038-9.935s9.038 4.41 9.038 9.934c0 5.524-4.026 9.934-9.05 9.934-5.013 0-9.025-4.41-9.025-9.934z',
    money: 'M54.122 127.892v-28.68H7.513V87.274h46.609v-12.4H7.513v-12.86h38.003L.099 0h22.6l32.556 45.07c3.617 5.144 6.44 9.611 8.487 13.385 1.788-3.05 4.89-7.779 9.301-14.186L103.93 0h24.01L82.385 62.013h38.34v12.862h-46.41v12.4h46.41v11.937h-46.41v28.68H54.123z',
    shopping: 'M42.913 101.36c7.028 0 12.057 5.7 12.057 13.079 0 7.38-5.029 13.221-12.057 13.221-7.03 0-12.057-5.841-12.057-13.221 0-7.379 5.027-13.079 12.057-13.079zm53.932.285c7.03 0 12.187 5.7 12.187 13.079 0 7.38-5.157 13.22-12.187 13.22-7.028 0-12.057-5.84-12.057-13.22 0-7.379 5.029-13.079 12.057-13.079zM6.482 0h13.095c4.5 0 6.11 3 6.555 8.103l5.816 32.795h86.678c8 0 10.5 4 8.816 10.093l-7.455 24.756c-1.123 3.79-4.043 9.393-12.908 9.393H39.023l1.945 12.795h65.342c8.298 0 8.298 12.794.129 12.794H38.505c-6.7 0-8.7-6.5-10.242-15.668L16.595 26.986H6.87C-2 26.986-2 0 6.482 0z'
  };
  const dashboardIcon = name => `<svg class="card-panel-icon" viewBox="0 0 128 128" aria-hidden="true"><path d="${dashboardIcons[name]}"></path></svg>`;
  const panel = (type, icon, label, value) => `<div class="card-panel-col"><button type="button" class="card-panel" data-dashboard-type="${type}"><span class="card-panel-icon-wrapper icon-${icon}">${dashboardIcon(icon)}</span><span class="card-panel-description"><span class="card-panel-text">${label}</span><strong class="card-panel-num">${value}</strong></span></button></div>`;
  const renderDashboard = () => `<section class="dashboard-container"><div class="dashboard-editor-container"><a class="github-corner" aria-label="View source"><span class="github-corner-mark">●</span></a><div class="panel-group">${panel('newVisitis','people','New Visits','102,400')}${panel('messages','message','Messages','81,212')}${panel('purchases','money','Purchases','9,280')}${panel('shoppings','shopping','Shoppings','13,600')}</div><div class="line-chart-wrapper"><div id="dashboard-line-chart" class="dashboard-chart line-chart"></div></div><div class="dashboard-chart-row"><div class="dashboard-chart-col"><div class="chart-wrapper"><div id="dashboard-radar-chart" class="dashboard-chart small-chart"></div></div></div><div class="dashboard-chart-col"><div class="chart-wrapper"><div id="dashboard-pie-chart" class="dashboard-chart small-chart"></div></div></div><div class="dashboard-chart-col"><div class="chart-wrapper"><div id="dashboard-bar-chart" class="dashboard-chart small-chart"></div></div></div></div><div class="dashboard-lower-row"><div class="transaction-card">Transaction table</div><div class="todo-card">Todo list</div><div class="profile-card">Profile card</div></div></div></section>`;
  const lineChartData = {
    newVisitis: { expectedData: [100,120,161,134,105,160,165], actualData: [120,82,91,154,162,140,145] },
    messages: { expectedData: [200,192,120,144,160,130,140], actualData: [180,160,151,106,145,150,130] },
    purchases: { expectedData: [80,100,121,104,105,90,100], actualData: [120,90,100,138,142,130,130] },
    shoppings: { expectedData: [130,140,141,142,145,150,160], actualData: [120,82,91,154,162,140,130] }
  };
  let dashboardLineType = 'newVisitis';
  let dashboardCharts = [];
  const initDashboardCharts = () => {
    if (!window.echarts || routePath() !== '/dashboard') return;
    dashboardCharts.forEach(chart => chart.dispose()); dashboardCharts = [];
    const lineNode = app.querySelector('#dashboard-line-chart');
    if (!lineNode) return;
    const data = lineChartData[dashboardLineType];
    const line = echarts.init(lineNode, 'macarons');
    line.setOption({xAxis:{data:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],boundaryGap:false,axisTick:{show:false}},grid:{left:10,right:10,bottom:20,top:30,containLabel:true},tooltip:{trigger:'axis',axisPointer:{type:'cross'},padding:[5,10]},yAxis:{axisTick:{show:false}},legend:{data:['expected','actual']},series:[{name:'expected',itemStyle:{normal:{color:'#FF005A',lineStyle:{color:'#FF005A',width:2}}},smooth:true,type:'line',data:data.expectedData,animationDuration:0,animationEasing:'cubicInOut'},{name:'actual',smooth:true,type:'line',itemStyle:{normal:{color:'#3888fa',lineStyle:{color:'#3888fa',width:2},areaStyle:{color:'#f3f8ff'}}},data:data.actualData,animationDuration:0,animationEasing:'quadraticOut'}]});
    const radar = echarts.init(app.querySelector('#dashboard-radar-chart'), 'macarons');
    radar.setOption({tooltip:{trigger:'item'},radar:{radius:'66%',center:['50%','42%'],splitNumber:8,splitArea:{areaStyle:{color:'rgba(127,95,132,.3)',opacity:1,shadowBlur:45,shadowColor:'rgba(0,0,0,.5)',shadowOffsetX:0,shadowOffsetY:15}},indicator:[{name:'Sales',max:10000},{name:'Administration',max:20000},{name:'Information Technology',max:20000},{name:'Customer Support',max:20000},{name:'Development',max:20000},{name:'Marketing',max:20000}]},legend:{left:'center',bottom:'10',data:['Allocated Budget','Expected Spending','Actual Spending']},series:[{type:'radar',symbolSize:0,areaStyle:{normal:{shadowBlur:13,shadowColor:'rgba(0,0,0,.2)',shadowOffsetY:10,opacity:1}},data:[{value:[5000,7000,12000,11000,15000,14000],name:'Allocated Budget'},{value:[4000,9000,15000,15000,13000,11000],name:'Expected Spending'},{value:[5500,11000,12000,15000,12000,12000],name:'Actual Spending'}],animationDuration:0}]});
    const pie = echarts.init(app.querySelector('#dashboard-pie-chart'), 'macarons');
    pie.setOption({tooltip:{trigger:'item'},legend:{left:'center',bottom:'10',data:['Industries','Technology','Forex','Gold','Forecasts']},series:[{name:'WEEKLY WRITE ARTICLES',type:'pie',roseType:'radius',radius:[15,95],center:['50%','38%'],data:[{value:320,name:'Industries'},{value:240,name:'Technology'},{value:149,name:'Forex'},{value:100,name:'Gold'},{value:59,name:'Forecasts'}],animationDuration:0}]});
    const bar = echarts.init(app.querySelector('#dashboard-bar-chart'), 'macarons');
    bar.setOption({tooltip:{trigger:'axis',axisPointer:{type:'shadow'}},grid:{top:10,left:'2%',right:'2%',bottom:'3%',containLabel:true},xAxis:[{type:'category',data:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],axisTick:{alignWithLabel:true}}],yAxis:[{type:'value',axisTick:{show:false}}],series:[{name:'pageA',type:'bar',stack:'vistors',barWidth:'60%',data:[79,52,200,334,390,330,220],animationDuration:0},{name:'pageB',type:'bar',stack:'vistors',barWidth:'60%',data:[80,52,200,334,390,330,220],animationDuration:0},{name:'pageC',type:'bar',stack:'vistors',barWidth:'60%',data:[30,52,200,334,390,330,220],animationDuration:0}]});
    dashboardCharts = [line, radar, pie, bar];
  };
  const permissionTag = text => `<span class="el-tag permission-tag">${text}</span>`;
  const permissionSource = text => `<span class="el-tag el-tag--info permission-sourceCode">${text}</span>`;
  const renderPermissionRow = (kind, source) => `<div class="permission-row"><span class="permission-alert">${kind}</span>${permissionSource(source)}</div>`;
  const renderPermission = () => {
    const isAdmin = activePermissionRole === 'admin';
    const exclusive = isAdmin
      ? renderPermissionRow(`Only ${permissionTag('admin')} can see this`, `v-permission="['admin']"`)
      : renderPermissionRow(`Only ${permissionTag('editor')} can see this`, `v-permission="['editor']"`);
    const either = renderPermissionRow(`Both ${permissionTag('admin')} and ${permissionTag('editor')} can see this`, `v-permission="['admin','editor']"`);
    const activeLabel = isAdmin ? 'Admin' : 'Editor';
    return `<section class="permission-page app-container">
      <div class="role-summary">Your roles: [ "${activePermissionRole}" ]</div>
      <div class="switch-roles"><span>Switch roles:</span><div class="role-buttons"><button type="button" data-role="editor" class="el-button role-button ${isAdmin ? '' : 'is-active'}">editor</button><button type="button" data-role="admin" class="el-button role-button ${isAdmin ? 'is-active' : ''}">admin</button></div></div>
      <div class="permission-examples">${exclusive}${either}</div>
      <div class="permission-check">
        <aside>In some cases, using v-permission will have no effect. For example: Element-UI's Tab component or<br class="permission-tablet-break"> el-table-column and other scenes that dynamically render dom. You can only do this with v-if.<br>e.g.</aside>
        <div class="permission-tabs"><div class="permission-tab-list"><div class="permission-tab is-active">${activeLabel}</div><div class="permission-tab">Admin-OR-Editor</div></div><div class="permission-tab-panel">${activeLabel} can see this ${permissionSource(`v-if="checkPermission(['${activePermissionRole}'])"`)}</div></div>
      </div>
      <button type="button" class="settings-drawer-button" aria-label="Open settings">⚙</button>
    </section>`;
  };
  const renderPage = () => {
    const path = routePath();
    if (path === '/documentation/index') return '<section class="route-page documentation-page"><h1>Documentation</h1><p>Documentation route.</p></section>';
    if (path === '/permission/directive') return renderPermission();
    if (path === '/nested/menu1/menu1-1') return '<section class="route-page nested-page"><h1>Menu 1-1</h1><p>Nested route.</p></section>';
    return renderDashboard();
  };
  const loginIcon = (name, path, viewBox = '0 0 128 128') => `<svg class="login-icon login-icon-${name}" viewBox="${viewBox}" aria-hidden="true"><path d="${path}"></path></svg>`;
  const userIcon = loginIcon('user', 'M63.444 64.996c20.633 0 37.359-14.308 37.359-31.953 0-17.649-16.726-31.952-37.359-31.952-20.631 0-37.36 14.303-37.358 31.952 0 17.645 16.727 31.953 37.359 31.953zM80.57 75.65H49.434c-26.652 0-48.26 18.477-48.26 41.27v2.664c0 9.316 21.608 9.325 48.26 9.325H80.57c26.649 0 48.256-.344 48.256-9.325v-2.663c0-22.794-21.605-41.271-48.256-41.271z', '0 0 130 130');
  const passwordIcon = loginIcon('password', 'M108.8 44.322H89.6v-5.36c0-9.04-3.308-24.163-25.6-24.163-23.145 0-25.6 16.881-25.6 24.162v5.361H19.2v-5.36C19.2 15.281 36.798 0 64 0c27.202 0 44.8 15.281 44.8 38.961v5.361zm-32 39.356c0-5.44-5.763-9.832-12.8-9.832-7.037 0-12.8 4.392-12.8 9.832 0 3.682 2.567 6.808 6.407 8.477v11.205c0 2.718 2.875 4.962 6.4 4.962 3.524 0 6.4-2.244 6.4-4.962V92.155c3.833-1.669 6.393-4.795 6.393-8.477zM128 64v49.201c0 8.158-8.645 14.799-19.2 14.799H19.2C8.651 128 0 121.359 0 113.201V64c0-8.153 8.645-14.799 19.2-14.799h89.6c10.555 0 19.2 6.646 19.2 14.799z');
  const eyeIcon = loginIcon('eye', 'M127.072 7.994c1.37-2.208.914-5.152-.914-6.87-2.056-1.717-4.797-1.226-6.396.982-.229.245-25.586 32.382-55.74 32.382-29.24 0-55.74-32.382-55.968-32.627-1.6-1.963-4.57-2.208-6.397-.49C-.17 3.086-.399 6.275 1.2 8.238c.457.736 5.94 7.36 14.62 14.72L4.17 35.96c-1.828 1.963-1.6 5.152.228 6.87.457.98 1.6 1.471 2.742 1.471s2.284-.49 3.198-1.472l12.564-13.983c5.94 4.416 13.021 8.587 20.788 11.53l-4.797 17.418c-.685 2.699.686 5.397 3.198 6.133h1.37c2.057 0 3.884-1.472 4.341-3.68L52.6 42.83c3.655.736 7.538 1.227 11.422 1.227 3.883 0 7.767-.49 11.422-1.227l4.797 17.173c.457 2.208 2.513 3.68 4.34 3.68.457 0 .914 0 1.143-.246 2.513-.736 3.883-3.434 3.198-6.133l-4.797-17.172c7.767-2.944 14.848-7.114 20.788-11.53l12.336 13.738c.913.981 2.056 1.472 3.198 1.472s2.284-.49 3.198-1.472c1.828-1.963 1.828-4.906.228-6.87l-11.65-13.001c9.366-7.36 14.849-14.474 14.849-14.474z', '0 0 128 64');
  const renderLogin = () => `<div class="login-container"><form class="login-form" autocomplete="on"><div class="title-container"><h3 class="title">Login Form</h3></div><div class="el-form-item login-field"><span class="svg-container">${userIcon}</span><input name="username" value="admin" placeholder="Username" autocomplete="username" /></div><div class="el-form-item login-field password-field"><span class="svg-container">${passwordIcon}</span><input name="password" value="111111" placeholder="Password" type="password" autocomplete="current-password" /><button class="show-pwd" type="button" aria-label="Show password">${eyeIcon}</button></div><button class="el-button el-button--primary login-submit" type="submit">Login</button><div class="login-help"><div class="tips"><span>Username : admin</span><span>Password : any</span></div><div class="tips"><span>Username : editor</span><span>Password : any</span></div><button class="el-button el-button--primary thirdparty-button" type="button">Or connect with</button></div></form></div>`;
  const bind = () => {
    app.querySelectorAll('a[href]').forEach(anchor => anchor.addEventListener('click', event => { event.preventDefault(); navigate(anchor.getAttribute('href')); }));
    app.querySelectorAll('[data-submenu]').forEach(title => title.addEventListener('click', () => { isOpen[title.dataset.submenu] = !isOpen[title.dataset.submenu]; render(); }));
    app.querySelectorAll('[data-role]').forEach(button => button.addEventListener('click', () => { activePermissionRole = button.dataset.role; render(); }));
    app.querySelectorAll('[data-dashboard-type]').forEach(button => button.addEventListener('click', () => { dashboardLineType = button.dataset.dashboardType; initDashboardCharts(); }));
    app.querySelector('.show-pwd')?.addEventListener('click', () => { const input = app.querySelector("input[placeholder='Password']"); input.type = input.type === 'password' ? 'text' : 'password'; input.focus(); });
    app.querySelector('.login-form')?.addEventListener('submit', event => { event.preventDefault(); const password = app.querySelector("input[placeholder='Password']").value; if (app.querySelector("input[placeholder='Username']").value === 'admin' && password.length >= 6) { setToken(); navigate(redirectTarget(), true); } });
  };
  const render = () => {
    const path = routePath();
    if (protectedRoute(path) && !hasToken()) { navigate(`/login?redirect=${encodeURIComponent(path)}`, true); return; }
    app.innerHTML = path === '/login' ? renderLogin() : `<div class="app-shell">${renderSidebar()}<div style="min-width:0;flex:1"><header class="app-header"><span class="breadcrumb">${path}</span><span>admin</span></header><main class="app-main">${renderPage()}</main></div></div>`;
    bind();
    initDashboardCharts();
  };
  addEventListener('popstate', render); addEventListener('hashchange', render); render();
})();
