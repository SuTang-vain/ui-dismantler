# 刘浩存光影星途互动图鉴 0721 TypeScript 拆分测试报告

## 输入

原始目录：`/Users/tangyaoyue/Downloads/刘浩存光影星途互动图鉴0721 3`

仓库测试副本：`examples/cases/liu-haocun-0721-ts/original.html`

## 方法

本案例使用 DOM/CSS/JavaScript parser-backed 转译：

- JSDOM 重写静态 HTML 的 class/id；
- css-tree AST 重写 CSS selector 和自定义变量；
- Acorn AST 只修改 JavaScript 字符串与 template literal 中的 DOM/CSS 契约；
- 原始初始化顺序完整保留；
- 默认业务数组支持通过 `mount(root, options)` 覆盖；
- 运行后由 Chrome Gold+ 检查 selector、computed style 和 screenshot。

未使用整文件 class/ID 正则批量替换。

## 产物

- `lib/src/liu-haocun.css`
- `lib/src/liu-haocun.js`
- `lib/examples/liu-haocun.html`
- `lib/examples/template.html`
- `lib/assets/*`
- `lib/README.md`
- `lib/docs/设计规范.md`
- `manifest.json`
- `scenarios.json`
- `quality-report.json`

## 最终结果

| 门禁 | 结果 |
|---|---:|
| validate | 10/10 PASS |
| node --check | PASS |
| DOM structure | 0.996 |
| text | 1.000 |
| DOM overall | 0.998 |
| selector coverage | 1.000 |
| computed style | 0.9976 |
| pixel diff | 0.0000% |
| visual score | 0.9987 |
| final overall | 0.9984 |
| 正式交互场景 | 4/4 PASS |
| runtime errors | 0 |

## 交互覆盖

- 切换到“艺人身份”视图；
- 打开宋威龙合作详情；
- 使用 ESC 关闭弹层；
- 身份画廊切换到下一张“活动红毯”。

## 中间问题及修复

第一版出现：核心主题变量缺失、内部 layout slots 被误认为业务数据、动态 ID/class 未进入静态映射、mount wrapper 影响 DOM 顶层对齐。修复后重新执行全部门禁，没有只重跑失败项。
