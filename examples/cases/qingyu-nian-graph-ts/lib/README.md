# 庆余年人物关系与剧情脉络组件库

从自包含页面拆分出的零依赖人物关系图谱与作品推荐组件库。

## 快速开始

```html
<link rel="stylesheet" href="src/qingyu-nian.css">
<div id="mount"></div>
<script src="src/qingyu-nian.js"></script>
<script>QingyuNianAtlas.mount(document.getElementById('mount'));</script>
```

## API

### `QingyuNianAtlas.mount(root, options)`

将人物关系图谱、人物详情和作品推荐挂载到指定容器。`options` 可用于覆盖源页面中识别出的数据集合。

### `QingyuNianAtlas.create(options)`

创建并返回独立组件容器。

## 主要能力

- 人物关系图谱与关系连线；
- 人物详情侧栏；
- 关系类型图例；
- 作品推荐分类 Tab；
- 推荐作品翻页；
- PC、平板和移动端响应式布局。

## 主题定制

通过 `--sg-primary`、`--sg-ink`、`--sg-muted`、`--sg-line`、`--sg-paper` 等 CSS 变量覆盖主题。
