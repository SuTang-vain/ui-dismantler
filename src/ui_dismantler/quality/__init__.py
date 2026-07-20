"""Design-guideline quality inspection independent from canonical UI-IR."""
from .inspection import inspect_uiir
from .schema import QUALITY_IR_FORMAT, QUALITY_SCHEMA_VERSION, validate_quality_ir
__all__ = ["QUALITY_IR_FORMAT", "QUALITY_SCHEMA_VERSION", "inspect_uiir", "validate_quality_ir"]
