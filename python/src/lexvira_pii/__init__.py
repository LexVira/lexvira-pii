"""LexVira deterministic PII detection and masking package."""

from __future__ import annotations

from lexvira_pii.masker import MaskResult, find_pii, mask_pii
from lexvira_pii.patterns import PiiSpan, is_valid_tckn

__version__ = "0.1.1"

__all__ = [
    "MaskResult",
    "PiiSpan",
    "__version__",
    "find_pii",
    "is_valid_tckn",
    "mask_pii",
]
