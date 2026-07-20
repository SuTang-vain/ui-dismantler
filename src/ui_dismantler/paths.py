"""Repository-owned paths shared by the tool implementation.

集中管理仓库内路径常量，避免散落在各脚本里的硬编码路径。
"""

from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parent
SOURCE_ROOT = PACKAGE_ROOT.parent
PROJECT_ROOT = SOURCE_ROOT.parent
SKILL_ROOT = SOURCE_ROOT / "skill"
SCRIPTS_DIR = SKILL_ROOT / "scripts"
TEMPLATE_DIR = SKILL_ROOT / "assets" / "templates"
ROUNDTRIP_RENDERER = PROJECT_ROOT / "scripts" / "_roundtrip_render.mjs"
