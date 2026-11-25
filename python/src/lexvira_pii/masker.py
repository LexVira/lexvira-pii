"""Public stateless PII detection and masking functions."""

from __future__ import annotations

from typing import Iterable, NamedTuple

from lexvira_pii.allowlist import filter_with_allowlist
from lexvira_pii.patterns import PiiSpan, find_pattern_spans

PLACEHOLDERS: dict[str, str] = {
    "NATIONAL_ID": "[TC-KİMLİK-GİZLİ]",
    "PHONE": "[TELEFON-GİZLİ]",
    "IBAN": "[IBAN-GİZLİ]",
    "EMAIL": "[EMAIL-GİZLİ]",
    "PLATE": "[PLAKA-GİZLİ]",
    "PERSON": "[KİŞİ-GİZLİ]",
    "ADDRESS": "[ADRES-GİZLİ]",
    "ID_DOCUMENT": "[KİMLİK-GİZLİ]",
    "PII": "[PII-GİZLİ]",
}


class MaskResult(NamedTuple):
    """Result returned by :func:`mask_pii`."""

    masked: str
    entities: list[PiiSpan]


def find_pii(
    text: str,
    *,
    lang: str = "tr",
    allowlist: Iterable[str] = (),
) -> list[PiiSpan]:
    """Detect deterministic PII spans in ``text``."""
    raw_spans = find_pattern_spans(text)
    return filter_with_allowlist(text, raw_spans, lang=lang, allowlist=allowlist)


def mask_pii(
    text: str,
    *,
    lang: str = "tr",
    allowlist: Iterable[str] = (),
) -> MaskResult:
    """Mask deterministic PII spans in ``text`` with fixed vector placeholders."""
    spans = find_pii(text, lang=lang, allowlist=allowlist)
    if not spans:
        return MaskResult(masked=text, entities=[])

    parts: list[str] = []
    cursor = 0
    for span in spans:
        parts.append(text[cursor : span.start])
        parts.append(PLACEHOLDERS.get(span.type, "[PII-GİZLİ]"))
        cursor = span.end
    parts.append(text[cursor:])

    return MaskResult(masked="".join(parts), entities=spans)
