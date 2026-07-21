# 明星组合 · 动态百科成员探索卡 - 组件库

> 从 `BLACKPINK v10` 案例页提炼的可复用组件库。一套数据驱动的"明星组合"垂类卡片，覆盖 PC / WISE / 极端小屏三档响应式，内置成员网格自动播放、时间线原地展开故事、3D 中心聚焦作品轮播、创作故事面板、资料 Modal 等完整交互。

- 零依赖，原生 JS + CSS（纯 ES5+，无构建步骤）
- 数据驱动：替换 `options` 即可生产新卡片
- 主题可定制：覆盖 `--sg-*` 变量即可换肤
- 完整 A11y：tablist / tabpanel / dialog / aria-live / aria-label / ESC 关闭
- 三档响应式：PC 788×492 / WISE 380×456 / 极端 280×340

---

## 目录结构

```
star-group-lib/
├── README.md                 ← 本文件
├── docs/
│   └── 设计规范.md           ← 主题色 / Tab / 交互 / 逻辑的完整规范
├── src/
│   ├── star-group.css        ← 参数化样式（sg-* 前缀，支持主题变量）
│   └── star-group.js         ← 渲染引擎（StarGroup.mount / create）
└── examples/
    ├── blackpink.html        ← 用组件库 + 原数据复刻原 BLACKPINK v10 案例
    └── template.html         ← 空白复用模板（带示例数据与注释）
```

---

## 快速开始

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <link rel="stylesheet" href="src/star-group.css">
  <style>
    html, body { width:100%; height:100%; margin:0; overflow:hidden;
      overscroll-behavior:none; touch-action:manipulation; }
    body { display:grid; place-items:center; background:#F8F8F8;
      font-family: Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; }
  </style>
</head>
<body>
  <div id="mount"></div>
  <script src="src/star-group.js"></script>
  <script>
    StarGroup.mount(document.getElementById('mount'), {
      /* options，见下文数据契约 */
    });
  </script>
</body>
</html>
```

> **重要**：容器 id 必须为 `mount`（roundtrip 渲染器序列化 `#mount` 子树）。CSS/JS 路径按实际部署调整。

---

## API

| 方法 | 说明 |
|---|---|
| `StarGroup.mount(container, options)` | 挂载到容器，返回实例 |
| `StarGroup.create(options)` | 仅创建 DOM 节点，自行 append |
| `new StarGroup(options)` | 获得实例，可 `.mount()` / `.create()` |

`options` 与 `DEFAULTS` 深合并：数组整体替换（不做元素级合并），对象逐级合并。

---

## 数据契约（options）

```ts
{
  title: string,                 // 卡片标题（用于 tablist aria-label）
  ariaLabel: string,             // 画布 role=region 的 aria-label
  theme?: {                      // 可选，覆盖 --sg-* 变量（key 可省略前缀）
    primary?: string, accent?: string, ink?: string, muted?: string,
    subtle?: string, line?: string, paper?: string, stage?: string,
    soft?: string, 'soft-accent'?: string, 'accent-2'?: string
  },

  tabs: [                         // Tab 栏配置（前 3 切换面板，末位 more 打开 Modal）
    { id: 'members',  label: '成员详情', count: 4 },
    { id: 'timeline', label: '经历',     count: 6 },
    { id: 'works',    label: '团体作品', count: 6 },
    { id: 'more',     label: '其它',     more: true }
  ],

  members: [                      // 成员数据（每页 4 人自动分页）
    {
      key: string,               // 唯一标识
      name: string,              // 展示名（如 "Jisoo · 金智秀"）
      role: string,              // 队内定位（含「队内定位：」前缀，详情面板用全称，卡片用去前缀值）
      shortName: string,         // 图片加载失败时的兜底文字
      state: string,             // 状态徽标（如 "在团"）
      img: string,               // 头像 URL
      photoSource: string,       // 图片来源标注（小屏隐藏）
      relations: [string, string][]  // 详情面板 [label, value] 行
    }
  ],

  timeline: [                     // 经历时间线（PC 每页 3 条 / 小屏 2 条）
    {
      time: string,              // 节点时间（如 "2016.08"）
      title: string,             // 标题
      alt: string,               // 配图 alt 文本
      img: string,               // 节点配图
      desc: string,              // 简短描述（卡片折叠态可见）
      story: string              // 经历背景长文（点击卡片原地展开后显示）
    }
  ],

  works: [                        // 团体作品（3D 中心聚焦轮播，建议 ≥ 3 个）
    {
      img: string, alt: string,  // 封面 + alt
      year: string,              // 年份+类型（如 "2016 · 单曲"）
      title: string,             // 标题
      desc: string,              // 简短描述
      story: string              // 创作背景长文（点击中心卡弹出故事面板）
    }
  ],

  // "其它"Tab 触发的资料 Modal
  moreTitle: string,              // 弹窗标题
  moreSub: string,                // 副标题（资料声明）
  moreDecl: string,               // 底栏声明
  moreFacts: [                    // 事实网格（2 列，full=true 跨两列）
    { label: string, value: string, full?: boolean }
  ],

  // 视图标题文案
  detailKicker: string,           // 详情面板 kicker（如 "成员 ↔ 团体 关系"）
  sourceNote: string,             // 详情面板底部资料说明
  timelineHeadTitle: string,      // 时间线视图标题
  timelineHeadSub: string,       // 时间线视图副标（页码后缀）
  worksHeadTitle: string,         // 作品视图标题
  worksHeadSub: string,           // 作品视图副标
  worksStoryCta: string,          // 故事面板触发按钮文案
  worksStoryLabel: string,        // 故事面板标签
  timelineStoryLabel: string,    // 时间线故事标签
  timelineHint: string,           // 时间线「了解背景」提示
  timelineCollapse: string,       // 时间线「收起」按钮
  memberModalTitle: string,       // 成员 Modal 标题（小屏）
  memberModalDecl: string,        // 成员 Modal 底栏

  // 自动播放
  autoPlayMember: number,        // 成员轮播间隔（ms，默认 3000）
  autoPlayWorks: number          // 作品轮播间隔（ms，默认 3500）
}
```

