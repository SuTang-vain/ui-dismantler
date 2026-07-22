# 人工查验入口

## 直接查验

- 组件页面：`lib/examples/sandadui.html`
- 原始测试副本：`original.html`
- 参考截图：`artifacts/reference.png`
- 组件截图：`artifacts/generated.png`
- 差异图：`artifacts/diff.png`
- 完整指标：`quality-report.json`
- 阶段报告：`TEST_REPORT.md`

## 本地启动

在仓库根目录执行：

```bash
python3 -m http.server 4173
```

然后访问：

```text
http://localhost:4173/examples/cases/sandadui-graph-ts/lib/examples/sandadui.html
```

建议人工检查：

1. 点击人物“程兵”，确认人物详情面板打开；
2. 点击关闭按钮，确认图谱恢复；
3. 切换“漫漫刑途 / 千里追凶 / 终有回响”，确认人物和连线更新；
4. 切换到“作品推荐”；
5. 切换“同题材 / 同主演 / 同编剧”；
6. 缩放浏览器到移动端尺寸，检查画布缩放、标签和详情面板。

## 多视口截图

- Desktop：`artifacts/reference.png`、`artifacts/generated.png`、`artifacts/diff.png`；
- Tablet：`artifacts/tablet/`；
- Mobile：`artifacts/mobile/`；
- Extreme mobile：`artifacts/tiny/`。

最终质量门禁使用四个视口中的最差 selector coverage、computed style 和 pixel diff。
