# dahua-xiyou · 人物关系与剧情全解析组件库

> 源自「大话西游 · 人物关系与剧情全解析」HTML 案例的标准化、数据驱动、零依赖前端组件库。
> 适用于 **影视人物关系图谱**：底部双视图（故事图谱 + 作品推荐），含剧情模块切换、可拖拽关系图、角色详情面板。

## 目录结构

```
组件库/
├── src/
│   ├── dahua-xiyou.css      # 样式（含 :root 主题令牌）
│   └── dahua-xiyou.js       # 渲染引擎（IIFE，零依赖）
├── examples/
│   ├── dahua-xiyou.html     # 真实数据示例
│   └── template.html        # 占位数据模板
├── docs/
│   └── 设计规范.md           # 设计规范
└── README.md
```

## 快速开始

```html
<link rel="stylesheet" href="src/dahua-xiyou.css">
<div id="mount"></div>
<script src="src/dahua-xiyou.js"></script>
<script>
DahuaXiyou.mount(document.getElementById('mount'), {
  tabs: [{ key: 'graph', label: '故事图谱' }, { key: 'works', label: '作品推荐' }],
  legend: [ /* 5 类关系 */ ],
  heroKey: 'zizunbao',
  characters: { /* ... */ },
  edges: [ /* ... */ ],
  stories: [ /* ... */ ],
  worksTabs: { /* ... */ }
});
</script>
```

## API

| 方法 | 说明 |
| --- | --- |
| `DahuaXiyou.mount(container, options)` | 挂载到 `container`，返回根节点 `.sg-frame` |
| `DahuaXiyou.create(options)` | 仅创建根节点（不插入 DOM） |

## 数据契约（Options）

```ts
interface Options {
  tabs: { key: 'graph'|'works'; label: string }[];
  legend: { type: 'family'|'romance'|'master'|'friend'|'enemy'; label: string }[];
  heroKey: string;
  characters: Record<string, {
    name: string; actor?: string; img: string; big?: boolean; desc: string;
  }>;
  edges: { a: string; b: string; type: string; label: string }[];
  heroRel?: Record<string, { type: string; text: string }>;
  stories: { key: string; name: string; desc: string; chars: string[] }[];
  worksTabs: Record<string, { label: string; items: Work[] }>;
  theme?: Record<string, string>;
}
interface Work { n: string; m: string; r: string; cover: string; }
```

## 关系类型（legend）

| 类型 | 语义 | 主题令牌 |
| --- | --- | --- |
| family | 前世今生（实线红） | `--sg-rel-family` |
| romance | 情感（点线粉） | `--sg-rel-romance` |
| master | 师徒（虚线金） | `--sg-rel-master` |
| friend | 结义（长虚绿） | `--sg-rel-friend` |
| enemy | 对立（点划灰） | `--sg-rel-enemy` |

## 主题定制

在 `.sg-frame` 上覆盖 `--sg-*` 变量即可：

```css
.my-brand .sg-frame { --sg-primary: #6487fa; --sg-rel-family: #e74c3c; }
```

或在 `options.theme` 中传入：`{ '--sg-primary': '#6487fa' }`。

## 交互行为

| 元素 | 行为 |
| --- | --- |
| 底部 Tab `.sg-tab` | 切换 故事图谱 / 作品推荐 视图 |
| 剧情按钮 `.sg-story-btn` | 切换剧情模块，重排图谱与连线 |
| 节点头像 `.sg-node` | 点击打开右侧角色详情；可拖动改位 |
| 角色面板 `.sg-char-panel` | 显示角色信息，与主角关系高亮，ESC 关闭 |
| 作品分类 `.sg-works-tab` | 切换同题材/同主演/同类型 |
| 翻页 `.sg-works-btn` | 每页 4 部作品 |

## 响应式断点

| 断点 | 行为 |
| --- | --- |
| PC（>500px） | 788×492，图谱双栏（画布+右侧面板），作品 4 列网格 |
| ≤500px | 380×456，角色面板改为居中弹窗+遮罩，作品横滑 |
| ≤320px | 300×360，字号与间距收紧 |

## 无障碍

- 底部 Tab、剧情切换条、作品分类均为 `role=tablist` / `role=tab`，视图 `role=tabpanel`
- 节点 `role=button`，`tabindex=0`，`aria-label` 含姓名/演员
- 角色面板 `role=dialog`，ESC 关闭，焦点回退
- 全局 `aria-live` 公告视图/剧情切换与详情查看
- 键盘支持：Enter/Space 查看角色，ESC 关闭面板

## 版本

v1.0.0
