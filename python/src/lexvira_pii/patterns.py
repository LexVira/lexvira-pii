"""Deterministic Turkish and multilingual PII pattern matching."""

from __future__ import annotations

import re
from typing import NamedTuple


class PiiSpan(NamedTuple):
    """Half-open span ``[start, end)`` of a detected PII entity in source text."""

    type: str
    start: int
    end: int
    text: str


_TCKN_RE = re.compile(r"[1-9][0-9]{10}")

# Pattern order is significant: IBAN must precede PHONE so unspaced TR IBANs
# are matched in full rather than having their middle digits caught as a phone.
_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("NATIONAL_ID", re.compile(r"(?<!\w)([1-9][0-9]{10})(?!\w)")),
    (
        "IBAN",
        re.compile(
            r"(?<!\w)TR\s*[0-9]{2}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{2}(?!\w)"
        ),
    ),
    (
        "PHONE",
        re.compile(r"(?:\+90|0)[(\s]*[1-9][0-9]{2}[)\s]*[0-9]{3}\s*[0-9]{2}\s*[0-9]{2}"),
    ),
    (
        "EMAIL",
        re.compile(r"(?<![\w.%+-])[\w.%+-]+@(?:[^\W_]|[.-])+\.[^\W\d_]{2,}(?!\w)"),
    ),
    (
        "PLATE",
        re.compile(r"(?<!\w)(?:0[1-9]|[1-7][0-9]|8[01])\s?[A-ZÇĞİÖŞÜ]{1,3}\s?[0-9]{2,5}(?!\w)"),
    ),
)


def is_valid_tckn(value: str) -> bool:
    """Validate a Turkish Republic Identity Number (TCKN) checksum."""
    if not isinstance(value, str) or _TCKN_RE.fullmatch(value) is None:
        return False
    digits = [int(ch) for ch in value]
    odd_sum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8]
    even_sum = digits[1] + digits[3] + digits[5] + digits[7]
    if (odd_sum * 7 - even_sum) % 10 != digits[9]:
        return False
    return sum(digits[:10]) % 10 == digits[10]


def find_pattern_spans(text: str) -> list[PiiSpan]:
    """Return non-overlapping deterministic PII spans sorted by start offset."""
    if not text:
        return []

    spans: list[PiiSpan] = []

    for pii_type, pattern in _PATTERNS:
        for match in pattern.finditer(text):
            start, end = match.span()
            if pii_type == "NATIONAL_ID" and not is_valid_tckn(match.group(1)):
                continue
            if any(start < existing.end and end > existing.start for existing in spans):
                continue
            spans.append(PiiSpan(type=pii_type, start=start, end=end, text=text[start:end]))

    spans.sort(key=lambda sp: sp.start)
    return spans
