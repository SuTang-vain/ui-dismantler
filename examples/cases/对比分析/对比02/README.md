# 鳡·特征互动观察 组件库

将「鳡特征互动观察」HTML 案例页拆解为可复用、数据驱动的独立组件库。范式：**双视图画框（特征图鉴 + 体型对比）+ 底部物种切换栏 + 详情/对比 Modal**。对比图采用"固定宽度 + scaleX 体长比例缩放"布局，适用于"一主角 + 多对比物种"的淡水生物对比观察场景。

## 目录结构

```
组件库/
├── README.md                   本文件
├── docs/设计规范.md             主题色/结构/交互/响应式/组件清单
├── src/
│   ├── gan.css                参数化样式（sg- 前缀，--sg-* 变量，三档响应式）
│   └── gan.js                 渲染引擎（Gan.mount/create，数据驱动，A11y）
└── examples/
    ├── gan.html                用库 + 原数据复刻原案例
    └── template.html           空白复用模板（含示例数据契约）
```

## 快速开始

```html
<link rel="stylesheet" href="src/gan.css">
<div id="mount"></div>
<script src="src/gan.js"></script>
<script>
  Gan.mount(document.getElementById('mount'), {
    title: '...',
    subject: { key, name, imageFront, imageSide, stats, imageMeta },
    competitors: [{ key, name, image, stats, chartScores, imageMeta }],
    subjectChartScores: [100,75,80,88,100],
    dimensions: ['常见体长','常见体重','寿命','适温','繁殖量'],
    compareWidthPct: 60.6,
    defaultCompetitorIdx: 0,
    hotspots: [{ id, pose, left, top, title, subtitle, text, zoomImage, zoomLeft, zoomTop, zoomSize }],
    disclaimer: '...',
    chartLegend: { base, target }
  });
</script>
```

## API

| 方法 | 签名 | 说明 |
|---|---|---|
| `Gan.mount(container, options)` | `(HTMLElement, object) → HTMLElement` | 创建并挂载到容器 |
| `Gan.create(options)` | `(object) → HTMLElement` | 仅创建返回 DOM（自行挂载） |

## 数据契约

```ts
interface Options {
  title: string;
  subject: Subject;
  competitors: Competitor[];
  subjectChartScores: number[];
  dimensions: string[];                    // 对比维度（建议 5 项）
  compareWidthPct: number;                 // 对比图固定宽度 %（默认 60.6）
  defaultCompetitorIdx: number;            // 初始对比物种下标
  hotspots: Hotspot[];
  disclaimer: string;
  chartLegend: { base: string; target: string };
  theme?: Record<string, string>;
}

interface Subject {
  key: string;
  name: string;
  imageFront: string;
  imageSide: string;
  stats: Record<string, string>;          // d1..d5 各维度真实值
  imageMeta: { contentW: number; contentH: number };  // 主图内容尺寸（scaleX 换算）
}

interface Competitor {
  key: string; name: string; image: string;
  stats: Record<string, string>;
  chartScores: number[];
  imageMeta: { contentW: number; contentH: number };
}

interface Hotspot {
  id: string;
  pose: 'front' | 'side';
  left: number; top: number;               // 热点百分比坐标
  title: string; subtitle: string; text: string;
  zoomImage: string;
  zoomLeft: number; zoomTop: number;        // 放大中心百分比
  zoomSize: string;                         // '300% auto' 放大倍率
}
```

## 主题定制

所有颜色走 CSS 变量，可在 `.sg-frame` 作用域或通过 `options.theme` 覆盖：

```js
Gan.mount(el, { /*...*/, theme: { '--sg-primary': '#E94F76' } });
```

核心令牌：`--sg-primary`(主色) / `--sg-primary-dark`(深端) / `--sg-primary-light`(浅端) / `--sg-ink`·`--sg-muted`·`--sg-subtle`(三级文字) / `--sg-paper`(卡片底) / `--sg-stage`(画布底) / `--sg-line`(分割线) / `--sg-soft`(主色浅底)。

## 交互行为

| 行为 | 触发 |
|---|---|
| 切换视图（特征/对比） | 点击底部物种切换栏主角/对比物种按钮 / 键盘 ← → |
| 切换视角（正面/侧面） | 点击 pose tab（tablist 语义） |
| 查看特征详情 | 点击热点 → Modal 局部放大 + 说明（按 zoomLeft/zoomTop 放大中心） |
| 查看参数对比 | 点击「详细对比」按钮（移动端可见）→ Modal 参数表 |
| 切换对比物种 | 点击底部对比物种按钮 → 重渲染雷达图/参数表/目标图/scaleX 缩放 |
| 展开/收起对比详情 | 移动端点击抽屉把手 |
| 关闭 Modal | × 按钮 / 点击遮罩 / ESC |

## 响应式断点

- PC（默认，≥600px 且 ≥420px 高）：788×492 固定画框，左右双面板（对比图 + 雷达图/参数表），对比图固定宽度 60.6% + scaleX 按体长比例缩放
- WISE（≤600px 或 ≤420px 高）：满屏画布，单列布局，对比详情改抽屉 + 详细对比按钮，对比图宽度按 110/140 比例缩放
- 极端（≤340px 或 ≤380px 高）：字号收紧，按钮/卡片进一步缩小，Modal 改紧凑布局

## 设计取舍

- **零依赖雷达图**：原案例用 Chart.js 画雷达图（违反零依赖约束），本库用纯 CSS 双层条形图替代。
- **scaleX 体长对比**：保留原案例的"固定宽度 + scaleX(bodyRatio × imageMeta) 换算"对比布局逻辑（`_layoutCompare`），让对比物种图按真实体长比例横向缩放，比 lenRatio/aspect 更贴合鱼类侧视图。
- **热点放大中心**：原案例 detailData 用 `zoomLeft/zoomTop`（与 hotspotConfig 同坐标系），本库统一走 `options.hotspots`，引擎按 zoomLeft/zoomTop 计算放大 transform。
- **初始对比物种**：原案例默认激活 'bighead'（首屏即显示对比），本库通过 `defaultCompetitorIdx` 控制，挂载即渲染对比视图数据（仍停留在特征视图，由用户切换）。
