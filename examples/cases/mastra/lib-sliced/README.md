# Mastra · 组件库

复刻自 [Mastra.ai](https://mastra.ai) 官网的营销着陆页组件库。

## 结构

```
lib-sliced/
├── src/
│   ├── mastra.css       # 组件样式（12 片组件切片）
│   └── mastra.js        # IIFE 渲染引擎
├── examples/
│   └── mastra.html      # 示例页面
├── README.md            # 本文件
├── DESIGN.md            # 设计规范
└── template.json        # 数据模板
```

## API

- `Mastra.mount(container, options)`：创建实例并挂载默认页面。
- `Mastra.create(options)`：创建 DOM 根节点，不自动挂载。
- `Mastra.version`：当前组件库版本 `0.1.0`。

## 主题

颜色和字体通过 `--sg-*` 变量覆盖；组件不要求外部运行时依赖。

## 使用方式

```html
<link rel="stylesheet" href="src/mastra.css">
<script src="src/mastra.js"></script>
<script>
Mastra.mount(document.getElementById('mount'), {
  // 可选覆盖默认数据
});
</script>
```

## 组件切片

| # | 切片 | 说明 |
|---|---|---|
| 01 | tokens | 设计令牌（品牌色、字体、间距） |
| 02 | reset | 基础重置 |
| 03 | nav | 顶部导航栏 |
| 04 | hero | Hero 区域 |
| 05 | section-head | 分区标题原子 |
| 06 | feature-tabs | 特性 Tab 切换 |
| 07 | card-grid | 客户故事卡片网格 |
| 08 | faq | FAQ 手风琴 |
| 09 | cta-section | CTA 表单区域 |
| 10 | footer | 页脚 |
| 11 | animations | 关键帧动画 |
| 12 | a11y | 可访问性 |

## 数据契约

`Mastra()` 构造函数接收 `options` 对象，包含以下字段：

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `nav` | Object | 见 DEFAULTS | 导航栏配置 |
| `hero` | Object | 见 DEFAULTS | Hero 区域内容 |
| `tabs` | Array | 5 个特性 | Tab 定义 |
| `tabPanels` | Object | 见 DEFAULTS | Tab 面板内容 |
| `customerStories` | Array | 9 个故事 | 卡片网格数据 |
| `faq` | Array | 6 条问答 | FAQ 数据 |
| `cta` | Object | 见 DEFAULTS | CTA 区域 |
| `footer` | Object | 见 DEFAULTS | 页脚数据 |

## 交互

- Feature Tabs 支持点击与 `ArrowLeft`/`ArrowRight` 键盘切换。
- FAQ 使用原生 `<details>` 展开/收起。
- CTA 邮箱输入保留原生表单输入状态；外部订阅提交由宿主应用接入。

## 约束

- 零外部依赖（纯原生 JS/CSS）
- 所有类名使用 `sg-` 前缀
- 所有颜色通过 `--sg-*` CSS 变量
- 三档响应式：PC + 768px + 500px