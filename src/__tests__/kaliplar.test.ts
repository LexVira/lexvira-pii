import { describe, expect, it } from "vitest";
import farklar from "../../test-vektorleri/bilinen-farklar.json" with { type: "json" };
import vektorler from "../../test-vektorleri/kaliplar.json" with { type: "json" };
import { kalipSpanlari, tcGecerli } from "../kaliplar";

const MASKE: Record<string, string> = {
  TC: "[TC-KİMLİK-GİZLİ]",
  TELEFON: "[TELEFON-GİZLİ]",
  IBAN: "[IBAN-GİZLİ]",
  EPOSTA: "[EMAIL-GİZLİ]",
  PLAKA: "[PLAKA-GİZLİ]",
};
const BILINEN = farklar as unknown as Record<string, { ts_beklenen: string }>;

function pythonGibiMaskele(metin: string): string {
  let cikti = metin;
  for (const s of [...kalipSpanlari(metin)].sort((a, b) => b.start - a.start)) {
    cikti = cikti.slice(0, s.start) + MASKE[s.tur] + cikti.slice(s.end);
  }
  return cikti;
}

describe("kalıplar — Python PIIFilter paritesi", () => {
  it.each(vektorler)("$girdi", ({ girdi, beklenen }) => {
    expect(pythonGibiMaskele(girdi)).toBe(BILINEN[girdi]?.ts_beklenen ?? beklenen);
  });

  it("bilinen farkların hepsi vektör dosyasında var (bayat fark kalmaz)", () => {
    const girdiler = new Set(vektorler.map((v) => v.girdi));
    for (const k of Object.keys(BILINEN).filter((k) => !k.startsWith("_"))) expect(girdiler.has(k)).toBe(true);
  });

  it("TC sağlama toplamı", () => {
    expect(tcGecerli("10000000146")).toBe(true);
    expect(tcGecerli("12345678901")).toBe(false);
    expect(tcGecerli("01234567890")).toBe(false);
  });

  it("span'ler örtüşmez ve sıralıdır", () => {
    const sp = kalipSpanlari("TC 10000000146 tel 05321234567 TR330006100519786457841326");
    for (let i = 1; i < sp.length; i++) expect(sp[i].start).toBeGreaterThanOrEqual(sp[i - 1].end);
  });
});
