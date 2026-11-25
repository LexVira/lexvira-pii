from __future__ import annotations

from pathlib import Path

from lexvira_pii import PiiSpan
from lexvira_pii.allowlist import filter_with_allowlist, load_allowlist

PY_ALLOWLIST = Path(__file__).resolve().parents[1] / "src" / "lexvira_pii" / "data" / "izin-listesi.json"
TS_ALLOWLIST = Path(__file__).resolve().parents[2] / "veri" / "izin-listesi.json"


def test_allowlist_matches_ts_copy() -> None:
    assert PY_ALLOWLIST.read_bytes() == TS_ALLOWLIST.read_bytes()


def test_load_allowlist_has_all_12_languages() -> None:
    allowlist = load_allowlist()
    assert set(allowlist.keys()) == {
        "tr",
        "en",
        "de",
        "fr",
        "es",
        "it",
        "nl",
        "pt",
        "ru",
        "az",
        "kk",
        "uz",
    }
    assert "Yargıtay" in allowlist["tr"]


def test_allowlist_filters_ner_spans_but_preserves_deterministic_patterns() -> None:
    text = "Raad van State, TC 10000000146"
    spans = [
        PiiSpan(type="PERSON", start=5, end=8, text="van"),
        PiiSpan(type="NATIONAL_ID", start=19, end=30, text="10000000146"),
    ]
    filtered = filter_with_allowlist(text, spans, lang="nl")
    assert filtered == [PiiSpan(type="NATIONAL_ID", start=19, end=30, text="10000000146")]


def test_allowlist_case_and_ascii_folding_tr() -> None:
    text = "YARGITAY 3. Hukuk Dairesi ve DENEME İŞ MAHKEMESİ"
    spans = [
        PiiSpan(type="PII", start=0, end=8, text="YARGITAY"),
        PiiSpan(type="PII", start=36, end=48, text="İŞ MAHKEMESİ"),
    ]
    assert filter_with_allowlist(text, spans, lang="tr") == []


def test_allowlist_extra_terms() -> None:
    text = "Atatürk Üniversitesi"
    spans = [PiiSpan(type="PERSON", start=0, end=7, text="Atatürk")]
    assert filter_with_allowlist(text, spans, lang="tr", allowlist=["Atatürk Üniversitesi"]) == []


def test_allowlist_short_circuits_empty_and_deterministic_spans(monkeypatch: object) -> None:
    import lexvira_pii.allowlist as allowlist_mod

    def _boom(*_args: object, **_kwargs: object) -> list[tuple[int, int]]:
        raise AssertionError("find_allowlist_spans should not run when no non-deterministic spans exist")

    monkeypatch.setattr(allowlist_mod, "find_allowlist_spans", _boom)  # type: ignore[attr-defined]
    assert filter_with_allowlist("Yargıtay kararı", [], lang="tr") == []
    det = [PiiSpan(type="NATIONAL_ID", start=3, end=14, text="10000000146")]
    assert filter_with_allowlist("TC 10000000146", det, lang="tr") == det
