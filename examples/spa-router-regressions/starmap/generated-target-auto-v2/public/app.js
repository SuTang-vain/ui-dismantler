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
  "visual:sfc:9": "\u003csection class=\"auto-v2-owner\" data-visual-owner=\"visual:sfc:9\" data-source-file=\"src/views/ModelProfiles.vue\">\u003cheader>Model Profiles\u003c/header>\u003cdiv class=\"auto-v2-owner-body\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:1\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0\" class=\"profiles-container\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:2\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-1\" class=\"profiles-header\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:3\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-1-2\">\u003ch1 data-primitive-node=\"auto-v2-visual:sfc:9:template:4\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-1-2-3\" class=\"profiles-title\">后台模型配置\u003c/h1>\u003cp data-primitive-node=\"auto-v2-visual:sfc:9:template:5\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-1-2-4\" class=\"profiles-subtitle\">把常用的大模型参数保存为配置单，生成任务时一键套用，避免每次重复输入。\u003c/p>\u003c/div>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:6\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-1-5\" class=\"btn btn-primary\" data-auto-v2-events=\"click\"> ＋ 新建配置 \u003c/button>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:7\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6\" data-auto-v2-condition=\"visual:sfc:9:template:7:0\" class=\"profile-list\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:8\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0\" class=\"profile-card active\" key=\"profile-reviewed-1\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:9\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-8\" class=\"card-head\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:10\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-8-9\" class=\"card-title\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:11\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-8-9-10\" class=\"dot default\">\u003c/span>\u003cstrong data-primitive-node=\"auto-v2-visual:sfc:9:template:12\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-8-9-11\">Reviewed Profile\u003c/strong>\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:13\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-8-9-12\" class=\"badge provider\">anthropic\u003c/span>\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:14\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-8-9-13\" class=\"badge default-badge\">默认\u003c/span>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:15\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-8-14\" class=\"card-actions\">\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:16\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-8-14-15\" data-auto-v2-condition=\"visual:sfc:9:template:16:1\" class=\"btn-link\" data-auto-v2-events=\"click\"> 选用 \u003c/button>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:18\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-8-14-17\" class=\"btn-link\" data-auto-v2-events=\"click\">编辑\u003c/button>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:19\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-8-14-18\" class=\"btn-link danger\" data-auto-v2-events=\"click\">删除\u003c/button>\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:20\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-19\" class=\"card-meta\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:21\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-19-20\" class=\"meta-row\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:22\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-19-20-21\" class=\"meta-label\">模型：\u003c/span>\u003ccode data-primitive-node=\"auto-v2-visual:sfc:9:template:23\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-19-20-22\" class=\"meta-value\">claude-sonnet-4-20250514\u003c/code>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:24\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-19-23\" class=\"meta-row\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:25\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-19-23-24\" class=\"meta-label\">API URL：\u003c/span>\u003ccode data-primitive-node=\"auto-v2-visual:sfc:9:template:26\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-19-23-25\" class=\"meta-value\">https://api.anthropic.com\u003c/code>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:27\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-19-26\" class=\"meta-row\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:28\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-19-26-27\" class=\"meta-label\">API Key：\u003c/span>\u003ccode data-primitive-node=\"auto-v2-visual:sfc:9:template:29\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-19-26-28\" class=\"meta-value\">sk-reviewed\u003c/code>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:30\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-19-29\" class=\"meta-row\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:31\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-19-29-30\" class=\"meta-label\">参数：\u003c/span>\u003ccode data-primitive-node=\"auto-v2-visual:sfc:9:template:32\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-19-29-31\" class=\"meta-value\">temperature=0.5, max_tokens=800\u003c/code>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:33\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-19-32\" class=\"meta-row\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:34\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-19-32-33\" class=\"meta-label\">更新于：\u003c/span>\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:35\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-0-19-32-34\" class=\"meta-value muted\">2026/7/20 10:30:00\u003c/span>\u003c/div>\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:8\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1\" class=\"profile-card\" key=\"profile-reviewed-2\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:9\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-8\" class=\"card-head\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:10\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-8-9\" class=\"card-title\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:11\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-8-9-10\" class=\"dot\">\u003c/span>\u003cstrong data-primitive-node=\"auto-v2-visual:sfc:9:template:12\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-8-9-11\">OpenAI Production\u003c/strong>\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:13\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-8-9-12\" class=\"badge provider\">openai\u003c/span>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:15\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-8-14\" class=\"card-actions\">\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:16\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-8-14-15\" data-auto-v2-condition=\"visual:sfc:9:template:16:2\" class=\"btn-link\" data-auto-v2-events=\"click\"> 选用 \u003c/button>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:17\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-8-14-16\" class=\"btn-link\" data-auto-v2-events=\"click\"> 设为默认 \u003c/button>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:18\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-8-14-17\" class=\"btn-link\" data-auto-v2-events=\"click\">编辑\u003c/button>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:19\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-8-14-18\" class=\"btn-link danger\" data-auto-v2-events=\"click\">删除\u003c/button>\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:20\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-19\" class=\"card-meta\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:21\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-19-20\" class=\"meta-row\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:22\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-19-20-21\" class=\"meta-label\">模型：\u003c/span>\u003ccode data-primitive-node=\"auto-v2-visual:sfc:9:template:23\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-19-20-22\" class=\"meta-value\">gpt-4.1\u003c/code>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:24\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-19-23\" class=\"meta-row\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:25\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-19-23-24\" class=\"meta-label\">API URL：\u003c/span>\u003ccode data-primitive-node=\"auto-v2-visual:sfc:9:template:26\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-19-23-25\" class=\"meta-value\">https://api.openai.com/v1\u003c/code>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:27\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-19-26\" class=\"meta-row\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:28\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-19-26-27\" class=\"meta-label\">API Key：\u003c/span>\u003ccode data-primitive-node=\"auto-v2-visual:sfc:9:template:29\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-19-26-28\" class=\"meta-value\">（未设置）\u003c/code>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:30\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-19-29\" class=\"meta-row\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:31\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-19-29-30\" class=\"meta-label\">参数：\u003c/span>\u003ccode data-primitive-node=\"auto-v2-visual:sfc:9:template:32\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-19-29-31\" class=\"meta-value\">temperature=0.2, max_tokens=1600\u003c/code>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:33\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-19-32\" class=\"meta-row\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:34\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-19-32-33\" class=\"meta-label\">更新于：\u003c/span>\u003cspan data-primitive-node=\"auto-v2-visual:sfc:9:template:35\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-6-7-1-19-32-34\" class=\"meta-value muted\">2026/7/21 14:10:00\u003c/span>\u003c/div>\u003c/div>\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:36\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-35\" data-auto-v2-condition=\"visual:sfc:9:template:36:3\" class=\"empty\">加载中…\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:37\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-36\" data-auto-v2-condition=\"visual:sfc:9:template:37:4\" class=\"empty\">\u003cp data-primitive-node=\"auto-v2-visual:sfc:9:template:38\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-36-37\">暂无配置单\u003c/p>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:39\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-36-38\" class=\"btn btn-primary\" data-auto-v2-events=\"click\">+ 创建第一个配置\u003c/button>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:40\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39\" data-auto-v2-condition=\"visual:sfc:9:template:40:5\" class=\"modal-mask\" data-auto-v2-events=\"click\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:41\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40\" class=\"modal\">\u003cheader data-primitive-node=\"auto-v2-visual:sfc:9:template:42\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-41\" class=\"modal-head\">\u003ch2 data-primitive-node=\"auto-v2-visual:sfc:9:template:43\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-41-42\">新建配置\u003c/h2>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:44\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-41-43\" class=\"btn-link\" data-auto-v2-events=\"click\">关闭\u003c/button>\u003c/header>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:45\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44\" class=\"modal-body\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:46\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-45\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:47\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-45-46\">名称 *\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:9:template:48\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-45-47\" placeholder=\"如 MiniMax-M3 默认配置\" value=\"\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:49\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-48\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:50\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-48-49\">Provider *\u003c/label>\u003cselect data-primitive-node=\"auto-v2-visual:sfc:9:template:51\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-48-50\" value=\"anthropic\" data-auto-v2-events=\"change\">\u003coption data-primitive-node=\"auto-v2-visual:sfc:9:template:52\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-48-50-51-0\">  \u003c/option>\u003c/select>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:53\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-52\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:54\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-52-53\">模型\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:9:template:55\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-52-54\" value=\"\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:56\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-55\" data-auto-v2-condition=\"visual:sfc:9:template:56:6\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:57\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-55-56\">自定义 API URL *\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:9:template:58\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-55-57\" placeholder=\"https://api.example.com/v1/chat/completions\" value=\"\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:59\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-58\" data-auto-v2-condition=\"visual:sfc:9:template:59:7\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:60\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-58-59\">Secret Key（仅文心需要）\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:9:template:61\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-58-60\" type=\"password\" placeholder=\"百度文心的 client_secret\" value=\"\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:62\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-61\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:63\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-61-62\">API Key\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:9:template:64\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-61-63\" type=\"password\" placeholder=\"可选；运行时覆盖 .env\" value=\"\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:65\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-64\" class=\"form-row\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:66\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-64-65\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:67\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-64-65-66\">temperature\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:9:template:68\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-64-65-67\" type=\"number\" step=\"0.1\" min=\"0\" max=\"2\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:69\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-64-68\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:70\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-64-68-69\">max_tokens\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:9:template:71\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-64-68-70\" type=\"number\" min=\"100\" max=\"32000\">\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:72\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-71\" class=\"checkbox form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:9:template:73\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-71-72\">\u003cinput data-primitive-node=\"auto-v2-visual:sfc:9:template:74\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-71-72-73\" type=\"checkbox\"> 设为默认（生成任务时优先套用） \u003c/label>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:9:template:75\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-44-74\" data-auto-v2-condition=\"visual:sfc:9:template:75:8\" class=\"form-error\">\u003c/div>\u003c/div>\u003cfooter data-primitive-node=\"auto-v2-visual:sfc:9:template:76\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-75\" class=\"modal-foot\">\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:77\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-75-76\" class=\"btn btn-text\" data-auto-v2-events=\"click\">取消\u003c/button>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:9:template:78\" data-auto-v2-owner=\"visual:sfc:9\" data-auto-v2-instance=\"root-0-39-40-75-77\" class=\"btn btn-primary\" data-auto-v2-events=\"click\"> 保存 \u003c/button>\u003c/footer>\u003c/div>\u003c/div>\u003c/div>\u003c/div>\u003c/section>",
  "visual:sfc:11": "\u003csection class=\"auto-v2-owner\" data-visual-owner=\"visual:sfc:11\" data-source-file=\"src/views/ThemeInput.vue\">\u003cheader>Theme Input\u003c/header>\u003cdiv class=\"auto-v2-owner-body\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:1\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0\" class=\"theme-input-container\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:2\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-1\" class=\"hero-section\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:3\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-1-2\" class=\"hero-content\">\u003ch1 data-primitive-node=\"auto-v2-visual:sfc:11:template:4\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-1-2-3\" class=\"hero-title\">星图生产辅助 Agent\u003c/h1>\u003cp data-primitive-node=\"auto-v2-visual:sfc:11:template:5\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-1-2-4\" class=\"hero-subtitle\">AI 驱动的星图自动生成与智能审核系统\u003c/p>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:6\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-1-2-5\" class=\"hero-link\"> ⚙️ 后台模型配置 \u003c/div>\u003c/div>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:13\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12\" class=\"form-container\">\u003cform data-primitive-node=\"auto-v2-visual:sfc:11:template:14\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13\" class=\"input-form\" data-auto-v2-events=\"submit\">\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:15\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-14\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:11:template:16\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-14-15\" for=\"themeName\">星图主题名称 \u003cspan data-primitive-node=\"auto-v2-visual:sfc:11:template:17\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-14-15-16\" class=\"required\">*\u003c/span>\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:11:template:18\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-14-17\" id=\"themeName\" type=\"text\" placeholder=\"请输入星图主题名称\" required value=\"\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:19\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-18\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:11:template:20\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-18-19\" for=\"objective\">目标说明 \u003cspan data-primitive-node=\"auto-v2-visual:sfc:11:template:21\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-18-19-20\" class=\"required\">*\u003c/span>\u003c/label>\u003ctextarea data-primitive-node=\"auto-v2-visual:sfc:11:template:22\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-18-21\" id=\"objective\" placeholder=\"请描述生成目标和预期效果\" rows=\"4\" required value=\"\">\u003c/textarea>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:23\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-22\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:11:template:24\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-22-23\" for=\"referenceEntries\">参考词条\u003c/label>\u003ctextarea data-primitive-node=\"auto-v2-visual:sfc:11:template:25\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-22-24\" id=\"referenceEntries\" placeholder=\"请输入参考词条，多个词条用逗号分隔\" rows=\"3\" value=\"\">\u003c/textarea>\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:26\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-25\" class=\"form-group\">\u003clabel data-primitive-node=\"auto-v2-visual:sfc:11:template:27\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-25-26\" for=\"categoryHint\">垂类提示\u003c/label>\u003cinput data-primitive-node=\"auto-v2-visual:sfc:11:template:28\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-25-27\" id=\"categoryHint\" type=\"text\" placeholder=\"如：人物、地点、事件等\" value=\"\">\u003c/div>\u003cdiv data-primitive-node=\"auto-v2-visual:sfc:11:template:29\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-28\" class=\"advanced-section\">\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:11:template:30\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-28-29\" class=\"advanced-toggle\" type=\"button\" data-auto-v2-events=\"click\">\u003cspan data-primitive-node=\"auto-v2-visual:sfc:11:template:31\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-28-29-30\" class=\"arrow\">▶\u003c/span> 高级选项：LLM 生成配置 \u003c/button>\u003c/div>\u003cbutton data-primitive-node=\"auto-v2-visual:sfc:11:template:55\" data-auto-v2-owner=\"visual:sfc:11\" data-auto-v2-instance=\"root-0-12-13-54\" class=\"submit-btn\" type=\"submit\"> 开始生成 \u003c/button>\u003c/form>\u003c/div>\u003c/div>\u003c/div>\u003c/section>"
};
const OWNER_RUNTIME={
  "visual:sfc:9": {
    "initialState": {
      "profiles": [
        {
          "id": "profile-reviewed-1",
          "name": "Reviewed Profile",
          "provider": "anthropic",
          "model": "claude-sonnet-4-20250514",
          "apiUrl": "https://api.anthropic.com",
          "apiKey": "sk-reviewed",
          "temperature": 0.5,
          "maxTokens": 800,
          "updatedAt": "2026-07-20T02:30:00.000Z",
          "isDefault": true
        },
        {
          "id": "profile-reviewed-2",
          "name": "OpenAI Production",
          "provider": "openai",
          "model": "gpt-4.1",
          "apiUrl": "https://api.openai.com/v1",
          "apiKey": "（未设置）",
          "temperature": 0.2,
          "maxTokens": 1600,
          "updatedAt": "2026-07-21T06:10:00.000Z",
          "isDefault": false
        }
      ],
      "loading": false,
      "editor": {
        "open": false,
        "id": "",
        "saving": false,
        "error": "",
        "form": {
          "name": "",
          "provider": "anthropic",
          "model": "",
          "apiUrl": "",
          "apiKey": "",
          "secretKey": "",
          "temperature": 0.5,
          "maxTokens": 800,
          "isDefault": false
        }
      },
      "selectedId": "profile-reviewed-1"
    },
    "displayFunctions": [
      {
        "functionName": "formatTime",
        "parameter": "iso",
        "operation": "date-locale-string",
        "locale": "zh-CN",
        "fallback": "—",
        "sourceLine": 52,
        "confidence": "high"
      }
    ],
    "conditions": [
      {
        "key": "visual:sfc:9:template:7:0",
        "expression": {
          "kind": "logical",
          "operator": "&&",
          "left": {
            "kind": "unary",
            "operator": "!",
            "argument": {
              "kind": "path",
              "path": "loading"
            }
          },
          "right": {
            "kind": "path",
            "path": "profiles.length"
          }
        }
      },
      {
        "key": "visual:sfc:9:template:16:1",
        "expression": {
          "kind": "binary",
          "operator": "!==",
          "left": {
            "kind": "path",
            "path": "selectedId"
          },
          "right": {
            "kind": "literal",
            "value": "profile-reviewed-1"
          }
        }
      },
      {
        "key": "visual:sfc:9:template:16:2",
        "expression": {
          "kind": "binary",
          "operator": "!==",
          "left": {
            "kind": "path",
            "path": "selectedId"
          },
          "right": {
            "kind": "literal",
            "value": "profile-reviewed-2"
          }
        }
      },
      {
        "key": "visual:sfc:9:template:36:3",
        "expression": {
          "kind": "logical",
          "operator": "&&",
          "left": {
            "kind": "unary",
            "operator": "!",
            "argument": {
              "kind": "logical",
              "operator": "&&",
              "left": {
                "kind": "unary",
                "operator": "!",
                "argument": {
                  "kind": "path",
                  "path": "loading"
                }
              },
              "right": {
                "kind": "path",
                "path": "profiles.length"
              }
            }
          },
          "right": {
            "kind": "path",
            "path": "loading"
          }
        }
      },
      {
        "key": "visual:sfc:9:template:37:4",
        "expression": {
          "kind": "unary",
          "operator": "!",
          "argument": {
            "kind": "logical",
            "operator": "||",
            "left": {
              "kind": "logical",
              "operator": "&&",
              "left": {
                "kind": "unary",
                "operator": "!",
                "argument": {
                  "kind": "path",
                  "path": "loading"
                }
              },
              "right": {
                "kind": "path",
                "path": "profiles.length"
              }
            },
            "right": {
              "kind": "path",
              "path": "loading"
            }
          }
        }
      },
      {
        "key": "visual:sfc:9:template:40:5",
        "expression": {
          "kind": "path",
          "path": "editor.open"
        }
      },
      {
        "key": "visual:sfc:9:template:56:6",
        "expression": {
          "kind": "binary",
          "operator": "===",
          "left": {
            "kind": "path",
            "path": "editor.form.provider"
          },
          "right": {
            "kind": "literal",
            "value": "custom"
          }
        }
      },
      {
        "key": "visual:sfc:9:template:59:7",
        "expression": {
          "kind": "binary",
          "operator": "===",
          "left": {
            "kind": "path",
            "path": "editor.form.provider"
          },
          "right": {
            "kind": "literal",
            "value": "wenxin"
          }
        }
      },
      {
        "key": "visual:sfc:9:template:75:8",
        "expression": {
          "kind": "path",
          "path": "editor.error"
        }
      }
    ],
    "interactions": [
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:6",
        "event": "click",
        "modifiers": [],
        "writes": [
          {
            "path": "editor.open",
            "value": true
          },
          {
            "path": "editor.saving",
            "value": false
          },
          {
            "path": "editor.error",
            "value": ""
          },
          {
            "path": "editor.form.apiKey",
            "value": ""
          },
          {
            "path": "editor.form.secretKey",
            "value": ""
          },
          {
            "path": "editor.id",
            "value": ""
          },
          {
            "path": "editor.form",
            "value": {
              "name": "",
              "provider": "anthropic",
              "model": "",
              "apiUrl": "",
              "apiKey": "",
              "secretKey": "",
              "temperature": 0.5,
              "maxTokens": 800,
              "isDefault": false
            }
          }
        ]
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:17",
        "event": "click",
        "modifiers": [],
        "writes": [
          {
            "path": "loading",
            "value": true
          },
          {
            "path": "loading",
            "value": false
          }
        ]
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:18",
        "event": "click",
        "modifiers": [],
        "writes": [
          {
            "path": "editor.open",
            "value": true
          },
          {
            "path": "editor.saving",
            "value": false
          },
          {
            "path": "editor.error",
            "value": ""
          },
          {
            "path": "editor.form.apiKey",
            "value": ""
          },
          {
            "path": "editor.form.secretKey",
            "value": ""
          },
          {
            "path": "editor.id",
            "value": ""
          },
          {
            "path": "editor.form",
            "value": {
              "name": "",
              "provider": "anthropic",
              "model": "",
              "apiUrl": "",
              "apiKey": "",
              "secretKey": "",
              "temperature": 0.5,
              "maxTokens": 800,
              "isDefault": false
            }
          }
        ]
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:19",
        "event": "click",
        "modifiers": [],
        "writes": [
          {
            "path": "selectedId",
            "value": ""
          },
          {
            "path": "loading",
            "value": true
          },
          {
            "path": "loading",
            "value": false
          }
        ]
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:39",
        "event": "click",
        "modifiers": [],
        "writes": [
          {
            "path": "editor.open",
            "value": true
          },
          {
            "path": "editor.saving",
            "value": false
          },
          {
            "path": "editor.error",
            "value": ""
          },
          {
            "path": "editor.form.apiKey",
            "value": ""
          },
          {
            "path": "editor.form.secretKey",
            "value": ""
          },
          {
            "path": "editor.id",
            "value": ""
          },
          {
            "path": "editor.form",
            "value": {
              "name": "",
              "provider": "anthropic",
              "model": "",
              "apiUrl": "",
              "apiKey": "",
              "secretKey": "",
              "temperature": 0.5,
              "maxTokens": 800,
              "isDefault": false
            }
          }
        ]
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:40",
        "event": "click",
        "modifiers": [
          "self"
        ],
        "writes": [
          {
            "path": "editor.open",
            "value": false
          }
        ]
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:44",
        "event": "click",
        "modifiers": [],
        "writes": [
          {
            "path": "editor.open",
            "value": false
          }
        ]
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:51",
        "event": "change",
        "modifiers": [],
        "writes": [
          {
            "path": "editor.form.secretKey",
            "value": ""
          }
        ]
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:77",
        "event": "click",
        "modifiers": [],
        "writes": [
          {
            "path": "editor.open",
            "value": false
          }
        ]
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:78",
        "event": "click",
        "modifiers": [],
        "writes": [
          {
            "path": "editor.error",
            "value": "请填写名称"
          },
          {
            "path": "editor.error",
            "value": "请选 Provider"
          },
          {
            "path": "editor.error",
            "value": "custom 模式必须填 API URL"
          },
          {
            "path": "editor.error",
            "value": ""
          },
          {
            "path": "editor.saving",
            "value": true
          },
          {
            "path": "editor.saving",
            "value": false
          },
          {
            "path": "editor.open",
            "value": false
          },
          {
            "path": "loading",
            "value": true
          },
          {
            "path": "loading",
            "value": false
          }
        ]
      }
    ],
    "models": [
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:48",
        "path": "editor.form.name",
        "event": "input",
        "numeric": false,
        "checkbox": false
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:51",
        "path": "editor.form.provider",
        "event": "change",
        "numeric": false,
        "checkbox": false
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:55",
        "path": "editor.form.model",
        "event": "input",
        "numeric": false,
        "checkbox": false
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:58",
        "path": "editor.form.apiUrl",
        "event": "input",
        "numeric": false,
        "checkbox": false
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:61",
        "path": "editor.form.secretKey",
        "event": "input",
        "numeric": false,
        "checkbox": false
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:64",
        "path": "editor.form.apiKey",
        "event": "input",
        "numeric": false,
        "checkbox": false
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:9:template:74",
        "path": "editor.form.isDefault",
        "event": "change",
        "numeric": false,
        "checkbox": true
      }
    ]
  },
  "visual:sfc:11": {
    "initialState": {
      "submitting": false,
      "showAdvanced": false,
      "formData": {
        "themeName": "",
        "objective": "",
        "referenceEntries": "",
        "categoryHint": "",
        "useLLMBackend": "http"
      }
    },
    "displayFunctions": [],
    "conditions": [],
    "interactions": [
      {
        "sourceNodeId": "auto-v2-visual:sfc:11:template:14",
        "event": "submit",
        "modifiers": [
          "prevent"
        ],
        "writes": [
          {
            "path": "submitting",
            "value": true
          },
          {
            "path": "payload.useLLMBackend",
            "value": "http"
          },
          {
            "path": "submitting",
            "value": false
          }
        ]
      }
    ],
    "models": [
      {
        "sourceNodeId": "auto-v2-visual:sfc:11:template:18",
        "path": "formData.themeName",
        "event": "input",
        "numeric": false,
        "checkbox": false
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:11:template:22",
        "path": "formData.objective",
        "event": "input",
        "numeric": false,
        "checkbox": false
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:11:template:25",
        "path": "formData.referenceEntries",
        "event": "input",
        "numeric": false,
        "checkbox": false
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:11:template:28",
        "path": "formData.categoryHint",
        "event": "input",
        "numeric": false,
        "checkbox": false
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:11:template:37",
        "path": "formData.useLLMBackend",
        "event": "change",
        "numeric": false,
        "checkbox": false
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:11:template:44",
        "path": "formData.llmProvider",
        "event": "change",
        "numeric": false,
        "checkbox": false
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:11:template:48",
        "path": "formData.llmModel",
        "event": "input",
        "numeric": false,
        "checkbox": false
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:11:template:51",
        "path": "formData.llmApiKey",
        "event": "input",
        "numeric": false,
        "checkbox": false
      },
      {
        "sourceNodeId": "auto-v2-visual:sfc:11:template:54",
        "path": "formData.llmApiUrl",
        "event": "input",
        "numeric": false,
        "checkbox": false
      }
    ]
  }
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
const OWNER_STATE={};
const clone=(value)=>JSON.parse(JSON.stringify(value));
const stateFor=(owner)=>{if(OWNER_STATE[owner])return OWNER_STATE[owner];const state=clone(OWNER_RUNTIME[owner]?.initialState||{});state.__autoV2DisplayFunctions=clone(OWNER_RUNTIME[owner]?.displayFunctions||[]);return OWNER_STATE[owner]=state};
const getPath=(scope,path)=>{let value=scope;for(const part of path.split('.')){if(value==null||typeof value!=='object'||!(part in value))return [false,null];value=value[part]}return [true,value]};
const setPath=(scope,path,value)=>{const parts=path.split('.').filter(Boolean);let target=scope;for(const part of parts.slice(0,-1)){if(!target[part]||typeof target[part]!=='object'||Array.isArray(target[part]))target[part]={};target=target[part]}target[parts[parts.length-1]]=clone(value)};
const evalExpr=(expr,scope)=>{if(!expr)return [false,null];if(expr.kind==='literal')return [true,expr.value];if(expr.kind==='path')return getPath(scope,expr.path);if(expr.kind==='unsupported')return [false,null];if(expr.kind==='unary'){const a=evalExpr(expr.argument,scope);if(!a[0])return a;if(expr.operator==='!')return [true,!a[1]];return typeof a[1]==='number'?[true,expr.operator==='-'?-a[1]:a[1]]:[false,null]}if(expr.kind==='logical'){const a=evalExpr(expr.left,scope);if(!a[0])return a;if(expr.operator==='&&')return a[1]?evalExpr(expr.right,scope):a;if(expr.operator==='||')return a[1]?a:evalExpr(expr.right,scope);return a[1]!=null?a:evalExpr(expr.right,scope)}if(expr.kind==='binary'){const a=evalExpr(expr.left,scope),b=evalExpr(expr.right,scope);if(!a[0]||!b[0])return [false,null];return [true,expr.operator==='==='?a[1]===b[1]:expr.operator==='!=='?a[1]!==b[1]:expr.operator==='=='?a[1]==b[1]:expr.operator==='!='?a[1]!=b[1]:expr.operator==='>'?a[1]>b[1]:expr.operator==='>='?a[1]>=b[1]:expr.operator==='<'?a[1]<b[1]:a[1]<=b[1]]}if(expr.kind==='call'){const fn=(scope.__autoV2DisplayFunctions||[]).find((item)=>item.functionName===expr.functionName);if(!fn||fn.operation!=='date-locale-string'||expr.arguments.length!==1)return [false,null];const a=evalExpr(expr.arguments[0],scope);if(!a[0])return a;if(!a[1]&&Object.prototype.hasOwnProperty.call(fn,'fallback'))return [true,fn.fallback];const date=new Date(String(a[1]));return Number.isNaN(date.getTime())?[false,null]:[true,date.toLocaleString(fn.locale||undefined)]}if(expr.kind==='conditional'){const test=evalExpr(expr.test,scope);return test[0]?evalExpr(test[1]?expr.consequent:expr.alternate,scope):test}return [false,null]};
const applyConditions=(owner)=>{const root=document.querySelector('[data-visual-owner="'+owner+'"]');if(!root)return;const state=stateFor(owner);for(const binding of OWNER_RUNTIME[owner]?.conditions||[]){for(const node of root.querySelectorAll('[data-auto-v2-condition]')){if(node.getAttribute('data-auto-v2-condition')!==binding.key)continue;const result=evalExpr(binding.expression,state);node.hidden=result[0]?!result[1]:true}}};
const bindOwner=(owner)=>{const root=document.querySelector('[data-visual-owner="'+owner+'"]');if(!root)return;const runtime=OWNER_RUNTIME[owner]||{},state=stateFor(owner);for(const binding of runtime.interactions||[]){for(const node of root.querySelectorAll('[data-primitive-node="'+binding.sourceNodeId+'"]'))node.addEventListener(binding.event,(event)=>{if(binding.modifiers.includes('self')&&event.target!==node)return;for(const write of binding.writes)setPath(state,write.path,write.value);applyConditions(owner)})}for(const binding of runtime.models||[]){for(const node of root.querySelectorAll('[data-primitive-node="'+binding.sourceNodeId+'"]'))node.addEventListener(binding.event,()=>{let value=binding.checkbox?node.checked:node.value;if(binding.numeric&&value!=='')value=Number(value);setPath(state,binding.path,value);applyConditions(owner)})}applyConditions(owner)};
const normalize=(value)=>{const hash=value.includes('#')?value.slice(value.indexOf('#')+1):value;const path=(hash.split('?')[0]||'/');return path.startsWith('/')?path:'/'+path};
const matches=(path,pattern)=>{const a=normalize(path).split('/').filter(Boolean),b=normalize(pattern).split('/').filter(Boolean);return a.length===b.length&&b.every((part,index)=>part.startsWith(':')||part==='*'||part===a[index])};
const routeFor=(path)=>ROUTES.find((route)=>matches(path,route.path))||ROUTES[0];
const render=()=>{const path=normalize(location.pathname+location.search),route=routeFor(path);const owners=(route.ownerIds||[]).map((id)=>OWNER_MARKUP['visual:'+id]||OWNER_MARKUP[id]||'').join('');const marker=owners?'':'<span class="auto-v2-route-marker" aria-hidden="true"></span>';app.innerHTML='<nav class="auto-v2-nav">'+ROUTES.map((item)=>'<a href="'+item.path+'" data-auto-v2-route="'+item.path+'">'+(item.name||item.path)+'</a>').join('')+'</nav><main data-auto-v2-route="'+route.path+'" data-auto-v2-component="'+(route.componentFile||'')+'"><h1>'+((route.name||route.path))+'</h1>'+marker+owners+'</main>';document.title=route.name||route.path;document.querySelectorAll('[data-auto-v2-route]').forEach((node)=>node.addEventListener('click',(event)=>{if(node.tagName==='A'){event.preventDefault();history.pushState({autoV2:true,route:node.getAttribute('href')},'',node.getAttribute('href'));render()}}));for(const id of route.ownerIds||[])bindOwner(id)};
history.replaceState({autoV2:true,route:"/"},'',location.href);addEventListener('popstate',render);render();
void BOUNDARIES;
