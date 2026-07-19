# 开发与测试指南

## 环境

- Python 3.9+
- Node.js 18+
- 基础 Python 依赖：`beautifulsoup4`、`jinja2`
- 可选运行时观察：`playwright` + Chromium
- roundtrip DOM 渲染：`jsdom`

```bash
python3 -m pip install -r requirements.txt
npm install

# 仅在需要 --runtime-observe / --runtime-actions 时安装
python3 -m pip install -r requirements-runtime.txt
python3 -m playwright install chromium
```

## 测试分层

| 目录 | 内容 |
|---|---|
| `tests/unit/` | CSS 工具、HTML 分析、showcase、UI-IR 模型和 CLI |
| `tests/integration/` | Playwright 页面行为、跨资源解析和页面形态矩阵 |
| `tests/fixtures/` | 去远程依赖、可迁移的页面与场景数据 |
| `docs/baselines/` | 面向长期比较的 manifest、runtime 和 roundtrip 结果 |

完整测试：

```bash
python3 scripts/test.py
# 兼容旧命令
python3 scripts/tests/run.py
```

单独执行：

```bash
python3 -m unittest tests.unit.test_uiir_v2
python3 -m unittest tests.integration.test_uiir_pages
```

## 修改核心代码

1. 在 `src/ui_dismantler/` 找到对应领域模块。
2. 保持 CLI 与算法分离；核心函数接收值并返回值，不直接依赖命令行。
3. 为新行为增加单元测试；涉及浏览器或跨文件资源时增加集成测试。
4. 如改变长期输出，更新对应基线并在 `docs/baselines/README.md` 说明原因。
5. 运行完整测试与相关 CLI smoke test。

## 新增命令

推荐结构：

```text
src/ui_dismantler/<domain>/...     # 算法
src/ui_dismantler/cli/<command>.py # argparse + 文件 I/O + main()
src/skill/scripts/<command>.py     # 必要时提供兼容包装
```

兼容脚本不得复制算法。它只应调用 `_bootstrap.expose()` 并转发 `main()`。

## UI-IR 修改检查表

- canonical 文档仍通过 `validate_uiir()`。
- 相同输入输出保持确定性。
- manifest v1 -> UI-IR -> manifest v1 保持兼容字段。
- compact 投影不意外暴露运行时值或大体积证据。
- 静态 CSS `@media` 解析失败时仍有明确 warning/fallback。
- Playwright 不可用时不会阻断纯静态转换。
- 新的运行时场景操作必须受白名单与数量上限约束。

## 发布前检查

```bash
python3 -m compileall -q src/ui_dismantler src/skill/scripts tests
python3 scripts/test.py
python3 src/skill/scripts/manifest_v1_to_uiir.py \
  docs/baselines/manifests/manifest_huang-yueying.json --check
python3 scripts/verify_all.py --lib-dir out
```

若仅调整结构，也必须验证核心包导入与旧 CLI 路径均可用。
