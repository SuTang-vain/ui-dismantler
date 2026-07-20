#!/usr/bin/env python3
"""批量将 case 垂类分类中的词条页拆解成垂类组件库。

输出位置：每个垂类目录下的「组件库」；「明星组合」默认跳过。
该脚本执行确定性提取：标题、正文数据块、图片资产、控件标签和主题色，
再生成统一的 sg-* 数据驱动组件库供每个词条示例复用。
"""
from __future__ import annotations
import argparse, json, re, shutil
from pathlib import Path
from urllib.parse import quote
from bs4 import BeautifulSoup, NavigableString

SKIP = {'script','style','noscript','template','svg','head'}
IMAGE_EXTS = {'.png','.jpg','.jpeg','.webp','.gif','.avif','.svg','.JPG'.lower()}

VERTICAL_META = {
    '关系图谱参考': ('关系图谱', '人物关系与剧情图谱', 'graph'),
    '历史人物': ('历史人物', '历史人物因果链', 'timeline'),
    '对比辨析参考': ('对比辨析', '物种与对象对比观察', 'compare'),
    '展开事实参考': ('展开事实', '主题事实卡片', 'facts'),
    '文化类词语': ('文化词语', '词语典故与关联知识', 'culture'),
    '时间线参考': ('时间线', '人物生平阶段时间线', 'timeline'),
    '景区景点': ('景区导览', '景点地图与路线导览', 'scenic'),
    '电影电视剧': ('影视图谱', '人物关系与剧情脉络', 'graph'),
}

def safe_slug(s: str) -> str:
    s = re.sub(r'[\\/:*?"<>|\s]+', '-', s).strip('-')
    s = re.sub(r'[^0-9A-Za-z\-\u4e00-\u9fff]+', '-', s)
    return s[:80] or 'entry'

def clean_text(s: str) -> str:
    return re.sub(r'\s+', ' ', s or '').strip()

def title_from(soup: BeautifulSoup, entry: Path) -> str:
    if soup.title and clean_text(soup.title.get_text(' ')):
        t = clean_text(soup.title.get_text(' '))
        return re.sub(r'\s*[|｜-]\s*(动态百科|交互式科普|百科.*)$', '', t).strip()
    for tag in soup.select('h1,h2'):
        t = clean_text(tag.get_text(' '))
        if t: return t
    return entry.name.rsplit('_v', 1)[0]

def visible_chunks(soup: BeautifulSoup) -> list[str]:
    body = soup.body or soup
    out=[]; seen=set()
    for node in body.find_all(string=True):
        if isinstance(node, NavigableString) and node.parent and node.parent.name not in SKIP:
            t=clean_text(str(node))
            if not t or len(t) < 2: continue
            if t in {'×','✕','✖','←','→','‹','›','▲','▼','◀','▶'}: continue
            # 过滤样式类无意义文本
            if re.fullmatch(r'[{};:,.]+', t): continue
            if t not in seen:
                seen.add(t); out.append(t)
    return out

