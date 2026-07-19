"""UI-IR v2 model - re-export shim.

Canonical implementations have been split into:
- schema.py: constants + utilities
- validation.py: validate_uiir
- conversion/manifest_to_uiir.py: manifest_to_uiir + UIIRBuilder
- conversion/uiir_to_manifest.py: uiir_to_manifest
- projection/{compact,expanded,diff}.py: projection functions

This shim preserves ``from ui_dismantler.uiir.model import X`` for existing
callers. New code should import from the specific submodule.
"""

from __future__ import annotations

from .schema import *  # noqa: F401,F403
from .validation import validate_uiir
from .conversion.manifest_to_uiir import manifest_to_uiir, UIIRBuilder
from .conversion.uiir_to_manifest import uiir_to_manifest
from .projection.compact import uiir_to_compact_observation
from .projection.expanded import uiir_to_expanded_observation, expand_uiir_evidence
from .projection.diff import diff_uiir_observation
