# 人物关系图谱 · 剧情因果 · 作品推荐 - 组件库

> 从《庆余年》人物图谱与剧情脉络案例页提炼的可复用组件库。一套数据驱动的"人物关系图谱"垂类卡片，覆盖 PC / WISE / 极端小屏三档响应式，内置放射式关系图谱（可拖动 + 连线 + 角色详情面板）、横向因果思维导图（滑杆 + 折叠）、剧情节点弹窗、作品推荐（多 tab + 翻页）等完整交互。

- 零依赖，原生 JS + CSS（纯 ES5+，无构建步骤）
- 数据驱动：替换 `options` 即可生产新卡片
- 主题可定制：覆盖 `--sg-*` 变量即可换肤
- 完整 A11y：tablist / tabpanel / dialog / slider / aria-live / aria-label / ESC 关闭
- 三档响应式：PC 788×492 / WISE 380×456 / 极端 280×340

---

## 目录结构

```
char-story-graph-lib/
├── README.md                      ← 本文件
├── docs/
│   └── 设计规范.md                ← 主题色 / Tab / 交互 / 逻辑的完整规范
├── src/
│   ├── char-story-graph.css       ← 参数化样式（sg-* 前缀，支持主题变量）
│   └── char-story-graph.js        ← 渲染引擎（CharStoryGraph.mount / create）
└── examples/
    ├── qingyu.html                ← 用组件库 + 原数据复刻原《庆余年》案例
    └── template.html              ← 空白复用模板（带示例数据与注释）
```

---

