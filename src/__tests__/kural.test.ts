import { describe, expect, it } from "vitest";
import { kucult, normalize, yay } from "../kural";

const maskeli = (metin: string, sp: { start: number; end: number }[]) => sp.map((s) => metin.slice(s.start, s.end));
const disari = (metin: string, sp: { start: number; end: number }[], s: number, e: number) =>
  sp.filter((x) => !(s <= x.start && x.start < e)).map((x) => metin.slice(x.start, x.end));

describe("kucult", () => {
  it("Türkçe/Azerice I ve İ kuralı", () => {
    expect(kucult("IŞIK İSMAİL", "tr")).toBe("ışık ismail");
    expect(kucult("ƏLİYEV", "az")).toBe("əliyev");
    expect(kucult("ISABEL", "es")).toBe("isabel");
  });
});

describe("normalize (V1)", () => {
  it("uzunluk korur ve Türkçe kurala uyar", () => {
    const m = "davalı ELİF KOÇ'den";
    const n = normalize(m, "tr");
    expect(n.length).toBe(m.length);
    expect(n).toContain("Elif Koç");
  });
  it("Kiril büyük harfli kelimeleri çevirir", () => {
    expect(normalize("СУД АЙБАР АБДРАХМАНОВ", "kk")).toBe("Суд Айбар Абдрахманов");
  });
  it("tek harfli büyük kelimeye ve karışık kelimeye dokunmaz", () => {
    expect(normalize("A Blok McDonald", "tr")).toBe("A Blok McDonald");
  });
});

describe("yay (V2)", () => {
  it("büyük harfli ve ekli geçişleri yakalar", () => {
    const m = "Davacı Ahmet Yılmaz geldi. YILMAZ imzaladı. Yılmaz'ın vekili.";
    const s = m.indexOf("Ahmet Yılmaz");
    expect(maskeli(m, yay(m, [{ start: s, end: s + 12 }], "tr"))).toEqual(expect.arrayContaining(["YILMAZ", "Yılmaz"]));
  });
  it("edat ve küçük harfli kelime yayılmaz (nl)", () => {
    const m = "Eiser Jan van der Meer. De uitspraak van de rechtbank en de Raad van State. Meer tekende.";
    const s = m.indexOf("Jan van der Meer");
    const d = disari(m, yay(m, [{ start: s, end: s + 16 }], "nl"), s, s + 16);
    expect(d).not.toContain("van");
    expect(d).not.toContain("der");
    expect(d).toContain("Meer");
  });
  it("isimle aynı yazılan sıradan kelime küçük harfle geçince yayılmaz (tr)", () => {
    const m = "Tanık Ali Kaya dinlendi. Bahçeye kaya parçası düştü. KAYA beyan etti.";
    const s = m.indexOf("Ali Kaya");
    const d = disari(m, yay(m, [{ start: s, end: s + 8 }], "tr"), s, s + 8);
    expect(d).not.toContain("kaya");
    expect(d).toContain("KAYA");
  });
  it("ek kelime listesi (oturumdaki önceki kişiler) yayılımı besler", () => {
    const m = "YILMAZ beyan etti.";
    expect(maskeli(m, yay(m, [], "tr", ["Yılmaz"]))).toEqual(["YILMAZ"]);
  });
});

import { edatBirlestir } from "../kural";

describe("edatBirlestir (nl)", () => {
  const sp = (m: string, d: string) => ({ start: m.indexOf(d), end: m.indexOf(d) + d.length });
  const yazi = (m: string, s: { start: number; end: number }[]) => s.map((x) => m.slice(x.start, x.end));
  it("büyük harfli edat soyadla birleşir", () => {
    const m = "spanningen tussen De Groot en diens leidinggevende";
    expect(yazi(m, edatBirlestir(m, [sp(m, "Groot")], "nl"))).toEqual(["De Groot"]);
  });
  it("tamamı büyük harf çok kelimeli edat", () => {
    const m = "het geschil met VAN DER LINDEN. Op basis";
    expect(yazi(m, edatBirlestir(m, [sp(m, "LINDEN")], "nl"))).toEqual(["VAN DER LINDEN"]);
  });
  it("ad + edat + soyad: edat soyada bağlanır", () => {
    const m = "Gemachtigde van Anna Van der Linden [Adres]";
    expect(yazi(m, edatBirlestir(m, [sp(m, "Anna"), sp(m, "Linden")], "nl"))).toEqual(["Anna", "Van der Linden"]);
  });
  it("küçük harfli edat önünde kişi varsa bağlanır, ilgeç değildir", () => {
    const m = "eiser Jan van der Meer verklaart";
    expect(yazi(m, edatBirlestir(m, [sp(m, "Jan"), sp(m, "Meer")], "nl"))).toEqual(["Jan", "van der Meer"]);
  });
  it("kişi span'i yokken edat tek başına kişi olmaz", () => {
    expect(edatBirlestir("de uitspraak van de rechtbank", [], "nl")).toEqual([]);
    expect(edatBirlestir("de Raad van State besliste", [], "nl")).toEqual([]);
  });
  it("nl dışındaki dillerde uygulanmaz", () => {
    const m = "tanık de Groot";
    expect(yazi(m, edatBirlestir(m, [sp(m, "Groot")], "tr"))).toEqual(["Groot"]);
  });
});

describe("yay — bitişik ek (uz/kk/az)", () => {
  const yazi = (m: string, s: { start: number; end: number }[]) => s.map((x) => m.slice(x.start, x.end));
  it("bilinen soyadın bitişik ekli geçişi yakalanır", () => {
    const m = "Raxmonov keldi. Raxmonovdan qarz undirilsin. ISMOILOVdan so'raldi.";
    const s = m.indexOf("Raxmonov");
    const y = yazi(m, yay(m, [{ start: s, end: s + 8 }], "uz", ["Ismoilov"]));
    expect(y).toEqual(expect.arrayContaining(["Raxmonov", "ISMOILOV"]));
    expect(y.filter((x) => x === "Raxmonov")).toHaveLength(2);
  });
  it("Kiril ek de yakalanır", () => {
    const m = "BEKMURODOVга юборилган";
    expect(yazi(m, yay(m, [], "uz", ["Bekmurodov"]))).toEqual(["BEKMURODOV"]);
  });
  it("Türkçede (kesme işaretli dil) önek eşleşmesi yapılmaz", () => {
    const m = "Kayalar mahallesi";
    expect(yay(m, [], "tr", ["Kaya"])).toEqual([]);
  });
  it("kısa ad (<4 harf) önek olarak yayılmaz; uzun ek (>5) yayılmaz", () => {
    expect(yay("Alisher keldi", [], "uz", ["Ali"])).toEqual([]);
    expect(yay("Raxmonovlarimizdan", [], "uz", ["Raxmonov"])).toEqual([]);
  });
});
