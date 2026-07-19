# Skill CLI 兼容层

本目录保存 Agent Skill 使用的稳定命令路径。真实实现位于 `src/ui_dismantler/`；包装脚本通过 `_bootstrap.py` 加载核心模块。

- 不在本目录新增业务算法。
- 修改行为时同步修改核心包与 `tests/`。
- 旧命令路径应继续可运行，除非发布明确的破坏性迁移说明。