## 快速开始

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
  <title>人物关系图谱</title>
  <link rel="stylesheet" href="src/char-story-graph.css">
  <style>
    html, body { width:100%; height:100%; margin:0; overflow:hidden;
      overscroll-behavior:none; touch-action:manipulation; background:#eef1f8; }
  </style>
</head>
<body>
  <div id="mount"></div>
  <script src="src/char-story-graph.js"></script>
  <script>
    CharStoryGraph.mount(document.getElementById('mount'), {
      /* options，见下文数据契约 */
    });
  </script>
</body>
</html>
```

---

## API

| 方法 | 说明 |
|---|---|
| `CharStoryGraph.mount(container, options)` | 挂载到容器，返回实例 |
| `CharStoryGraph.create(options)` | 仅创建 DOM 节点，自行 append |
| `new CharStoryGraph(options)` | 获得实例，可 `.mount()` / `.create()` |

---

## 数据契约（options）

```ts
{
  title: string,                 // 卡片标题（用于 tablist aria-label）
  ariaLabel: string,             // 画布 role=region 的 aria-label
  imgBase: string,               // 图片目录前缀，如 './images/'

  // 主 3 视图 tab
  tabs: [
    { id: 'graph', label: '关系图谱' },
    { id: 'mind',  label: '剧情因果' },
    { id: 'works', label: '作品推荐' }
  ],

  // 关系类型语义（type -> 标签文字）
  relTypes: {
    family: '血缘', romance: '情感', master: '师徒',
    friend: '盟友', enemy: '对立'
  },

  // 角色数据：key 唯一，big 标记主角节点放大
  chars: {
    [key]: {
      name: string,             // 角色名
      actor: string,             // "演员 饰"
      img: string,              // 图片文件名（拼 imgBase）
      big?: boolean,            // 主角节点放大
      desc: string              // 人物简介
    }
  },
  hero: string,                   // 主角 key（用于关系标签 + 首次脉冲提示）

  // 关系连线
  edges: [
    { a: string, b: string, type: 'family'|'romance'|'master'|'friend'|'enemy', label: string }
  ],

  // 主角与各角色直接关系（详情面板标签）
  heroRel: {
    [key]: { type: string, text: string }
  },

  // 关系图谱归一化布局（0~1 坐标），缺失则自动环形排布
  layoutRel?: {
    [key]: [nx: number, ny: number]   // 0~1
  },

  // 剧情因果：思维导图根节点 + 剧情节点
  mindRoot: { ep: string, title: string, desc: string },
  plots: [
    {
      ep: string,                // 集数，如 "01"
      title: string,             // 剧情标题
      cover: string,             // 封面图文件名
      type?: string,             // 类型徽章，如 "开端/杀机/揭示"
      desc: string,              // 剧情解析
      roles: string[],           // 关键人物 key 列表
      causeNext?: string         // 因果链下一段（显示在卡片底部，末位为空）
    }
  ],

  // 作品推荐：自定义分类 tab + 各分类作品列表
  worksTabs: [
    { id: 'series', label: '同系列' },
    { id: 'theme',  label: '同题材' },
    { id: 'cast',   label: '同主演' },
    { id: 'ip',     label: '同作者' }
  ],
  works: {
    [catId: string]: [
      {
        n: string,              // 作品名
        m: string,              // 主演（"A / B / C"，自动取前 2 位）
        r: string,              // 推荐理由
        cover: string,          // 封面图文件名
        ep?: string,            // 集数徽章，如 "46集"
        up?: boolean            // 待播作品（tag 变金色）
      }
    ]
  },
  worksPerPage: number,          // 默认 4

  // 画布缩放基准（等比锁定宽高比）
  baseDesktop: { w: 788, h: 492 },
  baseMobile:  { w: 380, h: 456 },

  // 文案
  charPanelRelTitle: '与主角的关系',
  charPanelDescTitle: '人物简介',
  charPanelSelfTag: '本人 · 主角',
  mindHint: '拖动节点、点击剧情查看详情',
  worksPrevLabel: '← 上一页',
  worksNextLabel: '下一页 ->',

  // 图谱物理：浮动动画 + 连线跟随
  enablePhysics: boolean,        // 默认 true
  tapHintDuration: number,       // 默认 5600（主角脉冲提示时长）

  // 主题定制
  theme?: {                      // 覆盖 --sg-* 变量
    primary?: string, 'primary-dark'?: string, 'primary-light'?: string,
    ink?: string, muted?: string, subtle?: string,
    paper?: string, stage?: string, soft?: string, line?: string,
    'rel-family'?: string, 'rel-romance'?: string, 'rel-master'?: string,
    'rel-friend'?: string, 'rel-enemy'?: string
  }
}
```

---

## 主题定制

在 `options.theme` 中传入键值对，key 可省略 `--sg-` 前缀：

```js
CharStoryGraph.mount(el, {
  theme: {
    primary: '#6487fa',   // 等价于 --sg-primary
    'rel-family': '#d94b4b',
    ink: '#1e1f24'
  },
  // ...其他数据
});
```

或在 CSS 中直接覆盖：

```css
.sg-frame {
  --sg-primary: #6487fa;
  --sg-rel-family: #d94b4b;
}
```

完整变量清单见 `docs/设计规范.md` 第一节。

---

## 组件清单

| 组件 | 类名前缀 | 说明 |
|---|---|---|
| 画布外壳 | `.sg-frame` | 等比缩放 + role=region |
| 视图栈 | `.sg-view[role=tabpanel]` | 绝对堆叠 + opacity 切换 |
| 主 Tab Bar | `.sg-tab-bar[role=tablist]` / `.sg-tab` | N 等分 + roving tabindex |
| 图谱容器 | `.sg-graph-wrap` | panel-open 时画布让位 |
| 图例 | `.sg-graph-legend` | 5 关系类型色板 |
| 连线 | `svg.sg-edges` / `line.sg-edge.<type>` | 端点收缩 + hl/dim 状态 |
| 角色节点 | `.sg-node` / `.sg-avatar` / `.sg-name` | button + 浮动动画 + big |
| 角色面板 | `.sg-char-panel[role=dialog]` | PC 侧栏 / 移动弹窗 |
| 关系标签 | `.sg-rel-tag.<type>` | 6 色（含 self） |
| 思维导图 | `.sg-mind-wrap` / `.sg-mind-node` / `.sg-mind-card` | 根节点渐变 + 折叠 |
| 滑杆 | `.sg-msl-track[role=slider]` / `.sg-msl-thumb` / `.sg-msl-dot` | 拖动 + 点位 + 键盘 |
| 剧情弹窗 | `.sg-plot-modal[role=dialog]` | 封面 + 解析 + 人物 |
| 作品网格 | `.sg-works-grid[role=tabpanel]` / `.sg-work-card` | 4 列 / 移动 2 列 |
| 作品子 Tab | `.sg-works-tabs[role=tablist]` / `.sg-works-tab` | 4 分类 |
| 作品翻页 | `.sg-works-btn` / `.sg-works-pageinfo` | 禁用态 + 单页隐藏 |

---

## 交互行为一览

| 模块 | 触发 | 行为 |
|---|---|---|
| 主 Tab 切换 | 点击 / 键盘 ←/-> | 切换面板 + graph 启停物理 + mind 重渲染 |
| 角色节点 | 点击 | 打开角色面板（PC 侧栏 / 移动弹窗）+ 高亮关联连线 |
| 角色节点 | 拖拽 | 自由移动 + 连线跟随，松开屏蔽误 click |
| 角色节点 | hover/focus | 头像放大 + 主色光晕 |
| 角色面板 | × / ESC / 切换 tab | 关闭，画布复位 |
| 思维卡片 | 点击 / Enter | 打开剧情弹窗 |
| 思维折叠 | +/− 按钮 | 展开/收起后续节点 |
| 滑杆 | 拖动 / 点击轨道 / 点击点位 | 滚动到对应节点 |
| 滑杆 | 滚轮 / 键盘 ←/-> | 横向滚动 |
| 思维画布 | 触摸滑动（移动端） | 左右滚动，滑动后 80ms 屏蔽卡片 click |
| 剧情弹窗 | × / 遮罩 / ESC | 关闭 |
| 作品子 Tab | 点击 / 键盘 ←/-> | 切换分类 + 重置到首页 |
| 作品翻页 | 上一页 / 下一页 | 翻页，边界禁用，单页隐藏 pager |

---

## 响应式断点

| 断点 | 画布基准 | 关键差异 |
|---|---|---|
| PC（默认） | 788×492 | 完整布局、角色面板右侧 300px 侧栏、作品 4 列单行 |
| `≤500px`（WISE） | 380×456 | 角色面板转居中弹窗、卡片窄、tab 紧凑、作品 2 列滚动 |
| `≤320px`（极端） | 380×456 | 字号极致压缩、图例 9px、思维卡片 132px |

画布采用**等比缩放**：JS 按窗口尺寸选基准，`transform: scale()` 等比填充视口，内容始终在基准坐标系内渲染，保证跨屏布局一致。

---

## 版本

- v1.0.0 - 从《庆余年》人物图谱与剧情脉络案例提炼