def parse_data(html: Path, entry: Path, category: str) -> dict:
    raw = html.read_bytes()
    try: text = raw.decode('utf-8')
    except UnicodeDecodeError:
        text = raw.decode('gb18030', errors='replace')
    soup = BeautifulSoup(text, 'html.parser')
    title = title_from(soup, entry)
    chunks = visible_chunks(soup)
    headings=[]
    for h in soup.select('h1,h2,h3,h4,[role="heading"]'):
        t=clean_text(h.get_text(' '))
        if t and t not in headings: headings.append(t)
    buttons=[]
    for b in soup.select('button,[role="tab"],.tab-btn,.works-tab,.pose-tab'):
        t=clean_text(b.get_text(' '))
        if t and t not in buttons: buttons.append(t)
    # 以 heading/按钮为入口分组，避免把整页内容硬编码进渲染逻辑
    sections=[]
    for h in headings[:24]:
        sections.append({'title':h,'items':[]})
    if not sections:
        sections=[{'title':'核心内容','items':[]}]
    for c in chunks:
        if c in headings or c in buttons: continue
        # 过长文本切成可复用段，短文本收为标签/事实
        if len(c)>260:
            for i in range(0,len(c),220): sections[0]['items'].append(c[i:i+220])
        else:
            sections[0]['items'].append(c)
    for sec in sections:
        # 从全文中抽取与标题相近的少量文本；第一节承接全部内容
        if sec['title']!='核心内容':
            related=[]
            idx=next((i for i,x in enumerate(chunks) if x==sec['title']),-1)
            if idx>=0: related=chunks[idx+1:idx+5]
            sec['items']=related or sec['items'][:4]
        sec['items']=list(dict.fromkeys(x for x in sec['items'] if x and x not in buttons))[:8]
    # 图像：优先原 HTML 引用，若没有则把目录内图片资产全部加入数据
    image_paths=[]
    for img in soup.find_all('img'):
        src=img.get('src') or img.get('data-src') or ''
        if src.startswith('data:') or not src: continue
        p=(entry / src).resolve()
        if p.exists() and p.is_file():
            rel=p.relative_to(entry)
            if str(rel) not in image_paths: image_paths.append(str(rel))
    if not image_paths:
        for p in sorted(entry.rglob('*')):
            if p.is_file() and p.suffix.lower() in IMAGE_EXTS:
                image_paths.append(str(p.relative_to(entry)))
    images=[]
    example_dir=Path('..')
    for rel in image_paths[:24]:
        # examples/<slug>.html -> ../<entry>/<asset> when copied into category/组件库
        asset_url='../'+quote(entry.name, safe='')+'/'+ '/'.join(quote(x, safe='') for x in Path(rel).parts)
        images.append({'src':asset_url,'alt':Path(rel).stem,'path':rel})
    # 结构化事实：标题、按钮、年份、数据表格中的行
    facts=[]
    for tr in soup.select('tr')[:40]:
        cells=[clean_text(x.get_text(' ')) for x in tr.find_all(['th','td'])]
        cells=[x for x in cells if x]
        if len(cells)>=2: facts.append({'label':cells[0][:40],'value':' · '.join(cells[1:])[:240]})
    years=[]
    for y in re.findall(r'(?<!\d)(?:18|19|20)\d{2}(?:年)?', ' '.join(chunks)):
        if y not in years: years.append(y)
    if not facts:
        for i, b in enumerate(buttons[:8]): facts.append({'label':f'交互 {i+1}','value':b})
    nodes=[]
    for x in headings[:12]: nodes.append({'label':x,'kind':'节点','desc':''})
    if not nodes:
        nodes=[{'label':x,'kind':'内容','desc':''} for x in buttons[:10]]
    # 主题色从原 :root 提取；取第一批常用颜色作为初始令牌
    root_vars={}
    for m in re.finditer(r'--([\w-]+)\s*:\s*([^;}{]+)', text):
        root_vars[m.group(1).lower()]=m.group(2).strip()
    def pick(names, fallback):
        for n in names:
            if n in root_vars and re.match(r'^(#|rgb|hsl|rgba|hsla)',root_vars[n],re.I): return root_vars[n]
        return fallback
    theme={
      'primary':pick(['primary','marker-active','brand'],'#6487fa'),
      'accent':pick(['accent','apple-blue','green'],'#4e6ef2'),
      'ink':pick(['ink','t1','text-main'],'#1e1f24'),
      'muted':pick(['muted','text-sec','text-minor','t2'],'#848691'),
      'subtle':pick(['subtle','text-tri','text-tiny','t3'],'#b7b9c1'),
      'line':pick(['line','border-light','divider'],'rgba(30, 31, 36, 0.08)'),
      'paper':pick(['paper','glass-thick'],'#ffffff'),
      'stage':pick(['stage','bg-dent','apple-gray'],'#f8f8f8'),
      'soft':pick(['soft','primary-tint'],'rgba(100, 135, 250, 0.10)'),
    }
    return {
      'id':safe_slug(entry.name+'-'+html.stem), 'title':title, 'sourceHtml':html.name,
      'category':category, 'kind':VERTICAL_META.get(category,('', '', 'facts'))[2],
      'subtitle':VERTICAL_META.get(category,('', '', 'facts'))[1],
      'headings':headings[:24], 'tabs':buttons[:8], 'sections':sections,
      'facts':facts[:24], 'nodes':nodes[:16], 'years':years[:16], 'images':images,
      'summary':next((x for x in chunks if len(x)>=24), title), 'theme':theme,
      'sourceDir':entry.name,
    }

