# 刘浩存光影星途互动图鉴组件库

从自包含 HTML 页面通过 TypeScript visual quality gates 工具链拆分出的零依赖组件库。

## 快速开始

```html
<link rel="stylesheet" href="src/liu-haocun.css">
<div id="mount"></div>
<script src="src/liu-haocun.js"></script>
<script>LiuHaocunAtlas.mount(document.getElementById('mount'));</script>
```

## API

- `LiuHaocunAtlas.mount(root, options)`：挂载到指定容器；识别出的业务数据可通过 `options` 覆盖。
- `LiuHaocunAtlas.create(options)`：创建并返回独立组件容器。

## 主题定制

可覆盖 `--sg-primary`、`--sg-ink`、`--sg-muted`、`--sg-line`、`--sg-paper` 等 CSS 变量。
