# @lexvira/maskeleme

Deterministic Turkish and multilingual PII detection, masking, and fail-closed session restoration for TypeScript and Node.js.

## Installation

```bash
npm install @lexvira/maskeleme
```

```bash
pnpm add @lexvira/maskeleme
```

## Quick Start

### Stateless pattern detection & masking

```ts
import { findPii, maskPii, isValidTckn } from "@lexvira/maskeleme";

const text = "Plaintiff TCKN 10000000146, tel +90 532 123 45 67, email avukat@ornek.com.tr";

const spans = findPii(text, { lang: "tr" });
// [
//   { type: "NATIONAL_ID", start: 15, end: 26, text: "10000000146" },
//   { type: "PHONE", start: 32, end: 48, text: "+90 532 123 45 67" },
//   { type: "EMAIL", start: 56, end: 77, text: "avukat@ornek.com.tr" }
// ]

const { masked, entities } = maskPii(text);
// "Plaintiff TCKN [TC-KİMLİK-GİZLİ], tel [TELEFON-GİZLİ], email [EMAIL-GİZLİ]"

isValidTckn("10000000146"); // true
isValidTckn("12345678901"); // false
```

### Session-based masking & fail-closed restoration

```ts
import { createSession, restorePii } from "@lexvira/maskeleme";

const session = createSession({ lang: "tr" });

const masked = await session.mask("TC 10000000146 ve IBAN TR33 0006 1005 1978 6457 8413 26");
// "TC ⟦TC_1⟧ ve IBAN ⟦IBAN_1⟧"

const restored = restorePii(masked, session);
// "TC 10000000146 ve IBAN TR33 0006 1005 1978 6457 8413 26"
```

If an LLM response corrupts or hallucinates a placeholder (for example `⟦TC_99⟧` or `TC_1`), `restorePii` throws `GeriKoymaHatasi` instead of silently leaking corrupted output.

## Supported Patterns

- **Turkish National ID (`NATIONAL_ID`)**: 11-digit TCKN validation including the official checksum rules (`isValidTckn`).
- **IBAN (`IBAN`)**: Spaced and unspaced Turkish IBANs (`TR..`). Matched before phone patterns to avoid partial overlaps.
- **Phone (`PHONE`)**: Turkish mobile and landline formats (`+90 ...`, `0 (...) ...`, `05xx ...`), linear-time regex safe against ReDoS.
- **Email (`EMAIL`)**: Unicode-aware local and domain parts (e.g. Turkish characters in email addresses), linear-time regex.
- **License Plate (`PLATE`)**: Turkish vehicle registration plates (`01`–`81` province code validation).
- **Allowlist Filtering**: Built-in public institution and court names across 12 languages (`tr`, `en`, `de`, `fr`, `es`, `it`, `nl`, `pt`, `ru`, `az`, `kk`, `uz`) plus custom `allowlist` terms.

## Limitations & NER Pairing

This package provides **deterministic pattern matching and allowlist filtering only**. It does **not** bundle a Named Entity Recognition (NER) model, so person names, street addresses, or unstructured identifiers are not detected out of the box.

For multilingual person/address NER detection, pair `createSession({ detector })` with an external NER detector such as [`Wismut/nym-pii-multilingual`](https://huggingface.co/Wismut/nym-pii-multilingual) (MIT license). The model weights are not distributed with this package and must be obtained separately from Hugging Face.

## License

Licensed under the **Apache License, Version 2.0**. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for details.

## LexVira API

Looking for KVKK-compliant legal research across 50+ jurisdictions? Explore the [LexVira Legal Research API](https://www.lexvira.com/en/legal-research-api?utm_source=huggingface&utm_medium=pii-package&utm_campaign=faz1).