def js_engine(global_name: str, kind: str) -> str:
    return f'''/* {global_name} · 垂类组件渲染引擎；无第三方依赖 */
(function (global) {{
  'use strict';
  function el(tag, cls, attrs) {{ var n=document.createElement(tag); if(cls)n.className=cls; attrs=attrs||{{}}; Object.keys(attrs).forEach(function(k){{ if(k==='text')n.textContent=attrs[k]; else n.setAttribute(k,attrs[k]); }}); return n; }}
  function text(v) {{ return v == null ? '' : String(v); }}
  function esc(v) {{ return text(v).replace(/[&<>"']/g,function(c){{return {{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c];}}); }}
  function kindClass(kind) {{ return 'sg-kind-'+String(kind||'item').toLowerCase().replace(/[^a-z0-9-]+/g,'-'); }}
  var DEFAULTS = {{ title:'', subtitle:'', kind:'{kind}', sections:[], facts:[], nodes:[], years:[], images:[], tabs:[], theme:{{}} }};
  function merge(a,b) {{ var o={{}}; Object.keys(a||{{}}).forEach(function(k){{o[k]=a[k];}}); Object.keys(b||{{}}).forEach(function(k){{o[k]=b[k];}}); return o; }}
  function applyTheme(root, theme) {{ Object.keys(theme||{{}}).forEach(function(k){{ if(/^[-a-z]+$/.test(k)) root.style.setProperty('--sg-'+k,theme[k]); }}); }}
  function renderList(items, cls) {{ var wrap=el('div',cls); (items||[]).forEach(function(item){{ var value=typeof item==='string'?item:(item.value||item.desc||item.label||''); var card=el('article','sg-card'); card.appendChild(el('span','sg-card-mark',{{'aria-hidden':'true'}})); card.appendChild(el('p','sg-card-text',{{text:value}})); if(item.label && item.value){{ card.innerHTML=''; card.appendChild(el('strong','sg-card-label',{{text:item.label}})); card.appendChild(el('p','sg-card-text',{{text:item.value}})); }} wrap.appendChild(card); }}); return wrap; }}
  function renderImages(images) {{ var wrap=el('div','sg-media-grid'); (images||[]).forEach(function(img){{ var figure=el('figure','sg-media-card'); var im=el('img','sg-media-img',{{src:img.src,alt:img.alt||''}}); im.addEventListener('error',function(){{figure.classList.add('sg-media-missing'); im.remove();}}); figure.appendChild(im); figure.appendChild(el('figcaption','sg-media-caption',{{text:img.alt||''}})); wrap.appendChild(figure); }}); return wrap; }}
  function renderTimeline(data) {{ var wrap=el('div','sg-timeline'); (data.nodes||[]).forEach(function(n,i){{ var item=el('article','sg-timeline-item'); item.appendChild(el('span','sg-timeline-index',{{text:String(i+1).padStart(2,'0')}})); var body=el('div','sg-timeline-body'); body.appendChild(el('strong','sg-timeline-title',{{text:n.label||''}})); body.appendChild(el('p','sg-timeline-desc',{{text:n.desc||((data.sections[0]&&data.sections[0].items[i])||'')}})); item.appendChild(body); wrap.appendChild(item); }}); return wrap; }}
  function renderNodes(data) {{ var wrap=el('div','sg-node-map'); (data.nodes||[]).forEach(function(n,i){{ var node=el('button','sg-node',{{type:'button','aria-label':n.label||('节点 '+(i+1))}}); node.appendChild(el('span','sg-node-dot',{{'aria-hidden':'true'}})); node.appendChild(el('span','sg-node-label',{{text:n.label||''}})); node.addEventListener('click',function(){{ var live=document.querySelector('.sg-live'); if(live)live.textContent=n.label||''; }}); wrap.appendChild(node); }}); return wrap; }}
  function panel(id,label,body,active) {{ var p=el('section','sg-panel'+(active?' is-active':''),{{id:id,role:'tabpanel','aria-labelledby':'sg-tab-'+id}}); if(!active)p.hidden=true; var head=el('div','sg-panel-head'); head.appendChild(el('div','sg-panel-kicker',{{text:label}})); p.appendChild(head); p.appendChild(body); return p; }}
  function create(options) {{
    var data=merge(DEFAULTS,options||{{}}); var root=el('section','sg-frame '+kindClass(data.kind),{{role:'region','aria-label':data.title||data.subtitle||'可复用词条组件'}}); applyTheme(root,data.theme);
    var head=el('header','sg-hero'); var kicker=el('span','sg-kicker',{{text:data.subtitle||'动态词条'}}); head.appendChild(kicker); head.appendChild(el('h1','sg-title',{{text:data.title}})); head.appendChild(el('p','sg-summary',{{text:data.summary||''}})); root.appendChild(head);
    var tabbar=el('div','sg-tab-bar',{{role:'tablist','aria-label':'内容视图'}}); var views=el('div','sg-view-stack'); var labels=[['overview','概览'],['content','内容'],['media','素材'],['facts','事实']];
    labels.forEach(function(pair,i){{ var id=pair[0]; var tab=el('button','sg-tab'+(i===0?' is-active':''),{{id:'sg-tab-'+id,type:'button',role:'tab','aria-selected':i===0?'true':'false','aria-controls':'sg-panel-'+id,text:pair[1]}}); tab.addEventListener('click',function(){{ root.querySelectorAll('.sg-tab').forEach(function(t){{t.classList.remove('is-active');t.setAttribute('aria-selected','false');}}); root.querySelectorAll('.sg-panel').forEach(function(p){{p.classList.remove('is-active');p.hidden=true;}}); tab.classList.add('is-active');tab.setAttribute('aria-selected','true');var p=root.querySelector('#sg-panel-'+id);if(p){{p.classList.add('is-active');p.hidden=false;}}; }}); tabbar.appendChild(tab); }}); root.appendChild(tabbar);
    var overview=el('div','sg-overview-grid'); overview.appendChild(renderNodes(data)); overview.appendChild(renderList(data.facts,'sg-fact-list')); views.appendChild(panel('sg-panel-overview','结构概览',overview,true));
    var content=el('div','sg-content-list'); (data.sections||[]).forEach(function(sec){{ var block=el('section','sg-section'); block.appendChild(el('h2','sg-section-title',{{text:sec.title||'内容'}})); block.appendChild(renderList(sec.items,'sg-card-grid')); content.appendChild(block); }}); views.appendChild(panel('sg-panel-content','可复用内容',content,false));
    views.appendChild(panel('sg-panel-media','媒体资产',renderImages(data.images),false));
    var facts=el('div','sg-facts-wrap'); facts.appendChild(renderTimeline(data)); facts.appendChild(el('div','sg-year-strip',{{'aria-label':'时间信息'}})); var yearStrip=facts.lastChild; (data.years||[]).forEach(function(y){{yearStrip.appendChild(el('span','sg-year',{{text:y}}));}}); views.appendChild(panel('sg-panel-facts','事实与逻辑',facts,false)); root.appendChild(views);
    root.appendChild(el('div','sg-live',{{'aria-live':'polite','aria-atomic':'true'}})); return root;
  }}
  function mount(container, options) {{ if(typeof container==='string')container=document.querySelector(container); if(!container)throw new Error('mount container not found'); container.innerHTML=''; var node=create(options); container.appendChild(node); return node; }}
  var API={{create:create,mount:mount}}; global.{global_name}=API; global['{global_name}']=API;
}})(window);
'''

