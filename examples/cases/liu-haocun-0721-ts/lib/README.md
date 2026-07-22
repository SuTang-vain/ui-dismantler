# 刘浩存光影星途互动图鉴组件库

从 0721 自包含页面语义拆解出的零依赖组件库，包含同框演员关系图、艺人身份画廊和详情弹层。

## 快速开始

```html
<link rel="stylesheet" href="src/liu-haocun.css">
<div id="mount"></div>
<script src="src/liu-haocun.js"></script>
<script>LiuHaocunAtlas.mount(document.getElementById('mount'));</script>
```

## API

### `LiuHaocunAtlas.mount(root, options)`

挂载组件。`options` 可覆盖 `galleries`、`facts`、`tags`、`works`、`costars` 五组业务数据；未提供时使用原案例默认数据。

### `LiuHaocunAtlas.create(options)`

创建并返回一个已挂载的独立 DOM 容器。

## 数据契约

- `galleries[]`: `src/title/work/role/traits`
- `works[]`: `id/category/year/title/role/status/partners/poster/release/stat/desc`
- `costars[]`: `name/weight/reason/image/workIds`
- `facts[]`, `tags[]`: 字符串数组

## 主题定制

覆盖 `--sg-primary`、`--sg-primary-dark`、`--sg-primary-soft`、`--sg-bg`、`--sg-card`、`--sg-text` 等变量。