---

## 主题定制

所有颜色通过 `--sg-*` CSS 变量定义在 `:root, .sg-frame`，覆盖即可换肤：

```css
.sg-frame {
  --sg-primary: #6487FA;   /* 品牌主色：选中/激活/箭头/kicker */
  --sg-accent: #E94F76;    /* 强调色：更多 tab/年份/故事标签 */
  --sg-ink: #1E1F24;       /* 主文字 */
  --sg-soft: #F2F4FB;      /* 主色浅底：选中卡片背景 */
}
```

或在 options 中传 `theme` 对象（运行时覆盖，key 可省略 `--sg-` 前缀）：

```js
StarGroup.mount(el, {
  theme: { primary: '#FF6B35', accent: '#004E89', soft: '#FFF4EF' }
});
```

完整令牌列表见 `docs/设计规范.md` §1。

---

## 响应式断点

| 档位 | 断点 | 画布尺寸 | 关键调整 |
|---|---|---|---|
| PC | 默认 | 788×492 | 2×2 成员网格 + 右侧详情面板；时间线每页 3 条；3D 5 档位作品轮播 |
| WISE | `max-width: 500px` | 380×456 | 成员视图单列；detail-panel 隐藏，点击成员弹 Modal；时间线每页 2 条；底部箭头控制栏 |
| 极端 | `max-width: 320px` 或 `max-height: 380px` | 280×340 | tab 字号缩小；`<small>` 计数隐藏；更紧凑间距 |

---

## 交互模式概览

| 视图 | 交互 | 触发 |
|---|---|---|
| 成员 | 选中成员 -> 更新右侧关系详情 | 点击成员卡 |
| 成员 | 自动播放循环切换 | 进入即启动，任意 click/touchstart 停止 |
| 成员 | 翻页 | 左右箭头 / 底部圆点 |
| 成员 | 小屏弹 Modal | `innerWidth ≤ 500` 或 `innerHeight ≤ 380` 时点击成员 |
| 时间线 | 横向滚动 + snap | 拖拽 / 箭头 / 圆点 |
| 时间线 | 原地展开经历背景故事 | 点击卡片（所有屏幕尺寸） |
| 时间线 | 收起展开 | 收起按钮 / ESC / 点击其他卡片 |
| 作品 | 3D 中心聚焦轮播 | 左右箭头 / 点击侧边卡 / 圆点 |
| 作品 | 自动播放 | 进入作品 Tab 启动，离开/悬停/打开故事面板停止 |
| 作品 | 弹出创作背景故事 | 点击中心卡 / "展开创作故事"按钮 |
| 作品 | 关闭故事面板 | 关闭按钮 / ESC / 点击面板背景 |
| 其它 | 打开资料 Modal | 点击"其它"Tab |
| 其它 | 关闭 Modal | X 按钮 / ESC / 点击遮罩 |

---

## A11y

- `role="tablist"` / `role="tab"` / `role="tabpanel"` 完整 ARIA 属性
- `aria-selected` / `aria-controls` / `aria-labelledby` 双向绑定
- "其它"Tab 额外维护 `aria-expanded`（Modal 开关同步）
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
- `aria-live="polite"` 关系详情面板（选中成员时自动播报）
- `aria-label` 在所有图标按钮（箭头/关闭）
- `aria-pressed` 在成员卡片（选中态）
- ESC 键关闭所有 Modal / 故事面板 / 展开时间线

---

## 零依赖

- 纯原生 JS（ES5+ 语法，兼容 IE11+ 现代浏览器）
- 纯原生 CSS（Custom Properties + Grid + Flexbox + scroll-snap）
- 无构建步骤：直接 `<link>` + `<script>` 引入即可
- 无第三方库：不依赖 jQuery / React / Vue 等

---

## 数据来源声明

本组件库从 `BLACKPINK v10` 案例页提炼，案例数据（成员/时间线/作品/事实）均为可核实的公开事实。图片 URL 来自百度百科、百度图片、新浪图片等公开来源，仅用于案例复刻演示。生产环境使用时请替换为自有数据。