def css(theme: dict) -> str:
    return f''':root {{
  --sg-primary: {theme['primary']}; --sg-accent: {theme['accent']}; --sg-ink: {theme['ink']};
  --sg-muted: {theme['muted']}; --sg-subtle: {theme['subtle']}; --sg-line: {theme['line']};
  --sg-paper: {theme['paper']}; --sg-stage: {theme['stage']}; --sg-soft: {theme['soft']};
  --sg-frame-w: 920px; --sg-frame-h: 680px; --sg-radius: 18px;
  --sg-shadow: 0 18px 50px rgba(30,31,36,.12); --sg-fast: .18s; --sg-mid: .3s;
}}
.sg-frame, .sg-frame * {{ box-sizing:border-box; }}
.sg-frame {{ width:min(var(--sg-frame-w),100%); min-height:var(--sg-frame-h); margin:0 auto; overflow:hidden; color:var(--sg-ink); background:var(--sg-paper); border:1px solid var(--sg-line); border-radius:var(--sg-radius); box-shadow:var(--sg-shadow); font-family:Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif; line-height:1.55; }}
.sg-hero {{ padding:28px 32px 22px; background:linear-gradient(135deg,var(--sg-paper),var(--sg-soft)); border-bottom:1px solid var(--sg-line); }}
.sg-kicker,.sg-panel-kicker {{ color:var(--sg-primary); font-size:12px; font-weight:700; letter-spacing:.08em; }}
.sg-title {{ margin:6px 0 8px; font-size:28px; line-height:1.2; }} .sg-summary {{ max-width:760px; margin:0; color:var(--sg-muted); font-size:14px; }}
.sg-tab-bar {{ display:grid; grid-template-columns:repeat(4,1fr); min-height:48px; padding:0 22px; border-bottom:1px solid var(--sg-line); background:var(--sg-paper); }}
.sg-tab {{ border:0; border-bottom:2px solid transparent; background:transparent; color:var(--sg-muted); cursor:pointer; font:inherit; font-size:13px; font-weight:650; }} .sg-tab.is-active {{ color:var(--sg-ink); border-bottom-color:var(--sg-primary); }}
.sg-view-stack {{ min-height:480px; }} .sg-panel {{ padding:24px 32px 30px; }} .sg-panel[hidden] {{ display:none; }} .sg-panel-head {{ margin-bottom:18px; }}
.sg-overview-grid {{ display:grid; grid-template-columns:1.2fr .8fr; gap:22px; align-items:start; }} .sg-node-map {{ display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding:18px; background:var(--sg-stage); border-radius:14px; min-height:220px; }}
.sg-node {{ display:flex; align-items:center; gap:8px; min-height:48px; padding:10px 12px; border:1px solid var(--sg-line); border-radius:12px; background:var(--sg-paper); color:var(--sg-ink); cursor:pointer; text-align:left; transition:transform var(--sg-fast),border-color var(--sg-fast); }} .sg-node:hover {{ transform:translateY(-2px); border-color:var(--sg-primary); }} .sg-node-dot,.sg-card-mark {{ flex:0 0 auto; width:8px; height:8px; border-radius:50%; background:var(--sg-primary); }} .sg-node-label {{ font-size:13px; }}
.sg-fact-list,.sg-card-grid {{ display:grid; gap:10px; }} .sg-card {{ display:flex; gap:10px; padding:13px 14px; border:1px solid var(--sg-line); border-radius:12px; background:var(--sg-paper); }} .sg-card-text {{ margin:0; color:var(--sg-muted); font-size:13px; }} .sg-card-label {{ display:block; min-width:72px; font-size:13px; }}
.sg-content-list {{ display:grid; gap:22px; }} .sg-section-title {{ margin:0 0 10px; font-size:17px; }} .sg-section-title::before {{ content:""; display:inline-block; width:4px; height:17px; margin-right:8px; vertical-align:-2px; border-radius:4px; background:var(--sg-accent); }}
.sg-media-grid {{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }} .sg-media-card {{ min-width:0; margin:0; overflow:hidden; border:1px solid var(--sg-line); border-radius:12px; background:var(--sg-stage); }} .sg-media-img {{ display:block; width:100%; height:130px; object-fit:cover; }} .sg-media-caption {{ padding:8px 10px; color:var(--sg-muted); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }} .sg-media-missing {{ min-height:50px; }}
.sg-timeline {{ display:grid; gap:0; }} .sg-timeline-item {{ display:grid; grid-template-columns:46px 1fr; gap:12px; padding:14px 0; border-bottom:1px solid var(--sg-line); }} .sg-timeline-index {{ color:var(--sg-primary); font-variant-numeric:tabular-nums; font-size:12px; font-weight:750; }} .sg-timeline-title {{ display:block; font-size:14px; }} .sg-timeline-desc {{ margin:3px 0 0; color:var(--sg-muted); font-size:13px; }} .sg-year-strip {{ display:flex; flex-wrap:wrap; gap:7px; margin-top:18px; }} .sg-year {{ padding:4px 9px; border-radius:999px; background:var(--sg-soft); color:var(--sg-primary); font-size:11px; }} .sg-live {{ position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); }}
@media (max-width:500px) {{ .sg-frame {{ min-height:456px; border-radius:12px; }} .sg-hero {{ padding:20px 18px 16px; }} .sg-title {{ font-size:22px; }} .sg-tab-bar {{ padding:0 10px; }} .sg-panel {{ padding:18px; }} .sg-overview-grid {{ grid-template-columns:1fr; }} .sg-node-map {{ grid-template-columns:repeat(2,1fr); }} .sg-media-grid {{ grid-template-columns:repeat(2,1fr); }} .sg-media-img {{ height:100px; }} }}
@media (max-width:320px) and (max-height:380px) {{ .sg-frame {{ width:100%; min-width:280px; min-height:340px; border-radius:8px; }} .sg-summary {{ display:none; }} .sg-hero {{ padding:14px; }} .sg-title {{ font-size:18px; }} .sg-tab {{ font-size:11px; }} .sg-panel {{ padding:14px; }} .sg-node-map {{ grid-template-columns:1fr; min-height:0; }} .sg-media-grid {{ grid-template-columns:1fr 1fr; }} .sg-media-img {{ height:70px; }} .sg-year-strip {{ display:none; }} }}
'''

