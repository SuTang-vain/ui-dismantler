# 人工查验指引

## 直接打开

```text
examples/cases/qinshihuang-0716-ts/lib/examples/qinshihuang.html
```

## 首屏产物

- `artifacts/reference.png`：输入页面首屏
- `artifacts/generated.png`：组件库首屏
- `artifacts/diff.png`：首屏差异

## 多视口产物

- `artifacts/tablet/`
- `artifacts/mobile/`
- `artifacts/tiny/`

每个目录均包含 `reference.png`、`generated.png`、`diff.png`。

## 关键交互产物

人物弹窗场景：

```text
artifacts/scenarios/open-yingzheng-modal/
```

其中包含 desktop 根目录以及：

- `tablet/`
- `mobile/`
- `tiny/`

建议人工重点检查：

1. 点击“嬴政”头像后，人物详情弹窗是否出现；
2. mobile/tiny 下弹窗是否保持在视口内，遮罩和关闭按钮是否可见；
3. 底部七个事件按钮是否可横向浏览；
4. 点击“创立帝制”“书同文”等事件后，图谱、简介和人物关系是否随事件更新；
5. 点击关闭按钮或按 Escape 后，弹窗和连线高亮是否清除。

完整自动化结果见：`quality-report.json` 与 `TEST_REPORT.md`。
