const app = document.querySelector('#app');
const providers = [
  ['anthropic','Anthropic (Claude)'],['openai','OpenAI'],['qianwen','通义千问'],['custom','自定义 OpenAI 兼容接口'],['wenxin','百度文心']
];
const state = { profiles: [], loading: false, editor: null, advanced: false };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const routePath = () => location.pathname;
const tokenFromUrl = new URLSearchParams(location.search).get('token');
if (tokenFromUrl) sessionStorage.setItem('api_token', tokenFromUrl);
function currentRoute() { return `${location.pathname}${location.search}${location.hash}`; }
function initializeHistory() {
  const current = currentRoute();
  const existing = history.state;
  const state = existing && existing.current === current
    ? existing
    : {back:null,current,forward:null,position:1,replaced:true,scroll:null};
  history.replaceState(state, '', current);
  if (!existing || existing.current !== current) history.replaceState(state, '', current);
}
initializeHistory();

function navigate(path, replace = false) {
  if (replace) {
    const state={back:history.state?.back??null,current:path,forward:null,position:history.state?.position??1,replaced:true,scroll:null};
    history.replaceState(state, '', path);
  } else {
    const from=currentRoute();
    const currentState={back:history.state?.back??null,current:from,forward:path,position:history.state?.position??1,replaced:true,scroll:{left:scrollX,top:scrollY}};
    history.replaceState(currentState, '', from);
    const nextState={back:from,current:path,forward:null,position:(currentState.position??1)+1,replaced:false,scroll:null};
    history.pushState(nextState, '', path);
  }
  render();
  if (routePath() === '/profiles' && !state.loading && state.profiles.length === 0) void loadProfiles();
}
function apiHeaders() {
  const headers = {'Content-Type':'application/json','original-url':location.href};
  const token = sessionStorage.getItem('api_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {...options, headers:{...apiHeaders(), ...(options.headers||{})}});
  const body = await response.json();
  if (response.status === 401 && typeof body?.redirectUrl === 'string' && body.redirectUrl.startsWith('http')) location.href = body.redirectUrl;
  if (!response.ok) throw new Error(body?.message || `HTTP ${response.status}`);
  return body;
}
function homeMarkup() {
  let profile = null;
  try { profile = JSON.parse(localStorage.getItem('starmap_profile_snapshot') || 'null'); } catch {}
  const banner = profile ? `<div class="config-banner"><span class="banner-icon">⚡</span><span>当前使用配置：<strong>${escapeHtml(profile.name)}</strong><span class="banner-meta">${escapeHtml(profile.provider)} · ${escapeHtml(profile.model || '默认')}</span></span><a href="/profiles" class="banner-link">更换</a></div>` : '';
  const advanced = state.advanced ? `<div class="advanced-content"><div class="form-group"><label>LLM 调用模式</label><div class="radio-group"><label class="radio-item active"><input type="radio" value="http" checked><div><div class="radio-label">HTTP LLM</div><div class="radio-desc">调用后端 LLM 服务生成真实数据</div></div></label><label class="radio-item"><input type="radio" value="mock"><div><div class="radio-label">Mock</div><div class="radio-desc">使用本地演示数据</div></div></label></div></div><div class="form-group"><label for="llmProvider">LLM Provider</label><select id="llmProvider">${providers.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></div><div class="form-group"><label for="llmModel">模型（可选）</label><input id="llmModel" type="text" placeholder="默认 claude-sonnet-4-20250514"></div><div class="form-group"><label for="llmApiKey">API Key（可选，运行时覆盖 .env）</label><input id="llmApiKey" type="password" placeholder="不填则使用后端 .env 配置"></div></div>` : '';
  return `<div class="theme-input-container"><div class="hero-section"><div class="hero-content"><h1 class="hero-title">星图生产辅助 Agent</h1><p class="hero-subtitle">AI 驱动的星图自动生成与智能审核系统</p><a href="/profiles" class="hero-link">⚙️ 后台模型配置</a></div></div>${banner}<div class="form-container"><form class="input-form"><div class="form-group"><label for="themeName">星图主题名称 <span class="required">*</span></label><input id="themeName" type="text" placeholder="请输入星图主题名称" required></div><div class="form-group"><label for="objective">目标说明 <span class="required">*</span></label><textarea id="objective" placeholder="请描述生成目标和预期效果" rows="4" required></textarea></div><div class="form-group"><label for="referenceEntries">参考词条</label><textarea id="referenceEntries" placeholder="请输入参考词条，多个词条用逗号分隔" rows="3"></textarea></div><div class="form-group"><label for="categoryHint">垂类提示</label><input id="categoryHint" type="text" placeholder="如：人物、地点、事件等"></div><div class="advanced-section"><button type="button" class="advanced-toggle"><span class="arrow">${state.advanced?'▼':'▶'}</span>高级选项：LLM 生成配置</button>${advanced}</div><button type="submit" class="submit-btn">开始生成</button></form></div></div>`;
}
function profileCard(p) {
  const active = (localStorage.getItem('starmap_profile_id') || '') === p.id || p.isDefault;
  return `<div class="profile-card${active?' active':''}" data-profile-id="${escapeHtml(p.id)}"><div class="card-head"><div class="card-title"><span class="dot${p.isDefault?' default':''}"></span><strong>${escapeHtml(p.name)}</strong><span class="badge provider">${escapeHtml(p.provider)}</span>${p.isDefault?'<span class="badge default-badge">默认</span>':''}</div><div class="card-actions">${active?'':`<button class="btn-link" data-action="apply">选用</button>`}${p.isDefault?'':`<button class="btn-link" data-action="default">设为默认</button>`}<button class="btn-link" data-action="edit">编辑</button><button class="btn-link danger" data-action="delete">删除</button></div></div><div class="card-meta"><div class="meta-row"><span class="meta-label">模型：</span><code class="meta-value">${escapeHtml(p.model || '—')}</code></div><div class="meta-row"><span class="meta-label">API URL：</span><code class="meta-value">${escapeHtml(p.apiUrl || '—')}</code></div><div class="meta-row"><span class="meta-label">API Key：</span><code class="meta-value">${escapeHtml(p.apiKey || '（未设置）')}</code></div><div class="meta-row"><span class="meta-label">参数：</span><code class="meta-value">temperature=${escapeHtml(p.temperature)}, max_tokens=${escapeHtml(p.maxTokens)}</code></div><div class="meta-row"><span class="meta-label">更新于：</span><span class="meta-value muted">${p.updatedAt ? new Date(p.updatedAt).toLocaleString('zh-CN') : '—'}</span></div></div></div>`;
}
function editorMarkup() {
  if (!state.editor) return '';
  const e=state.editor, f=e.form;
  return `<div class="modal-mask"><div class="modal"><header class="modal-head"><h2>${e.id?'编辑配置':'新建配置'}</h2><button class="btn-link" data-action="close-editor">关闭</button></header><div class="modal-body"><div class="form-group"><label>名称 *</label><input data-field="name" value="${escapeHtml(f.name)}" placeholder="如 MiniMax-M3 默认配置"></div><div class="form-group"><label>Provider *</label><select data-field="provider">${providers.map(([value,label])=>`<option value="${value}"${f.provider===value?' selected':''}>${label}</option>`).join('')}</select></div><div class="form-group"><label>模型</label><input data-field="model" value="${escapeHtml(f.model)}" placeholder="默认 claude-sonnet-4-20250514"></div>${f.provider==='custom'?'<div class="form-group"><label>自定义 API URL *</label><input data-field="apiUrl" value="'+escapeHtml(f.apiUrl)+'" placeholder="https://api.example.com/v1/chat/completions"></div>':''}${f.provider==='wenxin'?'<div class="form-group"><label>Secret Key（仅文心需要）</label><input data-field="secretKey" type="password" placeholder="百度文心的 client_secret"></div>':''}<div class="form-group"><label>API Key</label><input data-field="apiKey" type="password" placeholder="${e.id?'不修改请留空':'可选；运行时覆盖 .env'}"></div><div class="form-row"><div class="form-group"><label>temperature</label><input data-field="temperature" value="${escapeHtml(f.temperature)}" type="number" step="0.1" min="0" max="2"></div><div class="form-group"><label>max_tokens</label><input data-field="maxTokens" value="${escapeHtml(f.maxTokens)}" type="number" min="100" max="32000"></div></div><div class="form-group checkbox"><label><input data-field="isDefault" type="checkbox"${f.isDefault?' checked':''}>设为默认（生成任务时优先套用）</label></div></div><footer class="modal-foot"><button class="btn btn-text" data-action="close-editor">取消</button><button class="btn btn-primary" data-action="save-editor">保存</button></footer></div></div>`;
}
function profilesMarkup() {
  const content = state.loading ? '<div class="empty">加载中…</div>' : state.profiles.length ? `<div class="profile-list">${state.profiles.map(profileCard).join('')}</div>` : '<div class="empty"><p>暂无配置单</p><button class="btn btn-primary" data-action="new-editor">+ 创建第一个配置</button></div>';
  return `<div class="profiles-container"><div class="profiles-header"><div><h1 class="profiles-title">后台模型配置</h1><p class="profiles-subtitle">把常用的大模型参数保存为配置单，生成任务时一键套用，避免每次重复输入。</p></div><button class="btn btn-primary" data-action="new-editor">＋ 新建配置</button></div>${content}${editorMarkup()}</div>`;
}
function placeholder(title, taskId) { return `<main class="route-shell-page"><h1>${escapeHtml(title)}</h1><p>任务 ID：${escapeHtml(taskId || '')}</p></main>`; }
async function loadProfiles() {
  state.loading=true; render();
  try { const res=await api('/llm/profiles'); state.profiles=res.success ? (res.data || []) : []; }
  catch (error) { console.error(error); state.profiles=[]; }
  finally { state.loading=false; render(); }
}
function openEditor(profile) {
  state.editor={id:profile?.id||'',form:{name:profile?.name||'',provider:profile?.provider||'anthropic',model:profile?.model||'',apiUrl:profile?.apiUrl||'',apiKey:'',secretKey:'',temperature:profile?.temperature??0.5,maxTokens:profile?.maxTokens??800,isDefault:!!profile?.isDefault}};
  render();
}
function bind() {
  app.querySelectorAll('a[href]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();navigate(a.getAttribute('href'));}));
  app.querySelector('.advanced-toggle')?.addEventListener('click',()=>{state.advanced=!state.advanced;render();});
  app.querySelector('.input-form')?.addEventListener('submit',e=>e.preventDefault());
  app.querySelectorAll('[data-action="new-editor"]').forEach(n=>n.addEventListener('click',()=>openEditor()));
  app.querySelectorAll('[data-action="close-editor"]').forEach(n=>n.addEventListener('click',()=>{state.editor=null;render();}));
  app.querySelector('.modal-mask')?.addEventListener('click',e=>{if(e.target===e.currentTarget){state.editor=null;render();}});
  app.querySelectorAll('[data-profile-id]').forEach(card=>card.querySelector('[data-action="edit"]')?.addEventListener('click',()=>openEditor(state.profiles.find(p=>String(p.id)===card.dataset.profileId))));
  app.querySelector('[data-field="provider"]')?.addEventListener('change',e=>{state.editor.form.provider=e.target.value;render();});
}
function render() {
  const match=routePath().match(/^\/(progress|review|export)\/([^/]+)$/);
  if (routePath()==='/') { document.title='星图主题输入 - 星图生产辅助 Agent'; app.innerHTML=homeMarkup(); }
  else if (routePath()==='/profiles') { document.title='后台模型配置 - 星图生产辅助 Agent'; app.innerHTML=profilesMarkup(); }
  else if (match) { const titles={progress:'生成进度',review:'用户审核',export:'CSV 导出'}; document.title=`${titles[match[1]]} - 星图生产辅助 Agent`; app.innerHTML=placeholder(titles[match[1]],match[2]); }
  else { app.innerHTML=placeholder('未找到页面',''); }
  const scope = routePath() === '/' ? 'data-v-a42a012a' : routePath() === '/profiles' ? 'data-v-7b57ecb4' : '';
  if (scope) app.querySelectorAll('*').forEach((node) => node.setAttribute(scope, ''));
  bind();
}
addEventListener('popstate',render);
render();
if(routePath()==='/profiles') loadProfiles();
