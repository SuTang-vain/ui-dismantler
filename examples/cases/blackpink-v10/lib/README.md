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
blackpink-v10-lib/
├── README.md                 ← 本文件
├── docs/
│   └── 设计规范.md           ← 主题色 / Tab / 交互 / 逻辑的完整规范
├── src/
│   ├── star-group.css        ← 参数化样式（sg-* 前缀，支持主题变量）
│   └── star-group.js         ← 渲染引擎（StarGroup.mount / create）
└── examples/
    ├── blackpink.html        ← 用组件库 + 原数据复刻原 BLACKPINK v10 案例
    └── template.html          ← 空白复用模板（带示例数据与注释）
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

---

## API

| 方法 | 说明 |
|---|---|
| `StarGroup.mount(container, options)` | 挂载到容器，返回实例 |
| `StarGroup.create(options)` | 仅创建 DOM 节点，自行 append |
| `new StarGroup(options)` | 获得实例，可 `.mount()` / `.create()` |

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
  tabs: [
    { id: 'members'|'timeline'|'works', label: string, count?: number },
    { id: 'more', label: string, more: true }   // 末位固定为"更多"
  ],
  members: [
    {
      key: string,               // 唯一标识
      name: string,              // "Jisoo · 金智秀"
      role: string,              // "队内定位：主唱 · 视觉"（详情面板用全称，成员卡用去前缀值）
      shortName: string,         // 图片兜底显示文字
      state: string,             // "在团"
      img: string,               // 头像 URL
      photoSource?: string,      // 图片来源标注（小屏隐藏）
      relations: [ [label, value], ... ]   // 详情面板行
    }
  ],
  timeline: [
    {
      time: string,              // "2016.08"
      title: string,             // "出道 ·《Square One》"
      desc: string,              // 简短描述（折叠态可见）
      img?: string, alt?: string, // 节点配图
      story: string              // 经历背景长文（点击卡片原地展开后显示）
    }
  ],
  works: [
    {
      img: string, alt?: string, year: string, title: string,
      desc: string,              // 简短描述（悬停中心卡可见）
      story: string               // 创作背景长文（故事面板）
    }
  ],
  moreTitle: string,              // 资料 Modal 标题
  moreSub?: string,               // 资料 Modal 副标
  moreDecl: string,               // 资料 Modal 底栏声明
  moreFacts: [
    { label: string, value: string, full?: boolean }   // full 跨两列
  ],
  autoPlayMember: number,         // 默认 3000ms
  autoPlayWorks: number          // 默认 3500ms
}
```

---

## 主题定制

在 `options.theme` 中传入键值对，key 可省略 `--sg-` 前缀：

```js
StarGroup.mount(el, {
  theme: {
    primary: '#FF5A5F',   // 等价于 --sg-primary
    accent:  '#00A699',
    ink:     '#222222',
    soft:    '#FFF1F2'
  },
  // ...其他数据
});
```

或在 CSS 中直接覆盖：

```css
.sg-frame {
  --sg-primary: #FF5A5F;
  --sg-accent:  #00A699;
}
```

完整变量清单见 `docs/设计规范.md` 第一节。

---

## 组件清单

| 组件 | 类名前缀 | 说明 |
|---|---|---|
| 画布 | `.sg-frame` | 固定尺寸 + 三档响应式 |
| Tab Bar | `.sg-tab-bar` / `.sg-tab` | N 等分，末位 `.sg-tab-more` 特殊态 |
| 视图栈 | `.sg-view-stack` / `.sg-view` | 绝对定位堆叠，显隐切换 |
| 成员网格 | `.sg-member-grid` / `.sg-member` | 2×2 分页 + 自动播放 |
| 头像 | `.sg-avatar` | load/error 兜底 + 来源标注 |
| 详情面板 | `.sg-detail-panel` / `.sg-relation-row` | kicker + 关系列表 |
| 通用轮播控件 | `.sg-arrow` / `.sg-dots` | 箭头 + 圆点指示器 |
| 时间线 | `.sg-tl-track` / `.sg-t-item` | 横向 snap + 原地展开经历故事 |
| 作品轮播 | `.sg-works-carousel` / `.sg-work-item` | 3D 5 档位中心聚焦 |
| 故事面板 | `.sg-work-story-panel` | 覆盖作品视图的滑入面板 |
| Modal | `.sg-modal-overlay` / `.sg-modal-card` | 事实网格 + 统一 X 按钮 |

---

## 交互行为一览

| 模块 | 触发 | 行为 |
|---|---|---|
| Tab 切换 | 点击 | 切换面板 + 重置时间线 + 启停作品自动播放 |
| 成员卡 | 点击 | 更新详情面板；小屏（≤500 或 ≤380h）弹成员 Modal |
| 成员自动播放 | 进入页面 | 3s/个循环，任意交互停止 |
| 成员分页 | 箭头/圆点 | 翻页，停止自动播放 |
| 时间线条目 | 点击 | 原地展开经历背景故事（`is-expanded`），再点收起 |
| 时间线展开态 | 自动 | 关闭 scroll-snap → 420ms 后居中定位 → 恢复 proximity snap |
| 时间线 | 滚动/箭头 | snap 翻页，实时更新页码与圆点 |
| 作品轮播 | 进入 Tab | 3.5s 自动播放 |
| 作品侧卡 | 点击 | 切换为中心 |
| 作品中心卡 / CTA | 点击 | 弹创作故事面板 |
| 故事面板 | ESC/点遮罩/X | 关闭，恢复作品自动播放 |
| Modal | "其它"Tab | 打开资料说明；ESC/点遮罩/X 关闭 |

---

## 响应式断点

| 断点 | 画布 | 关键差异 |
|---|---|---|
| PC（默认） | 788×492 | 双栏、时间线 3 列/页 + 原地展开 58% 宽、作品 5 档位 |
| `≤500px`（WISE） | 380×456 | 单栏、详情面板隐藏、时间线 2 列 + 底部控制栏 + 展开 82% |
| `≤320px 或 ≤380h`（极端） | 100%（min 280×340） | 隐藏 `<small>` 计数、点击成员弹 Modal、时间线 2 列 + 展开 88% |

---

## 与 v1.0 的差异

- **时间线**：v10 行为是「原地展开经历背景故事」（点击卡片 `is-expanded`，显示 `.sg-t-story` 长文），不再为时间线单独弹 Modal。`timeline` 数据新增 `story` 字段。
- **作品数据**：完整收录 6 首团体作品，每首含完整 `story` 创作背景长文。
- **成员 Modal**：含头像信息头（`.sg-mdm-header`：圆形头像 + 名字 + 角色）。

---

## 设计规范

完整的主题色、Tab 元素、交互模式、逻辑设置说明见 **`docs/设计规范.md`**。

---

## 版本

- v1.1.0 - 从 BLACKPINK v10 案例提炼，新增时间线原地展开故事特性
