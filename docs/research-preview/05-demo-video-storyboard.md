# Research Preview 演示视频分镜

## 目标

在 20–40 秒内让第一次看到项目的人理解：

1. 输入是已有页面源代码；
2. 输出是 TypeScript 组件库；
3. reference/generated 可以并排比较；
4. 系统验证的不只是首屏截图；
5. 当前结果有量化证据，但仍是 Research Preview。

## 推荐规格

```text
Duration: 28–36 seconds
Resolution: 1920×1080 或 1600×900
Frame rate: 30fps
Format: MP4 H.264
Audio: 可无声；优先字幕和轻量指示
Safe area: 预留 X 播放器裁切
```

## 分镜

| 时间 | 画面 | 字幕 |
|---:|---|---|
| 0–3s | reference/generated 并排首屏 | `Existing Web Page → Componentized TypeScript` |
| 3–7s | desktop 同步滚动 | `Execution-grounded comparison` |
| 7–11s | desktop/tablet/mobile/tiny 快速切换 | `4 responsive viewports` |
| 11–15s | 切换主题 | `Formal interaction: theme state` |
| 15–19s | 复制命令，展示 copied feedback | `Clipboard feedback verified` |
| 19–23s | 打开 FAQ | `DOM state + ARIA + visual matrix` |
| 23–27s | 键盘或 wheel 横向滚动 | `Real wheel/key protocol, not fake clicks` |
| 27–31s | 显示质量报告摘要 | `DOM / Style / Pixel / Interaction / Runtime` |
| 31–35s | 架构图 + CTA | `Research preview — send an adversarial page` |

## 录制要求

- reference 左侧、generated 右侧，全程保持标签；
- 不显示本机用户名、Downloads 路径、Cookie、终端秘密或私人标签页；
- 浏览器缩放固定 100%；
- 关闭无关扩展 UI 和通知；
- 使用同一浏览器版本和相同 viewport；
- 动态场景必须来自当前冻结 commit；
- 不通过剪辑隐藏明显失败；
- 允许加速等待时间，但字幕应标注 `timing shortened for demo`；
- 视频结尾显示 `Research Preview / limited representative suite`。

## 建议录制页面

```text
Reference:
examples/dispatch-experiments/babelo-landing/source/index.html

Generated:
examples/dispatch-experiments/babelo-landing/lib/examples/babelo.html
```

本地预览：

```bash
cd /Users/<user>/DEV/Baidu/ui-dismantler-browser-matrix-reuse
python3 -m http.server 4187 --bind 127.0.0.1
```

Generated URL：

```text
http://127.0.0.1:4187/examples/dispatch-experiments/babelo-landing/lib/examples/babelo.html
```

## 建议输出文件

```text
assets/01-reference-vs-generated.mp4
assets/01-reference-vs-generated-poster.png
assets/02-architecture.png
assets/03-metrics-card.png
assets/04-dom-vs-pixel-failure.png
```
