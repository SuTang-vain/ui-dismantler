"""Quality finding detectors."""
from .render import RENDER_DETECTORS, inspect_render_findings
from .static import DETECTORS, inspect_uiir
__all__ = ["DETECTORS", "RENDER_DETECTORS", "inspect_render_findings", "inspect_uiir"]
