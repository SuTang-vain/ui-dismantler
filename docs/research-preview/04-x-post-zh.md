# X 发布文案 — 中文同步稿

## 推荐主帖

> DOM 等价不等于视觉等价。
>
> 我正在研究一个源代码感知型网页迁移系统：把现有 HTML/CSS/JavaScript 页面拆解成 TypeScript 组件库，再通过 DOM、计算样式、像素、交互、资源和 4 个视口验证迁移结果。
>
> 第一阶段 Research Preview ↓

## 中文 Thread

### 1/6

> 这个项目最初暴露过一个典型问题：DOM roundtrip 已经是 1.0，旧验证全部通过，但页面像素差异仍达到 15.2%。
>
> DOM 结构相似，并不表示 CSS 真正命中，也不表示最终渲染一致。

### 2/6

> 这不是 screenshot-only 生成。
>
> 系统输入已有 HTML、CSS、JavaScript 和资源，目标是把现有实现迁移为可复用 TypeScript 组件，同时保持视觉、响应式和交互行为。

### 3/6

> 当前流程：
>
> DOM/CSS/JS AST 分析
> → 交互责任建模
> → 组件边界与复杂度规划
> → TypeScript 转译
> → 浏览器执行质量门禁
> → 定向修复与回归

### 4/6

> 最新代表案例识别了 42 个责任：
>
> • 11 个用户动作
> • 1 个手势协议
> • 20 个导航动作
> • 6 个无操作控件
> • 4 个生命周期责任
>
> 其中真正需要状态证明的是 12 个，当前 12/12 已验证，人工 coverage waiver 为 0。

### 5/6

> 当前代表性结果：
>
> • validation 10/10
> • 4/4 视口
> • 6/6 正式场景
> • selector coverage 1.0
> • overall 0.9941
> • 最差关键状态 pixel diff 0.0063
> • runtime/resource/stability failure 均为 0

### 6/6

> 目前仍是早期研究预览，不是任意网站通用或 SOTA 声明。
>
> 下一步希望征集可公开的 Canvas、WebGL、SVG filter、拖拽、音视频时间轴、Shadow DOM 和流式 UI 对抗案例。
