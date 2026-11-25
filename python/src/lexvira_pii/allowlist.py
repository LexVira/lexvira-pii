"""Public institution allowlist loading and span filtering."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from importlib.resources import files
from typing import Iterable, Sequence

from lexvira_pii.patterns import PiiSpan

DETERMINISTIC_TYPES: frozenset[str] = frozenset(
    {"NATIONAL_ID", "IBAN", "PHONE", "EMAIL", "PLATE"}
)

_TR_AZ_FOLD: dict[str, str] = {
    "ı": "i",
    "ş": "s",
    "ğ": "g",
    "ç": "c",
    "ö": "o",
    "ü": "u",
    "ʻ": "'",
    "’": "'",
    "‘": "'",
}

_APOSTROPHES = frozenset({"ʻ", "’", "‘"})


def _lower_locale(text: str, lang: str) -> str:
    if lang in ("tr", "az"):
        text = text.replace("I", "ı").replace("İ", "i")
    return text.lower()


def fold_case(text: str, lang: str) -> str:
    """Locale-aware lowercasing plus TR/AZ ASCII folding and apostrophe normalization."""
    lowered = _lower_locale(text, lang)
    if lang in ("tr", "az"):
        return "".join(_TR_AZ_FOLD.get(ch, ch) for ch in lowered)
    return "".join("'" if ch in _APOSTROPHES else ch for ch in lowered)


def _same_length_lower(text: str, lang: str) -> str:
    """Fold character-by-character only when character length is preserved."""
    out: list[str] = []
    for ch in text:
        folded = fold_case(ch, lang)
        out.append(folded if len(folded) == len(ch) else ch)
    return "".join(out)


@lru_cache(maxsize=1)
def load_allowlist() -> dict[str, tuple[str, ...]]:
    """Load the bundled public institution allowlist keyed by language code."""
    raw_text = files("lexvira_pii").joinpath("data/izin-listesi.json").read_text(encoding="utf-8")
    raw_data = json.loads(raw_text)
    return {
        key: tuple(value)
        for key, value in raw_data.items()
        if not key.startswith("_") and isinstance(value, list)
    }


def find_allowlist_spans(
    text: str,
    terms: Iterable[str],
    *,
    lang: str = "tr",
) -> list[tuple[int, int]]:
    """Find ``[start, end)`` intervals where allowlist terms occur with word boundaries."""
    lowered_text = _same_length_lower(text, lang)
    matches: list[tuple[int, int]] = []

    for term in terms:
        parts = _same_length_lower(term.strip(), lang).split()
        if not parts:
            continue
        body = r"\s+".join(re.escape(part) for part in parts)
        pattern = re.compile(rf"(?<!\w){body}(?!\w)")
        for match in pattern.finditer(lowered_text):
            matches.append(match.span())

    matches.sort(key=lambda span: span[0])
    return matches


def filter_with_allowlist(
    text: str,
    spans: Sequence[PiiSpan],
    *,
    lang: str = "tr",
    allowlist: Iterable[str] = (),
) -> list[PiiSpan]:
    """Drop non-deterministic spans fully enclosed in an allowlisted institution name.

    Deterministic pattern spans (``NATIONAL_ID``, ``IBAN``, ``PHONE``, ``EMAIL``,
    ``PLATE``) are always preserved even when appearing near or inside an institution.
    """
    if not spans or all(span.type in DETERMINISTIC_TYPES for span in spans):
        return list(spans)

    extra_terms = tuple(allowlist)
    builtin_terms = load_allowlist().get(lang, ())
    if not builtin_terms and not extra_terms:
        return list(spans)

    allow_spans = find_allowlist_spans(text, (*builtin_terms, *extra_terms), lang=lang)
    if not allow_spans:
        return list(spans)

    return [
        span
        for span in spans
        if span.type in DETERMINISTIC_TYPES
        or not any(a_start <= span.start and span.end <= a_end for a_start, a_end in allow_spans)
    ]
