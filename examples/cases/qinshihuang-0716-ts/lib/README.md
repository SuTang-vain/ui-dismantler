# 秦始皇 · 七大事件与人物关系组件库

从自包含 HTML 页面拆解出的零依赖、数据驱动组件库。

## 快速开始

```html
<link rel="stylesheet" href="src/qinshihuang.css">
<div id="mount"></div>
<script type="application/json" id="sg-event-data">[]</script>
<script src="src/qinshihuang.js"></script>
<script>QinShihuangLibrary.mount(document.getElementById("mount"));</script>
```

## API

- `QinShihuangLibrary.mount(root, options)`：挂载到指定容器；传入 `options.events` 可替换事件与人物关系数据。
- `QinShihuangLibrary.create(options)`：创建并返回独立组件容器。

## 数据契约

每个事件包含 `name`、`year`、`period`、`image`、`summary`、可选 `summaryShort`、`people` 和 `links`；人物包含 `name`、`role`、`avatar`、`deed`、`impact`，核心人物用 `big: true` 标记。

## 主题

可覆盖 `--sg-primary`、`--sg-ink`、`--sg-muted`、`--sg-line`、`--sg-paper` 等变量。
