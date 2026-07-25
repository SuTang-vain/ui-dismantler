# Research Preview Assets

本目录存放对外视频、截图和图表。当前只定义规范，不提交未经审核的二进制素材。

## 推荐文件

```text
01-reference-vs-generated.mp4
01-reference-vs-generated-poster.png
02-architecture-light.png
02-architecture-dark.png
03-metrics-card.png
04-dom-vs-pixel-failure.png
05-four-viewports.png
06-interaction-responsibility.png
```

## 素材要求

- 不含本机绝对路径；
- 不含用户名、Cookie、token、API key；
- 不含未授权第三方素材；
- reference/generated 标签清晰；
- 指标与 `../metrics.snapshot.json` 一致；
- 图片宽度建议至少 1600px；
- X 视频使用 H.264 MP4；
- 为每个媒体准备英文 alt text；
- 视频结尾标记 `Research Preview / limited representative suite`。

## Alt text 模板

### Reference/generated video

> Side-by-side browser recording of an existing interactive web page and its generated TypeScript component-library version across desktop and mobile viewports, including theme, clipboard, FAQ, and horizontal-scroll interactions.

### Architecture diagram

> Diagram showing existing HTML, CSS, JavaScript, and assets flowing through DOM/CSS/AST analysis, interaction responsibility modeling, component planning, TypeScript translation, and executable quality gates for DOM, style, pixels, interactions, resources, and runtime stability.
