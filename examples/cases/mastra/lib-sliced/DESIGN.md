# Mastra 设计规范

## 品牌色

| 令牌 | 值 | 用途 |
|---|---|---|
| `--sg-c15t-primary` | `#ffffff` | 主文字色、高亮 |
| `--sg-c15t-surface` | `#0f0f0f` | 页面背景 |
| `--sg-c15t-surface-hover` | `#171717` | 卡片/面板背景 |
| `--sg-c15t-border` | `#1c1c1c` | 边框 |
| `--sg-c15t-text` | `#f0f0f0` | 正文 |
| `--sg-c15t-text-muted` | `#939393` | 次级文字 |

## 语义色

| 令牌 | 值 | 用途 |
|---|---|---|
| `--sg-ds-main-white` | `#ffffff` | 白色文字/图标 |
| `--sg-ds-main-gray` | `#939393` | 灰色文字 |
| `--sg-ds-special-gray` | `#787878` | 标签文字 |
| `--sg-ds-dark-gray` | `#535353` | 链接文字 |
| `--sg-ds-green` | `#4ade80` | 焦点环、成功状态 |
| `--sg-ds-surface-antigrid` | `#141414` | 卡片背景 |
| `--sg-ds-surface-elevation-sm` | `#1a1a1a` | 按钮/轻微高程 |
| `--sg-ds-border-antigrid` | `#222222` | 卡片边框 |

## 排版

| 层级 | 字号 | 字重 | 行高 |
|---|---|---|---|
| Hero 标题 | clamp(40px, 6vw, 80px) | 700 | 1.05 |
| 分区标题 | clamp(32px, 4vw, 56px) | 700 | 1.1 |
| Tab 面板标题 | 28px | 700 | 1.2 |
| 卡片标题 | 22px | 700 | 1.2 |
| 正文 | 18px / 16px / 15px | 400/450/500 | 1.5/1.6 |
| 小字 | 14px / 13px / 12px | 400/450 | 1.4 |
| 标签/代码 | 9px-12.5px | 600 | 1.0 |

## 间距

- 页面级 padding: 24px (PC) / 16px (mobile)
- 分区间距: 80px (PC) / 60px (mobile)
- 卡片间隙: 16px
- 内部 padding: 32px (PC) / 24px (mobile)

## 圆角

| 层级 | 值 |
|---|---|
| 卡片 | 40px |
| 特性面板 | 24px |
| Tab 按钮 | 10px |
| 小标签 | 9999px (full) |
| 导航链接 | 0.44rem |

## 组件规范

### 导航栏
- 固定顶部，backdrop-filter blur 半透明背景
- 左侧 Logo SVG，右侧链接 + CTA 按钮
- Mobile: 隐藏链接，显示汉堡按钮

### Hero
- 全屏高度，居中布局
- Badge → 大标题 → 副标题 → CTA 按钮组 → 可视化演示区域
- 标题支持 `html` 换行

### 特性 Tab
- 居中 Tab 条，5 个按钮
- 激活态白色背景黑色文字
- 面板分左右两栏：文字说明 + 功能列表

### 卡片网格
- 3 列网格，可选宽卡（span 2）
- 悬停上移 2px + 边框变亮
- 右上角箭头旋转动画

### FAQ
- 原生 `<details>` 手风琴
- 展开时箭头旋转 90°
- 平滑高度过渡

## 响应式断点

| 断点 | 目标 |
|---|---|
| 768px | 平板 |
| 500px | 手机 |

## 动画

- `sg-hero-agent-anim`: 1s fade-in + scale
- `sg-color-ripple`: 3s 渐变文字流动
- 卡片悬停: 300ms ease-out
- Tab 切换: 150ms ease
- `prefers-reduced-motion`: 禁用所有动画

## 可访问性

- `focus-visible` 绿色焦点环
- 语义化 HTML 结构
- 颜色对比度满足 WCAG AA