def readme(cat, display, kind, entries):
    names='、'.join(e['title'] for e in entries[:8]) + ('……' if len(entries)>8 else '')
    return f'''# {display}组件库\n\n垂类：**{cat}**。本库由 `ui-dismantler` 批量从词条 HTML 提取并归一化生成，覆盖 {len(entries)} 个词条示例。\n\n## 快速开始\n\n```html\n<link rel="stylesheet" href="./src/{safe_slug(display)}.css">\n<div id="mount"></div>\n<script src="./src/{safe_slug(display)}.js"></script>\n<script>\n  const data = JSON.parse(document.querySelector('#sg-data').textContent);\n  {pascal(display)}.mount('#mount', data);\n</script>\n```\n\n## API\n\n- `{pascal(display)}.mount(container, options)`：挂载组件并返回根节点。\n- `{pascal(display)}.create(options)`：创建根节点。\n- 所有内容经 `examples/*.html` 中的 `application/json` 数据注入，渲染引擎不硬编码词条文案。\n\n## 数据契约\n\n`title`、`summary`、`sections[]`、`facts[]`、`nodes[]`、`years[]`、`images[]`、`theme`。`images[].src` 使用词条原始目录中的素材相对路径。\n\n## 主题定制\n\n覆盖 `theme.primary/accent/ink/muted/subtle/line/paper/stage/soft` 即可改变主题；CSS 内部统一使用 `--sg-*` 令牌。\n\n## 已拆解词条\n\n{names}\n\n## 文件结构\n\n- `src/{safe_slug(display)}.js`：无依赖渲染引擎，提供 A11y Tab/tabpanel、键盘可访问按钮和 `aria-live` 播报区。\n- `src/{safe_slug(display)}.css`：参数化主题、PC/Wise/极端三档响应式。\n- `examples/`：每个词条一个数据驱动案例，另含 `template.html`。\n- `manifest.json`：批量提取结果与源文件映射。\n'''

