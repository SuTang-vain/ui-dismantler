"""Repository-owned paths shared by the tool implementation."""

from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parent
SOURCE_ROOT = PACKAGE_ROOT.parent
PROJECT_ROOT = SOURCE_ROOT.parent
SKILL_ROOT = SOURCE_ROOT / "skill"
TEMPLATE_DIR = SKILL_ROOT / "assets" / "templates"
ROUNDTRIP_RENDERER = PROJECT_ROOT / "scripts" / "_roundtrip_render.mjs"
