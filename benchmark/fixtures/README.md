# Benchmark fixtures

本目录只保存测试与演示输入，不属于可发布组件包。

- `glossary-demo.js`：用于复现原始 Technical Glossary benchmark 的 reviewed fixture。
- 组件运行时从 `mount(container, options)` 接收数据；`benchmark/lib/src/` 不内置这些记录。
- 业务数据、实体关系和 Data Pack 不在 `ui-dismantler` 内生成；如需领域标准化，应交给 `sg-data-pack`。
