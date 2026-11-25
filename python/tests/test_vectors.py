from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from lexvira_pii import find_pii, mask_pii

VECTORS_DIR = Path(__file__).resolve().parents[2] / "test-vektorleri"
VECTORS = json.loads((VECTORS_DIR / "kaliplar.json").read_text(encoding="utf-8"))
KNOWN_DIFFS = json.loads((VECTORS_DIR / "bilinen-farklar.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("row", VECTORS, ids=lambda row: row["girdi"])
def test_all_ts_vectors_pass(row: dict[str, str]) -> None:
    assert mask_pii(row["girdi"]).masked == row["beklenen"]


def test_known_diffs_file_is_empty() -> None:
    active_keys = [k for k in KNOWN_DIFFS if not k.startswith("_")]
    assert active_keys == []


def test_spans_are_sorted_and_non_overlapping() -> None:
    text = "TC 10000000146 tel 05321234567 TR330006100519786457841326"
    spans = find_pii(text)
    assert len(spans) == 3
    for prev, curr in zip(spans, spans[1:]):
        assert curr.start >= prev.end


@pytest.mark.parametrize(
    "text",
    [
        "b." * 20_000,
        "ş." * 20_000,
        "ğ" * 40_000,
        "a@" * 20_000,
        "0" + "\n" * 20_000,
    ],
)
def test_linear_time_no_redos(text: str) -> None:
    start = time.perf_counter()
    spans = find_pii(text)
    elapsed = time.perf_counter() - start
    assert spans == []
    assert elapsed < 0.5
