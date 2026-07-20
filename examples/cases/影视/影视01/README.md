# 三大队 · 人物关系与剧情全解析 — 组件库

> 从《三大队》案例页（`index.html`）高保真复刻提炼的可复用组件库。一套数据驱动的"影视人物图谱 + 故事脉络 + 作品推荐"垂类卡片，覆盖 PC / WISE(≤768/480) / 极端(≤320) 多档响应式，内置**双基准等比缩放画布**、**故事切换条 + 放射式关系图谱**（每段故事自带角色子集/连线/角色定位，切换即重渲染图谱）、**作品推荐**（3 子类 Tab + 4 列网格 + 分页）。

- 零依赖，原生 JS + CSS
- 数据驱动：替换 `options` 即可生产新卡片
- 主题可定制：覆盖 `--sg-*` 变量即可换肤
- 完整 A11y：tablist / tabpanel / aria-live / 图标按钮 aria-label / ESC 关闭
- 完整复刻源页物理算法：环形顺序优化 / 120 次避让 / 标签 13 采样碰撞 / RAF 物理循环 / 面板自适应缩放

---

## 目录结构

```
组件库/
├── README.md                 ← 本文件
├── docs/
│   └── 设计规范.md           ← 主题色 / Tab / 视图 / 交互 / 逻辑 / 双基准缩放 / 图谱算法
├── src/
│   ├── sandadui.css          ← 参数化样式（sg-* 前缀，--sg-* 变量，多档断点 + 双基准缩放）
│   └── sandadui.js           ← 渲染引擎（Sandadui.mount / create，完整算法复刻）
└── examples/
    ├── sandadui.html         ← 用组件库复刻原《三大队》案例（12 角色 + 4 故事 + 11 作品）
    └── template.html         ← 空白复用模板（占位数据）
```

---

## 快速开始

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <link rel="stylesheet" href="src/sandadui.css">
  <style>
    html, body { width:100%; height:100%; margin:0; overflow:hidden;
      overscroll-behavior:none; touch-action:manipulation;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      background:#eef1f8; }
  </style>
</head>
<body>
  <div id="mount"></div>
  <script src="src/sandadui.js"></script>
  <script>
    Sandadui.mount(document.getElementById('mount'), options);
  </script>
</body>
</html>
```

---

## API

| 方法 | 说明 |
|---|---|
| `Sandadui.mount(container, options)` | 挂载到 container（默认 body），返回实例 |
| `Sandadui.create(options)` | 创建并返回 DOM 根（不挂载，自行 append） |
| `new Sandadui(options)` | 构造实例，可链式 `.mount(container)` |

---

## options 数据契约

| 字段 | 类型 | 说明 |
|---|---|---|
| `ariaLabel` | string | 整卡 `aria-label` |
| `heroKey` | string | 主角 key（图谱中心、首次脉冲引导） |
| `imgBase` | string | 图片 URL 前缀（与各 img 字段拼接） |
| `legend` | `[{type,label}]` | 图谱图例（5 类关系） |
| `chars` | `[{key,name,actor,img,big?,desc}]` | 角色全集 |
| `storyModules` | `[{key,name,desc,chars,edges,roles}]` | 故事模块（每段独立图谱） |
| `worksCats` | `[{id,label}]` | 作品子类 Tab |
| `works` | `{catId: [{n,m,r,cover,ep?,up?}]}` | 作品数据（按子类分组） |
| `theme` | `{primary?:..., ink?:...}` | 覆盖 `--sg-*` 变量（换肤） |

### storyModule 结构

| 字段 | 说明 |
|---|---|
| `key` | 故事唯一 key |
| `name` | 故事名（切换条按钮文案） |
| `desc` | 故事描述（切换条下方卡片） |
| `chars` | 本段出场的角色 key 数组 |
| `edges` | `[{a,b,type,label}]` 本段连线（type∈family/romance/master/friend/enemy） |
| `roles` | `{charKey: {rel:[...], desc}}` 本段角色定位（关系标签 + 段内描述） |

---

## 主题定制

所有颜色经 `--sg-*` 变量。在 `.sg-frame` 上覆盖即可换肤：

```css
#mount .sg-frame {
  --sg-primary: #ff6b6b;
  --sg-ink: #222;
  --sg-paper: #fffaf0;
}
```

或通过 `options.theme` 传入：

```js
Sandadui.mount(el, { ..., theme: { primary: '#ff6b6b', ink: '#222' } });
```

完整令牌见 `docs/设计规范.md`。

---

## 响应式

| 档位 | 断点 | 说明 |
|---|---|---|
| PC | 默认 | 双基准 788×492 缩放，4 列作品网格，右侧 320/380 详情面板 |
| WISE | `max-width: 768px` | 双基准 380×456 缩放，作品 2 列横滚，详情面板居中弹层 + fit 自适应 |
| 小屏 | `max-width: 480px` | 图例/头像/连线进一步收紧 |
| 极矮屏 | `max-width: 480px and max-height: 420px` | 头像最小化，面板紧凑 |
| 极端 | `max-width: 320px` | 字号/头像极限缩小（满足组件库规范极端档） |

---

## A11y

- `role="region"` + `aria-label` 包裹整卡
- 底部 Tab / 故事条 / 作品子 Tab 均为 `tablist` + `tab` + `aria-selected` + `aria-controls`
- 视图为 `tabpanel` + `aria-labelledby` + `hidden`
- 角色节点 `role="button"` + `tabindex="0"` + `aria-label`，支持回车/空格
- 角色面板 `aria-live="polite"`
- 图标按钮（关闭/分页/横滚提示）均有 `aria-label` 或可见文案
- ESC 关闭角色面板
