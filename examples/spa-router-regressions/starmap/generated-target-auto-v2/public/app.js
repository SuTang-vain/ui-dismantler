const ROUTES=[
  {
    "path": "/",
    "name": "ThemeInput",
    "componentFile": "views/ThemeInput.vue",
    "dynamic": false,
    "resolution": "static-import",
    "confidence": "high",
    "visualBoundary": "boundary:root",
    "ownerIds": [
      "visual:sfc:11"
    ],
    "screenshotAnchors": [],
    "viewports": [
      "desktop",
      "mobile",
      "tablet"
    ]
  },
  {
    "path": "/progress/:taskId",
    "name": "GenerationProgress",
    "componentFile": "views/GenerationProgress.vue",
    "dynamic": false,
    "resolution": "static-import",
    "confidence": "high",
    "visualBoundary": null,
    "ownerIds": [],
    "screenshotAnchors": [],
    "viewports": []
  },
  {
    "path": "/review/:taskId",
    "name": "ReviewPage",
    "componentFile": "views/ReviewPage.vue",
    "dynamic": false,
    "resolution": "static-import",
    "confidence": "high",
    "visualBoundary": null,
    "ownerIds": [],
    "screenshotAnchors": [],
    "viewports": []
  },
  {
    "path": "/export/:taskId",
    "name": "ExportPage",
    "componentFile": "views/ExportPage.vue",
    "dynamic": false,
    "resolution": "static-import",
    "confidence": "high",
    "visualBoundary": null,
    "ownerIds": [],
    "screenshotAnchors": [],
    "viewports": []
  },
  {
    "path": "/profiles",
    "name": "ModelProfiles",
    "componentFile": "views/ModelProfiles.vue",
    "dynamic": false,
    "resolution": "static-import",
    "confidence": "high",
    "visualBoundary": "boundary:profiles",
    "ownerIds": [
      "visual:sfc:9"
    ],
    "screenshotAnchors": [],
    "viewports": [
      "desktop",
      "mobile",
      "tablet"
    ]
  }
];
const OWNER_MARKUP={
  "visual:sfc:9": "\u003csection class=\"auto-v2-owner\" data-visual-owner=\"visual:sfc:9\" data-source-file=\"src/views/ModelProfiles.vue\">\u003cheader>Model Profiles\u003c/header>\u003cdiv class=\"auto-v2-owner-body\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:1\" class=\"profiles-container\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:2\" class=\"profiles-header\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:3\">\u003ch1 data-primitive-node=\"auto-v2-visual:sfc:9:template:4\" class=\"profiles-title\">后台模型配置\u003c/h1>\u003cp data-primitive-node=\"auto-v2-visual:sfc:9:template:5\" class=\"profiles-subtitle\">把常用的大模型参数保存为配置单，生成任务时一键套用，避免每次重复输入。\u003c/p>\u003c/div>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:6\" class=\"btn btn-primary\" data-auto-v2-events=\"click\"> ＋ 新建配置 \u003c/button>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:7\" class=\"profile-list\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:8\" class=\"profile-card\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:9\" class=\"card-head\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:10\" class=\"card-title\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:11\" class=\"dot\">\u003c/span>\u003cstrong data-primitive-node=\"auto-v2-visual:sfc:9:template:12\">\u003c/strong>\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:13\" class=\"badge provider\">\u003c/span>\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:14\" class=\"badge default-badge\">默认\u003c/span>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:15\" class=\"card-actions\">\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:16\" class=\"btn-link\" data-auto-v2-events=\"click\"> 选用 \u003c/button>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:17\" class=\"btn-link\" data-auto-v2-events=\"click\"> 设为默认 \u003c/button>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:18\" class=\"btn-link\" data-auto-v2-events=\"click\">编辑\u003c/button>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:19\" class=\"btn-link danger\" data-auto-v2-events=\"click\">删除\u003c/button>\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:20\" class=\"card-meta\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:21\" class=\"meta-row\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:22\" class=\"meta-label\">模型：\u003c/span>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:23\" class=\"meta-value\">\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:24\" class=\"meta-row\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:25\" class=\"meta-label\">API URL：\u003c/span>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:26\" class=\"meta-value\">\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:27\" class=\"meta-row\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:28\" class=\"meta-label\">API Key：\u003c/span>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:29\" class=\"meta-value\">\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:30\" class=\"meta-row\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:31\" class=\"meta-label\">参数：\u003c/span>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:32\" class=\"meta-value\">temperature=, max_tokens=\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:33\" class=\"meta-row\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:34\" class=\"meta-label\">更新于：\u003c/span>\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:35\" class=\"meta-value muted\">\u003c/span>\u003c/div>\u003c/div>\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:36\" class=\"empty\">加载中…\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:37\" class=\"empty\">\u003cp data-primitive-node=\"auto-v2-visual:sfc:9:template:38\">暂无配置单\u003c/p>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:39\" class=\"btn btn-primary\" data-auto-v2-events=\"click\">+ 创建第一个配置\u003c/button>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:40\" class=\"modal-mask\" data-auto-v2-events=\"click\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:41\" class=\"modal\">\u003cheader data-primitive-node=\"auto-v2-visual:sfc:9:template:42\" class=\"modal-head\">\u003ch2 data-primitive-node=\"auto-v2-visual:sfc:9:template:43\">\u003c/h2>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:44\" class=\"btn-link\" data-auto-v2-events=\"click\">关闭\u003c/button>\u003c/header>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:45\" class=\"modal-body\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:46\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:47\">名称 *\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:9:template:48\" placeholder=\"如 MiniMax-M3 默认配置\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:49\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:50\">Provider *\u003c/label>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:51\" data-auto-v2-events=\"change\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:52\">  \u003c/div>\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:53\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:54\">模型\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:9:template:55\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:56\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:57\">自定义 API URL *\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:9:template:58\" placeholder=\"https://api.example.com/v1/chat/completions\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:59\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:60\">Secret Key（仅文心需要）\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:9:template:61\" type=\"password\" placeholder=\"百度文心的 client_secret\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:62\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:63\">API Key\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:9:template:64\" type=\"password\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:65\" class=\"form-row\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:66\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:67\">temperature\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:9:template:68\" type=\"number\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:69\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:70\">max_tokens\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:9:template:71\" type=\"number\">\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:72\" class=\"checkbox form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:73\">\u003cinput data-primitive-node=\"auto-v2-visual:sfc:9:template:74\" type=\"checkbox\"> 设为默认（生成任务时优先套用） \u003c/label>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:75\" class=\"form-error\">\u003c/div>\u003c/div>\u003cfooter data-primitive-node=\"auto-v2-visual:sfc:9:template:76\" class=\"modal-foot\">\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:77\" class=\"btn btn-text\" data-auto-v2-events=\"click\">取消\u003c/button>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:78\" class=\"btn btn-primary\" data-auto-v2-events=\"click\">  \u003c/button>\u003c/footer>\u003c/div>\u003c/div>\u003c/div>\u003c/div>\u003c/section>",
  "visual:sfc:11": "\u003csection class=\"auto-v2-owner\" data-visual-owner=\"visual:sfc:11\" data-source-file=\"src/views/ThemeInput.vue\">\u003cheader>Theme Input\u003c/header>\u003cdiv class=\"auto-v2-owner-body\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:1\" class=\"theme-input-container\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:2\" class=\"hero-section\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:3\" class=\"hero-content\">\u003ch1 data-primitive-node=\"auto-v2-visual:sfc:11:template:4\" class=\"hero-title\">星图生产辅助 Agent\u003c/h1>\u003cp data-primitive-node=\"auto-v2-visual:sfc:11:template:5\" class=\"hero-subtitle\">AI 驱动的星图自动生成与智能审核系统\u003c/p>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:6\" class=\"hero-link\"> ⚙️ 后台模型配置 \u003c/div>\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:7\" class=\"config-banner\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:11:template:8\" class=\"banner-icon\">⚡\u003c/span>\u003cspan data-primitive-node=\"auto-v2-visual:sfc:11:template:9\">当前使用配置：\u003cstrong data-primitive-node=\"auto-v2-visual:sfc:11:template:10\">\u003c/strong>\u003cspan data-primitive-node=\"auto-v2-visual:sfc:11:template:11\" class=\"banner-meta\">  ·  \u003c/span>\u003c/span>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:12\" class=\"banner-link\">更换\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:13\" class=\"form-container\">\u003cform data-primitive-node=\"auto-v2-visual:sfc:11:template:14\" class=\"input-form\" data-auto-v2-events=\"submit\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:15\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:11:template:16\">星图主题名称 \u003cspan data-primitive-node=\"auto-v2-visual:sfc:11:template:17\" class=\"required\">*\u003c/span>\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:11:template:18\" type=\"text\" placeholder=\"请输入星图主题名称\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:19\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:11:template:20\">目标说明 \u003cspan data-primitive-node=\"auto-v2-visual:sfc:11:template:21\" class=\"required\">*\u003c/span>\u003c/label>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:22\" placeholder=\"请描述生成目标和预期效果\">\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:23\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:11:template:24\">参考词条\u003c/label>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:25\" placeholder=\"请输入参考词条，多个词条用逗号分隔\">\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:26\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:11:template:27\">垂类提示\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:11:template:28\" type=\"text\" placeholder=\"如：人物、地点、事件等\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:29\" class=\"advanced-section\">\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:11:template:30\" class=\"advanced-toggle\" type=\"button\" data-auto-v2-events=\"click\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:11:template:31\" class=\"arrow\">\u003c/span> 高级选项：LLM 生成配置 \u003c/button>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:32\" class=\"advanced-content\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:33\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:11:template:34\">LLM 调用模式\u003c/label>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:35\" class=\"radio-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:11:template:36\" class=\"radio-item\">\u003cinput data-primitive-node=\"auto-v2-visual:sfc:11:template:37\" type=\"radio\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:38\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:39\" class=\"radio-label\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:40\" class=\"radio-desc\">\u003c/div>\u003c/div>\u003c/label>\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:41\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:42\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:11:template:43\">LLM Provider\u003c/label>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:44\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:45\">  \u003c/div>\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:46\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:11:template:47\">模型（可选）\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:11:template:48\" type=\"text\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:49\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:11:template:50\">API Key（可选，运行时覆盖 .env）\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:11:template:51\" type=\"password\" placeholder=\"不填则使用后端 .env 配置\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:52\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:11:template:53\">自定义 API URL\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:11:template:54\" type=\"text\" placeholder=\"例如 https://your-llm-api.com/v1\">\u003c/div>\u003c/div>\u003c/div>\u003c/div>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:11:template:55\" class=\"submit-btn\" type=\"submit\">  \u003c/button>\u003c/form>\u003c/div>\u003c/div>\u003c/div>\u003c/section>"
};
const BOUNDARIES={
  "boundary:root": {
    "route": "/",
    "ownerIds": [
      "visual:sfc:11"
    ]
  },
  "boundary:profiles": {
    "route": "/profiles",
    "ownerIds": [
      "visual:sfc:9"
    ]
  }
};
const app=document.getElementById('app');
const normalize=(value)=>{const hash=value.includes('#')?value.slice(value.indexOf('#')+1):value;const path=(hash.split('?')[0]||'/');return path.startsWith('/')?path:'/'+path};
const matches=(path,pattern)=>{const a=normalize(path).split('/').filter(Boolean),b=normalize(pattern).split('/').filter(Boolean);return a.length===b.length&&b.every((part,index)=>part.startsWith(':')||part==='*'||part===a[index])};
const routeFor=(path)=>ROUTES.find((route)=>matches(path,route.path))||ROUTES[0];
const render=()=>{const path=normalize(location.pathname+location.search),route=routeFor(path);const owners=(route.ownerIds||[]).map((id)=>OWNER_MARKUP['visual:'+id]||OWNER_MARKUP[id]||'').join('');app.innerHTML='<nav class="auto-v2-nav">'+ROUTES.map((item)=>'<a href="'+item.path+'" data-auto-v2-route="'+item.path+'">'+(item.name||item.path)+'</a>').join('')+'</nav><main data-auto-v2-route="'+route.path+'" data-auto-v2-component="'+(route.componentFile||'')+'"><h1>'+((route.name||route.path))+'</h1>'+owners+'</main>';document.title=route.name||route.path;document.querySelectorAll('[data-auto-v2-route]').forEach((node)=>node.addEventListener('click',(event)=>{if(node.tagName==='A'){event.preventDefault();history.pushState({autoV2:true,route:node.getAttribute('href')},'',node.getAttribute('href'));render()}}))};
history.replaceState({autoV2:true,route:"/"},'',location.href);addEventListener('popstate',render);render();
void BOUNDARIES;
