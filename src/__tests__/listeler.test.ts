import { describe, expect, it } from "vitest";
import { avukatListesiSpanlari, izinListesiyleSuz } from "../listeler";

describe("avukat listesi", () => {
  it("tüm biçimleri yakalar", () => {
    const m = "Müvekkil DENEME HOLDİNG ile Deneme Holding'in sözleşmesi";
    expect(avukatListesiSpanlari(m, ["Deneme Holding"], "tr").map((s) => m.slice(s.start, s.end))).toEqual(["DENEME HOLDİNG", "Deneme Holding"]);
  });
  it("kelime içinde eşleşmez", () => {
    expect(avukatListesiSpanlari("Alikaya", ["Ali"], "tr")).toEqual([]);
  });
  it("çok boşluklu yazımı da yakalar ve tür KİŞİ'dir", () => {
    const sp = avukatListesiSpanlari("Deneme   Holding", ["Deneme Holding"], "tr");
    expect(sp).toEqual([{ start: 0, end: 16, tur: "KİŞİ" }]);
  });
});

describe("izin listesi", () => {
  it("kurum içindeki kişi span'i atılır, kalıp span'i kalır", () => {
    const m = "Raad van State, TC 10000000146";
    const s = izinListesiyleSuz(m, [{ start: 5, end: 8, tur: "KİŞİ" }, { start: 19, end: 30, tur: "TC" }], "nl");
    expect(s).toEqual([{ start: 19, end: 30, tur: "TC" }]);
  });
  it("kurum dışındaki aynı kelime atılmaz", () => {
    const m = "Jan van Dijk en de Raad van State";
    expect(izinListesiyleSuz(m, [{ start: 0, end: 12, tur: "KİŞİ" }], "nl")).toHaveLength(1);
  });
  it("büyük harfli kurum yazımı da korunur (tr)", () => {
    const m = "YARGITAY 3. Hukuk Dairesi";
    expect(izinListesiyleSuz(m, [{ start: 0, end: 8, tur: "PII" }], "tr")).toEqual([]);
  });
  it("kurum içindeki NER kaynaklı ADRES/KİMLİK span'i de atılır (kk doğrulama vakası)", () => {
    const m = "Қазақстан Республикасындағы Адам құқықтары жөніндегі уәкіл";
    const s = m.indexOf("құқықтары");
    expect(izinListesiyleSuz(m, [{ start: s, end: s + 9, tur: "ADRES" }, { start: 0, end: 9, tur: "KİMLİK" }], "kk")).toEqual([]);
  });
  it("ek terimler uygulanır", () => {
    const m = "Atatürk Üniversitesi";
    expect(izinListesiyleSuz(m, [{ start: 0, end: 7, tur: "KİŞİ" }], "tr", ["Atatürk Üniversitesi"])).toEqual([]);
  });
});
