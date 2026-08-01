# 分支与归档职责边界

本仓库采用“稳定主线、短期主题分支、独立研究线、不可变归档标签”的治理方式。案例、专项研究和历史实验不能反向定义通用拆解规则。

## `main`

`main` 是泛用前端组件库拆解工具的唯一稳定集成主线，负责：

- Skill Contract、Registry、Task Profile 与 Execution Context；
- source、component、state、router、transport、API、data-surface、primitive 和 lifecycle 责任分析；
- reviewed artifact 与 Responsibility Graph 数据流；
- Component Library Build Plan、Materializer、Runtime Smoke；
- 静态验证、浏览器质量门和发布边界。

进入 `main` 的改动必须保持通用、证据驱动和 fail-closed，不得加入项目名、组件名、路由名、class 或可见文本白名单。

## `codex/*` 主题分支

通用研发使用短期 `codex/*` 分支。每个分支只承载一个可审查目标，并在以下条件满足后合入 `main`：

1. 工作区清洁，提交边界清晰；
2. `npm run test:pr` 与 `npm run verify:component-boundary` 通过；
3. 涉及浏览器、视觉输出或质量阈值时，正式 Gold 门禁通过；
4. 历史输出合同、CLI 退出码和质量阈值未被静默修改；
5. 合入后删除已完全包含的本地与远端主题分支。

## `codex/designrepair-quality-kb`

该分支是独立的 DesignRepair 质量研究线，负责设计规范知识、UIIR、检查型能力和修复研究。它不直接合并进通用组件生产主线。可复用能力必须先提炼为无案例依赖的独立模块或 Skill，再通过单独主题分支进入 `main`。

## `archive/*` 标签

历史实验和重要主线检查点使用 annotated tag 保存，而不是维护长期历史分支。标签是只读研究证据，不参与日常合并。

当前关键检查点包括：

- `archive/main-before-component-production-20260801`：组件生产核心链合入前的 `main`；
- `archive/browser-matrix-reuse-experiment-20260729`：浏览器矩阵复用实验；
- 其他 `archive/*`：已结束专项和清理前快照。

不得移动或复用已有 archive tag。若重新启动归档研究，应从标签创建新的 `codex/*` 分支。

## 跨项目数据边界

`ui-dismantler` 只生产标准组件库和 Data Surface Manifest。业务数据规范化、Data Pack 与 adapter 生成属于 `sg-data-pack`。业务 fixture、endpoint 和实体值不得进入可发布组件运行时。
