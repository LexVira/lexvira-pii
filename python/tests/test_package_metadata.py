"""Paket üst verisi: PyPI sayfasına giden README ve sürüm tutarlılığı."""

from __future__ import annotations

import tomllib
from pathlib import Path

import lexvira_pii

KOK = Path(__file__).resolve().parents[1]


def test_readme_yer_tutucu_ad_notu_tasimaz() -> None:
    # README PyPI açıklaması olarak yayınlanır; ad 2026-11-25'te kesinleşti.
    readme = (KOK / "README.md").read_text(encoding="utf-8")
    assert "placeholder" not in readme.lower()


def test_surum_pyproject_ile_ayni() -> None:
    pyproject = tomllib.loads((KOK / "pyproject.toml").read_text(encoding="utf-8"))
    assert lexvira_pii.__version__ == pyproject["project"]["version"]
