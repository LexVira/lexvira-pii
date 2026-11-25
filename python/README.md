# lexvira-pii

Deterministic Turkish and multilingual PII detection and masking for Python, sharing test-vector parity with `@lexvira/maskeleme`.

> Note: Package name `lexvira-pii` is a placeholder pending final PyPI naming confirmation.

## Installation

```bash
pip install lexvira-pii
```

## Quick Start

```python
from lexvira_pii import find_pii, is_valid_tckn, mask_pii

text = "Plaintiff TCKN 10000000146, tel +90 532 123 45 67, email avukat@ornek.com.tr"

spans = find_pii(text, lang="tr")
# [
#   PiiSpan(type='NATIONAL_ID', start=15, end=26, text='10000000146'),
#   PiiSpan(type='PHONE', start=32, end=48, text='+90 532 123 45 67'),
#   PiiSpan(type='EMAIL', start=56, end=75, text='avukat@ornek.com.tr'),
# ]

result = mask_pii(text)
# result.masked -> "Plaintiff TCKN [TC-KİMLİK-GİZLİ], tel [TELEFON-GİZLİ], email [EMAIL-GİZLİ]"

is_valid_tckn("10000000146")  # True
is_valid_tckn("12345678901")  # False
```

## Supported Patterns

- **Turkish National ID (`NATIONAL_ID`)**: 11-digit TCKN validation including official checksum rules (`is_valid_tckn`).
- **IBAN (`IBAN`)**: Spaced and unspaced Turkish IBANs (`TR..`). Matched before phone patterns to avoid partial overlaps.
- **Phone (`PHONE`)**: Turkish mobile and landline formats (`+90 ...`, `0 (...) ...`, `05xx ...`), linear-time regex safe against ReDoS.
- **Email (`EMAIL`)**: Unicode-aware local and domain parts (including Turkish characters), linear-time regex.
- **License Plate (`PLATE`)**: Turkish vehicle registration plates (`01`–`81` province code validation).
- **Allowlist Filtering**: Built-in public institution and court names across 12 languages (`tr`, `en`, `de`, `fr`, `es`, `it`, `nl`, `pt`, `ru`, `az`, `kk`, `uz`) plus custom `allowlist` terms.

## Limitations & Scope

This package provides **deterministic pattern matching and allowlist filtering only** (zero runtime dependencies). It does **not** include a Named Entity Recognition (NER) model or streaming session restoration.

For multilingual person/address NER detection, pair it with an external NER detector such as [`Wismut/nym-pii-multilingual`](https://huggingface.co/Wismut/nym-pii-multilingual) (MIT license).

## License

Licensed under the **Apache License, Version 2.0**. See [LICENSE](./LICENSE).

## LexVira API

Looking for KVKK-compliant legal research across 50+ jurisdictions? Explore the [LexVira Legal Research API](https://www.lexvira.com/en/legal-research-api?utm_source=huggingface&utm_medium=pii-package&utm_campaign=faz1).