def pascal(s):
    parts=re.findall(r'[0-9A-Za-z\u4e00-\u9fff]+', s)
    out=''.join((p[0].upper()+p[1:]) for p in parts) or 'VerticalLib'
    return out+'Lib'

def design_doc(cat, display, kind, entries, theme):
    tokens='\n'.join(f'| `--sg-{k}` | `{v}` | 词条主题令牌 |' for k,v in theme.items())
    return f'''# {display}设计规范\n\n## 主题色系统\n\n| 令牌 | 默认值 | 语义 |\n|---|---|---|\n{tokens}\n\n颜色全部经 `--sg-*` 变量注入，词条之间可通过每条数据的 `theme` 覆盖。\n\n## Tab 结构\n\n四个固定视图：**概览**（节点/事实摘要）、**内容**（标题分组与段落）、**素材**（原始图片资产）、**事实**（时间线与年份）。Tab 使用 `role=tablist`、`role=tab`、`aria-selected`、`aria-controls`；面板使用 `role=tabpanel`、`aria-labelledby`。\n\n## 交互模式\n\n- {kind} 词条采用统一的节点/卡片/时间线容器，业务数据由 JSON 驱动。\n- 节点按钮点击后通过 `aria-live=polite` 播报当前节点。\n- 素材加载失败时自动降级为空素材卡，不影响正文。\n- 宿主可替换 `sections`、`facts`、`nodes`、`images`，无需改渲染引擎。\n\n## 响应式\n\n- PC：默认画布 920×680，双列概览、四列素材。\n- WISE：`max-width:500px`，单列概览、两列素材、紧凑间距。\n- 极端：`max-width:320px and max-height:380px`，节点单列、隐藏摘要和年份条。\n\n## 词条覆盖\n\n本垂类共生成 {len(entries)} 个数据示例。\n'''

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--root', type=Path, required=True,
                    help='垂类案例根目录（每个一级子目录代表一个垂类）')
    ap.add_argument('--force', action='store_true')
    args=ap.parse_args()
    root=args.root.expanduser().resolve()
    if not root.is_dir():
        ap.error(f'案例根目录不存在: {root}')
    total=0; libs=[]
    for cat_dir in sorted(root.iterdir()):
        if not cat_dir.is_dir() or cat_dir.name=='明星组合' or cat_dir.name.startswith('.'): continue
        meta=VERTICAL_META.get(cat_dir.name,(cat_dir.name,'可复用词条组件','facts')); display,sub,kind=meta
        entry_payload=[]
        for entry in sorted(x for x in cat_dir.iterdir() if x.is_dir() and x.name!='组件库' and not x.name.startswith('.')):
            for html in sorted(entry.glob('*.html')):
                entry_payload.append(parse_data(html,entry,cat_dir.name))
        if not entry_payload: continue
        out=cat_dir/'组件库'
        if out.exists() and args.force: shutil.rmtree(out)
        (out/'src').mkdir(parents=True,exist_ok=True); (out/'docs').mkdir(exist_ok=True); (out/'examples').mkdir(exist_ok=True)
        theme=entry_payload[0]['theme']
        stem=safe_slug(display)
        (out/'src'/f'{stem}.css').write_text(css(theme),encoding='utf-8')
        (out/'src'/f'{stem}.js').write_text(js_engine(pascal(display),kind),encoding='utf-8')
        (out/'README.md').write_text(readme(cat_dir.name,display,kind,entry_payload),encoding='utf-8')
        (out/'docs'/'设计规范.md').write_text(design_doc(cat_dir.name,display,kind,entry_payload,theme),encoding='utf-8')
        for idx,d in enumerate(entry_payload):
            exslug=safe_slug(d['title']) or f'entry-{idx+1}'
            if (out/'examples'/f'{exslug}.html').exists(): exslug += f'-{idx+1}'
            data=json.dumps(d,ensure_ascii=False,indent=2)
            html=f'''<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>组件示例</title><link rel="stylesheet" href="../src/{stem}.css"></head><body><div id="mount"></div><script type="application/json" id="sg-data">{data}</script><script src="../src/{stem}.js"></script><script>(function(){{var data={data};{pascal(display)}.mount('#mount',data);}})();</script></body></html>\n'''
            (out/'examples'/f'{exslug}.html').write_text(html,encoding='utf-8')
            total+=1
        template={'title':'示例词条','subtitle':sub,'kind':kind,'summary':'替换 JSON 数据即可复用此垂类组件。','sections':[{'title':'核心内容','items':['将可变内容放入 JSON，而不是写入渲染引擎。']}],'facts':[],'nodes':[],'years':[],'images':[],'theme':theme}
        (out/'examples'/'template.html').write_text(f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="../src/{stem}.css"></head><body><div id="mount"></div><script type="application/json" id="sg-data">{json.dumps(template,ensure_ascii=False,indent=2)}</script><script src="../src/{stem}.js"></script><script>(function(){{var data={json.dumps(template,ensure_ascii=False,indent=2)};{pascal(display)}.mount('#mount',data);}})();</script></body></html>\n''',encoding='utf-8')
        manifest={'vertical':cat_dir.name,'library':display,'kind':kind,'sourceRoot':str(cat_dir),'entries':entry_payload}
        (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
        libs.append((cat_dir.name,out,len(entry_payload)))
    print(f'生成 {len(libs)} 个垂类组件库、{total} 个词条示例')
    for cat,out,n in libs: print(f'[{cat}] {n} -> {out}')
if __name__=='__main__': main()
