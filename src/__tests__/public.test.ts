import { describe, expect, it } from "vitest";
import vektorler from "../../test-vektorleri/kaliplar.json" with { type: "json" };
import * as rootApi from "../index";
import {
  GeriKoymaHatasi,
  PII_TYPE_TO_TUR,
  TUR_TO_PII_TYPE,
  createSession,
  findPii,
  isValidTckn,
  maskPii,
  restorePii,
  type PiiType,
} from "../public";
import { TURLER } from "../tipler";

describe("public API — pattern detection and masking", () => {
  it("public maskPii passes all pattern vectors", () => {
    for (const { girdi, beklenen } of vektorler) {
      expect(maskPii(girdi).masked).toBe(beklenen);
    }
  });

  it("findPii returns typed spans", () => {
    const input =
      "TC 10000000146, Tel +90 532 123 45 67, IBAN TR33 0006 1005 1978 6457 8413 26, Email test@example.com, Plate 34 ABC 1234";
    const spans = findPii(input);

    expect(spans.map((s) => s.type)).toEqual(["NATIONAL_ID", "PHONE", "IBAN", "EMAIL", "PLATE"]);
    for (const span of spans) {
      expect(span.text).toBe(input.slice(span.start, span.end));
      expect(span.start).toBeLessThan(span.end);
    }

    const masked = maskPii(input);
    expect(masked.entities).toEqual(spans.map(({ type, start, end }) => ({ type, start, end })));
    expect(masked.masked).toBe(
      "TC [TC-KİMLİK-GİZLİ], Tel [TELEFON-GİZLİ], IBAN [IBAN-GİZLİ], Email [EMAIL-GİZLİ], Plate [PLAKA-GİZLİ]",
    );
  });

  it("exposes bidirectional Tur <-> PiiType mapping for every internal type", () => {
    for (const tur of TURLER) {
      const piiType: PiiType = TUR_TO_PII_TYPE[tur];
      expect(PII_TYPE_TO_TUR[piiType]).toBe(tur);
    }
  });

  it("isValidTckn validates checksums", () => {
    expect(isValidTckn("10000000146")).toBe(true);
    expect(isValidTckn("12345678901")).toBe(false);
    expect(isValidTckn("01234567890")).toBe(false);
  });

  it("supports lang and allowlist options without dropping deterministic patterns", () => {
    const input = "Supreme Court of the United States TC 10000000146";
    const spans = findPii(input, { lang: "en", allowlist: ["Custom Authority"] });
    expect(spans).toEqual([{ type: "NATIONAL_ID", start: 38, end: 49, text: "10000000146" }]);
  });
});

describe("public API — session masking and restoration", () => {
  it("restorePii round-trips a session", async () => {
    const session = createSession({ lang: "tr" });
    const original = "Davacı TC 10000000146, tel 05321234567 ve yine TC 10000000146.";
    const masked = await session.mask(original);

    expect(masked).toBe("Davacı TC ⟦TC_1⟧, tel ⟦TELEFON_1⟧ ve yine TC ⟦TC_1⟧.");
    expect(restorePii(masked, session)).toBe(original);
  });

  it("createSession supports custom detector and preserves ⟦KİŞİ_n⟧ placeholders", async () => {
    const session = createSession({
      lang: "tr",
      detector: {
        async detect(text) {
          const idx = text.indexOf("Ahmet Yılmaz");
          if (idx < 0) return [];
          return [
            { label: "GIVEN_NAME", start: idx, end: idx + 5 },
            { label: "SURNAME", start: idx + 6, end: idx + 12 },
          ];
        },
      },
    });

    const original = "Davacı Ahmet Yılmaz, TC 10000000146";
    const masked = await session.mask(original);
    expect(masked).toBe("Davacı ⟦KİŞİ_1⟧, TC ⟦TC_1⟧");
    expect(restorePii(masked, session)).toBe(original);
  });

  it("restorePii fails closed on corrupted or unknown placeholders", async () => {
    const session = createSession({ lang: "tr" });
    await session.mask("TC 10000000146");
    expect(() => restorePii("⟦TC_99⟧", session)).toThrow(GeriKoymaHatasi);
  });

  it("re-exports public API from package index", () => {
    expect(rootApi.findPii).toBe(findPii);
    expect(rootApi.maskPii).toBe(maskPii);
    expect(rootApi.createSession).toBe(createSession);
    expect(rootApi.restorePii).toBe(restorePii);
    expect(rootApi.isValidTckn).toBe(isValidTckn);
  });
});
