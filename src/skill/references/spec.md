# 强约束规范（spec.md）

所有由本 skill 生成的组件库必须遵循以下 8 项强约束。`validate_lib.py` 据此校验。

## 1. 命名前缀

| 对象 | 规则 | 示例 |
|---|---|---|
| CSS 类名 | `sg-` 前缀，kebab-case | `.sg-tab-bar` `.sg-member` `.sg-modal-card` |
| CSS 变量 | `--sg-` 前缀 | `--sg-primary` `--sg-ink` |
| JS 全局对象 | `window.<LibName>`，PascalCase | `window.StarGroup` |
| JS 公共 API | `.mount(container, opts)` / `.create(opts)` | — |
| DOM id | `sg-` 前缀 | `#sg-panel-members` |

**禁止**：无前缀的通用类名（`.tab`、`.member`、`.modal`），避免宿主页面冲突。

## 2. CSS 变量归一化

原案例变量名各异，必须按下表归一化到 `--sg-*` 命名空间：

| 原命名模式（正则） | 归一化为 | 语义 |
|---|---|---|
| `--primary`, `--primary-color`, `--marker-primary`, `--brand` | `--sg-primary` | 主功能色 |
| `--accent`, `--accent-color`, `--cause-color` | `--sg-accent` | 强调色 |
| `--ink`, `--text-main`, `--text-primary`, `--color-text` | `--sg-ink` | 主文字 |
| `--muted`, `--text-secondary`, `--text-sub`, `--text-muted` | `--sg-muted` | 次级文字 |
| `--subtle`, `--text-tertiary`, `--text-light` | `--sg-subtle` | 三级文字 |
| `--line`, `--border`, `--divider` | `--sg-line` | 分割线 |
| `--paper`, `--bg-white`, `--panel-bg`, `--card-bg` | `--sg-paper` | 卡片底色 |
| `--stage`, `--bg-gray`, `--bg-color` | `--sg-stage` | 画布背景 |
| `--soft`, `--primary-l`, `--primary-light` | `--sg-soft` | 主色浅底 |

未匹配的原变量：`--sg-<去连词原名>`，并在 manifest 的 `theme.tokens[].original` 记录原名。

## 3. 数据分离

- 所有可变内容（成员、作品、时间线、事实）必须以 JSON 数组形式存在
- JS 中通过 `<script type="application/json" id="...">` 内嵌或 `options` 参数传入
- **禁止**在 JS 渲染逻辑中硬编码业务文案/URL

校验：生成库的 `examples/*.html` 必须能通过替换 JSON 数据生成不同内容卡片。

## 4. 响应式三档

必须含三档 `@media` 断点（即使原案例只有 PC 也要补全）：

| 档位 | 断点 | 画布尺寸 | 必备调整 |
|---|---|---|---|
| PC | 默认 | 原案例 PC 尺寸 | 完整布局 |
| WISE | `max-width: 500px` | 380×456 | 单栏、隐藏次要面板、控件缩小 |
| 极端 | `max-width: 320px, max-height: 380px` | 100%（min 280×340） | 字号缩小、弹窗替代面板、隐藏计数 |

## 5. A11y

| 元素 | 要求 |
|---|---|
| Tab Bar | `role="tablist"` + `role="tab"` + `aria-selected` + `aria-controls` |
| 面板 | `role="tabpanel"` + `aria-labelledby` + `hidden` |
| Modal | `role="dialog"` + `aria-modal="true"` + `hidden` |
| 动态播报区 | `aria-live="polite"` |
| 图标按钮 | `aria-label` |
| 关闭 | ESC 键 + 点击遮罩 + X 按钮 三选一以上 |

## 6. 主题可定制

- 所有颜色必须经 CSS 变量，**禁止**在样式规则中硬编码 `#hex` 或 `rgb()`
- 渐变中的颜色也必须引用变量：`linear-gradient(var(--sg-paper), var(--sg-soft))`
- 唯一例外：纯黑白透明叠加（如 `rgba(0,0,0,0.75)` 蒙版）可硬编码
- 校验：`grep -E '#[0-9a-fA-F]{3,8}' src/*.css` 只应出现在 `:root` 变量定义和注释中

## 7. 零依赖

- 禁止 `<script src="...">` 引入外部 JS（含 CDN）
- 禁止 `<link rel="stylesheet" href="https://...">` 引入外部 CSS
- 唯一例外：字体 CDN（`font-family` 引用的 Google Fonts 等）
- 生成的 `.css`/`.js` 之间可互相引用，但不得依赖第三方库

## 8. 文档完备

每个生成的组件库必须含：

| 文件 | 内容 |
|---|---|
| `README.md` | 快速开始 + API + 数据契约 + 主题定制说明 |
| `docs/设计规范.md` | 主题色令牌表 + Tab 结构 + 交互模式 + 逻辑设置 |

## 校验脚本行为

`validate_lib.py <组件库目录>` 逐项检查，输出：

```
[PASS] 1. 命名前缀
[PASS] 2. CSS 变量归一化
[FAIL] 3. 数据分离 — examples/example.html 中发现硬编码 URL
  ↳ src/glossary.js:142  img.src = 'https://...'
[PASS] 4. 响应式三档
...
```

退出码：全过 0，有失败 1。
