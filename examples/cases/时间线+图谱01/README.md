# shexiang-furen · 五大事件与人物关系组件库

> 源自「奢香夫人 · 五大事件与人物关系」HTML 案例的标准化、数据驱动、零依赖前端组件库。
> 适用于 **人物生平事件图谱**：事件简介 + 关系图谱（可拖拽）+ 事件切换条 + 人物详情弹窗。

## 目录结构

```
组件库/
├── src/
│   ├── shexiang-furen.css    # 样式（含 :root 主题令牌）
│   └── shexiang-furen.js     # 渲染引擎（IIFE，零依赖）
├── examples/
│   ├── shexiang-furen.html   # 真实数据示例（五大事件）
│   └── template.html         # 占位数据模板
├── docs/
│   └── 设计规范.md            # 设计规范
└── README.md
```

## 快速开始

```html
<link rel="stylesheet" href="src/shexiang-furen.css">
<div id="mount" style="width:788px;height:492px"></div>
<script src="src/shexiang-furen.js"></script>
<script>
ShexiangFuren.mount(document.getElementById('mount'), {
  legend: [
    { type: 'family', label: '亲族' },
    { type: 'ruler', label: '君臣' },
    { type: 'ally', label: '盟友' },
    { type: 'enemy', label: '对立' }
  ],
  events: [ /* ... */ ]
});
</script>
```

## API

| 方法 | 说明 |
| --- | --- |
| `ShexiangFuren.mount(container, options)` | 挂载到 `container`，返回根节点 `.sg-frame` |
| `ShexiangFuren.create(options)` | 仅创建根节点（不插入 DOM） |

## 数据契约（Options）

```ts
interface Options {
  legend: { type: 'family'|'ruler'|'ally'|'enemy'; label: string }[];
  hint?: string;            // 图谱操作提示文案
  initial?: number;         // 初始事件索引（默认 0）
  events: Event[];
  theme?: Record<string, string>;
}

interface Event {
  name: string;             // 事件名
  year: string;             // 年份
  period: string;           // 时期/封号
  image: string;            // 事件配图 URL
  summary?: string;         // 详细概要
  summaryShort?: string;    // 简介短摘要
  people: Person[];
  links?: Link[];
}

interface Person {
  name: string;
  px: number;               // 画布 x（百分比 0-100）
  py: number;               // 画布 y（百分比 0-100）
  role?: string;            // 身份/角色
  avatar: string;           // 头像 URL
  big?: boolean;            // 是否主角（大头像）
  rel?: 'family'|'ruler'|'ally'|'enemy';
  deed?: string;            // 在本事件中的作为
  impact?: string;          // 影响
}

interface Link {
  a: string;                // 人物 A（name）
  b: string;                // 人物 B（name）
  type: 'family'|'ruler'|'ally'|'enemy';
  label?: string;           // 连线标签
}
```

## 关系类型

| 类型 | 语义 | 主题令牌 |
| --- | --- | --- |
| family | 亲族（实线红） | `--sg-rel-family` `#D94B4B` |
| ruler | 君臣（虚线金） | `--sg-rel-ruler` `#C8A35A` |
| ally | 盟友（长虚绿） | `--sg-rel-ally` `#3FAE74` |
| enemy | 对立（点划灰） | `--sg-rel-enemy` `#55585F` |

## 主题定制

在 `.sg-frame` 上覆盖 `--sg-*` 变量即可：

```css
.my-brand .sg-frame { --sg-primary: #4e6ef2; --sg-rel-family: #e74c3c; }
```

或在 `options.theme` 中传入：`{ '--sg-primary': '#4e6ef2' }`。

## 交互行为

| 元素 | 行为 |
| --- | --- |
| 事件按钮 `.sg-event-btn` | 切换事件，重排图谱与简介（tablist） |
| 左右箭头 `.sg-bar-arrow` | 上一个 / 下一个事件 |
| 节点头像 `.sg-node` | 点击弹出人物详情；可拖动改位 |
| 关系连线 | 与选中节点相关时高亮，其余淡化 |
| 弹窗 `.sg-modal` | ESC 关闭 / 点击遮罩关闭 |

## 响应式断点

| 断点 | 行为 |
| --- | --- |
| PC（>769px） | 事件按钮均匀布满底部 |
| ≤480px（或 ≤480px 高） | 头像缩小、隐藏角色 chip、滑动提示、弹窗收窄 |
| ≤320px（或 ≤365px 高） | 进一步收紧，隐藏年份 |

## 无障碍

- 事件切换条为 `role=tablist`，按钮 `role=tab`，`aria-selected`
- 节点 `role=button`，`tabindex=0`，`aria-label` 含姓名/角色/关系
- 弹窗 `role=dialog` / `aria-modal`，ESC 关闭，焦点回退
- 全局 `aria-live` 公告事件切换与详情查看
- 键盘支持：左右方向键切换事件，Enter/Space 查看人物

## 版本

v1.0.0
