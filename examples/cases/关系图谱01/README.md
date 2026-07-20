# xie-tianzi · 关联词动态百科组件库

> 源自「挟天子以令诸侯 · 关联词详解」HTML 案例的标准化、数据驱动、零依赖前端组件库。
> 适用于成语/词语的 **动态百科卡片**：基本释义 · 典故出处 · 关联词图谱 · 随堂测验 四视图切换。

## 目录结构

```
组件库/
├── src/
│   ├── xie-tianzi.css       # 样式（含 :root 主题令牌）
│   └── xie-tianzi.js        # 渲染引擎（IIFE，零依赖）
├── examples/
│   ├── xie-tianzi.html      # 真实数据示例
│   └── template.html        # 占位数据模板
├── docs/
│   └── 设计规范.md           # 设计规范（主题色/结构/交互）
└── README.md
```

## 快速开始

```html
<link rel="stylesheet" href="src/xie-tianzi.css">
<div id="mount"></div>
<script src="src/xie-tianzi.js"></script>
<script>
XieTianzi.mount(document.getElementById('mount'), {
  title: '挟天子以令诸侯',
  nav: [
    { key: 'home', label: '基本释义' },
    { key: 'story', label: '典故出处' },
    { key: 'graph', label: '关联词' },
    { key: 'quiz', label: '测一测' }
  ],
  home: { /* ... */ },
  story: { /* ... */ },
  graph: { /* ... */ },
  quiz:  { /* ... */ }
});
</script>
```

## API

| 方法 | 说明 |
| --- | --- |
| `XieTianzi.mount(container, options)` | 挂载到 `container`，返回根节点 `.sg-frame` |
| `XieTianzi.create(options)` | 仅创建根节点（不插入 DOM） |

## 数据契约（Options）

```ts
interface Options {
  title: string;            // 词条
  pinyin?: string;          // 拼音
  cover?: string;           // 封面图 URL
  tags?: string[];          // 标签（贬义/政治谋略…）
  oneLiner?: string;        // 一句话释义
  initial?: 'home'|'story'|'graph'|'quiz';
  nav: { key: string; label: string }[];
  home: {
    subtabs: { key:string; label:string }[];
    core: { k:string; v:string; wide?:boolean }[];
    examples: { text:string }[];     // 支持 **粗体**
    synonyms: string[];
    antonyms: string[];
  };
  story: {
    subtabs: { key:string; label:string }[];
    cards: { badge:string; main:string; sub:string; body:string }[];
    source: {
      from: string;
      text: string;                 // 支持 [k]词[/k] 注解标记
      tr: string;
      notes: Record<string, [string, string]>;  // key → [标题, 说明]
    };
  };
  graph: {
    center: { w:string; x:number; y:number };
    nodes: { w:string; rel:string; x:number; y:number; desc:string }[];
    nodeImgs?: Record<string, string>;   // 词条 → 图片 URL
  };
  quiz: {
    questions: { t:string; o:string[]; a:number; fb:string }[];
    resultDesc?: string;
    badges: { full:string; ok:string; low:string };
  };
  theme?: Record<string, string>;   // 覆盖 --sg-* 变量
}
```

## 关系类型（graph）

| 关系 | 语义 | 主题令牌 |
| --- | --- | --- |
| 近义词 / 衍生词义 | 绿色 | `--sg-rel-syn` |
| 同类意象 | 蓝色 | `--sg-rel-similar` |
| 典籍关联 | 橙色 | `--sg-rel-book` |
| 人物关联 | 紫色 | `--sg-rel-person` |
| 反义词 | 红色 | `--sg-rel-antonym` |

## 主题定制

在 `.sg-frame` 上覆盖 `--sg-*` 变量即可，例如：

```css
.my-brand .sg-frame {
  --sg-primary: #4e6ef2;
  --sg-primary-dark: #3b5bdb;
  --sg-rel-syn: #2ecc71;
}
```

或在 `options.theme` 中传入：`{ '--sg-primary': '#4e6ef2' }`。

## 交互行为

| 元素 | 行为 |
| --- | --- |
| 顶部导航 `.sg-nav-tab` | 切换四个面板（tablist/tabpanel） |
| 出处原文高亮词 `.sg-hl` | 点击弹出注解 modal |
| 图谱节点 `.sg-gnd` | 点击在侧栏查看详情；移动端弹窗 |
| 关系筛选 `.sg-graph-filter` | 按关系类型过滤图谱节点 |
| 选项 `.sg-opt` | 作答后显示对错与反馈，解锁「下一题」 |
| 弹窗 `.sg-modal` | ESC 关闭 / 点击遮罩关闭 |

## 响应式断点

| 断点 | 行为 |
| --- | --- |
| PC（>500px） | 788×492，四视图，图谱双栏（画布+侧栏） |
| ≤500px | 全屏，子标签可见，释义/典故纵向堆叠，图谱点击弹窗 |
| ≤320px | 300×360，字号与间距收紧 |

## 无障碍

- 顶部导航、子标签均为 `role=tablist` / `role=tab`，面板 `role=tabpanel`
- 弹窗 `role=dialog` / `aria-modal`，支持 ESC 关闭与焦点回退
- 全局 `aria-live` 区域公告面板切换与答题状态
- 图谱节点、选项、关闭按钮均支持键盘（Enter/Space）操作

## 版本

v1.0.0
