from __future__ import annotations

import lexvira_pii
from lexvira_pii import MaskResult, PiiSpan, find_pii, is_valid_tckn, mask_pii


def test_public_api_exports() -> None:
    assert callable(lexvira_pii.find_pii)
    assert callable(lexvira_pii.mask_pii)
    assert callable(lexvira_pii.is_valid_tckn)
    assert lexvira_pii.PiiSpan is PiiSpan
    assert lexvira_pii.MaskResult is MaskResult


def test_invalid_tckn_not_masked() -> None:
    assert is_valid_tckn("01234567890") is False
    # Leading 0 with [1-9] second digit matches Turkish PHONE, never NATIONAL_ID.
    assert mask_pii("01234567890").masked == "[TELEFON-GİZLİ]"

    for bad in (
        "12345678901",
        "10000000147",
        "11111111111",
        "00000000000",
        "1000000014",
        "100000001460",
        "abcdefghijk",
    ):
        assert is_valid_tckn(bad) is False
        assert mask_pii(f"TC {bad}").masked == f"TC {bad}"

    assert is_valid_tckn("10000000146") is True
    assert mask_pii("TC 10000000146").masked == "TC [TC-KİMLİK-GİZLİ]"


def test_find_pii_and_mask_pii_contract() -> None:
    text = (
        "TC 10000000146, Tel +90 532 123 45 67, "
        "IBAN TR33 0006 1005 1978 6457 8413 26, Email test@example.com, Plate 34 ABC 1234"
    )
    spans = find_pii(text)
    assert [s.type for s in spans] == ["NATIONAL_ID", "PHONE", "IBAN", "EMAIL", "PLATE"]
    for span in spans:
        assert isinstance(span, PiiSpan)
        assert span.text == text[span.start : span.end]
        assert span.start < span.end

    result = mask_pii(text)
    assert isinstance(result, MaskResult)
    assert result.entities == spans
    assert result.masked == (
        "TC [TC-KİMLİK-GİZLİ], Tel [TELEFON-GİZLİ], IBAN [IBAN-GİZLİ], "
        "Email [EMAIL-GİZLİ], Plate [PLAKA-GİZLİ]"
    )


def test_lang_and_allowlist_preserve_deterministic_patterns() -> None:
    text = "Supreme Court of the United States TC 10000000146"
    spans = find_pii(text, lang="en", allowlist=("Custom Authority",))
    assert spans == [PiiSpan(type="NATIONAL_ID", start=38, end=49, text="10000000146")]


def test_empty_and_non_ascii_digits_do_not_false_positive() -> None:
    assert find_pii("") == []
    assert mask_pii("").masked == ""
    # Arabic-Indic digits should not be treated as ASCII TCKN/plate digits
    assert find_pii("١٠٠٠٠٠٠٠١٤٦") == []
