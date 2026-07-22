# 人工查验入口

## 原始页面副本

- `original.html`

## 拆分后的组件库

- `lib/examples/liu-haocun.html`
- `lib/examples/template.html`
- `lib/src/liu-haocun.css`
- `lib/src/liu-haocun.js`
- `lib/README.md`
- `lib/docs/设计规范.md`

## 交互场景

- `scenarios.json`
- `quality-report.json`

## 视觉对比

- `artifacts/reference.png`
- `artifacts/generated.png`
- `artifacts/diff.png`

## 结论

- validate: 10/10 PASS
- DOM overall: 0.998
- computed style: 0.9976
- pixel diff: 0%
- scenarios: 4/4 PASS

## 多视口截图

- Desktop：`artifacts/reference.png`、`artifacts/generated.png`、`artifacts/diff.png`；
- Tablet：`artifacts/tablet/`；
- Mobile：`artifacts/mobile/`；
- Extreme mobile：`artifacts/tiny/`。

最终质量门禁使用四个视口中的最差 selector coverage、computed style 和 pixel diff。

## 关键交互状态截图

人物详情/弹层打开场景的四视口截图位于：

```text
artifacts/scenarios/<scenario-id>/
```

这些截图是在执行 click 之后生成，不是初始页面截图。
