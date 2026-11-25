/** 1A son incelemesi (I1–I6, Minor 1) regresyon testleri. Her test bir bulguyu yeniden üretir. */
import { describe, expect, it } from "vitest";
import { OturumEslemesi } from "../esleme";
import { kalipSpanlari } from "../kaliplar";
import { yay } from "../kural";
import { avukatListesiSpanlari } from "../listeler";
import { Maskeleyici } from "../maskeleyici";
import { GeriKoymaHatasi, type Algilayici } from "../tipler";

const yazi = (m: string, s: { start: number; end: number }[]) => s.map((x) => m.slice(x.start, x.end));

describe("I1 — algılayıcı span doğrulaması", () => {
  it.each([
    ["ters span", { etiket: "PII", start: 20, end: 3 }],
    ["sınır dışı", { etiket: "PII", start: 5, end: 999 }],
    ["NaN", { etiket: "PII", start: Number.NaN, end: 4 }],
    ["tamsayı değil", { etiket: "PII", start: 1.5, end: 4 }],
  ])("%s → mask_inference_failed, özgün metin dönmez", async (_ad, bozuk) => {
    const a: Algilayici = { async tespit() { return [{ etiket: "GIVEN_NAME", start: 0, end: 12 }, bozuk]; } };
    const m = new Maskeleyici({ lang: "tr", algilayici: a });
    await expect(m.maskele("Ahmet Yılmaz geldi ve gitti tamam")).rejects.toMatchObject({ kod: "mask_inference_failed" });
  });
  it("OturumEslemesi sınır dışı span'i reddeder", () => {
    expect(() => new OturumEslemesi("tr").maskele("abc", [{ start: 1, end: 9, tur: "KİŞİ" }])).toThrow();
  });
});

describe("I2 — telefon kalıbı doğrusal süre", () => {
  it.each([
    ["0 + 40 bin boşluk", "0" + " ".repeat(40_000)],
    ["0532 + 40 bin boşluk", "0532" + " ".repeat(40_000)],
    ["+90 + 20 bin boşluk", "+90" + " ".repeat(20_000)],
    ["0 + 20 bin satır sonu", "0" + "\n".repeat(20_000)],
  ])("%s < 500 ms", (_ad, metin) => {
    const t = performance.now();
    kalipSpanlari(metin);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe("I3 — Türkçe I/İ ve ASCII yazım katlaması", () => {
  it("avukat listesindeki 'İsmail Kaya' ASCII büyük ve ASCII yazımı yakalar", () => {
    const m = "Müvekkil ISMAIL KAYA ve Ismail Kaya ile ŞAHİN";
    expect(yazi(m, avukatListesiSpanlari(m, ["İsmail Kaya", "Şahin"], "tr"))).toEqual(["ISMAIL KAYA", "Ismail Kaya", "ŞAHİN"]);
    const m2 = "SAHIN geldi";
    expect(yazi(m2, avukatListesiSpanlari(m2, ["Şahin"], "tr"))).toEqual(["SAHIN"]);
  });
  it("V2 'İsmail' yakalandıktan sonra 'ISMAIL' ve 'Ismail' yayılır", () => {
    const m = "İsmail Kaya geldi. ISMAIL imzaladı. Ismail gitti.";
    expect(yazi(m, yay(m, [{ start: 0, end: 11 }], "tr"))).toEqual(expect.arrayContaining(["ISMAIL", "Ismail"]));
  });
  it("eşleme: 'İsmail Kaya' ile 'ISMAIL KAYA' aynı kişi", () => {
    const e = new OturumEslemesi("tr");
    expect(e.maskele("İsmail Kaya", [{ start: 0, end: 11, tur: "KİŞİ" }])).toBe("⟦KİŞİ_1⟧");
    expect(e.maskele("ISMAIL KAYA", [{ start: 0, end: 11, tur: "KİŞİ" }])).toBe("⟦KİŞİ_1⟧");
  });
});

describe("I4 — kesme işaretli isimler (uz)", () => {
  it("G'aniyev ve bitişik ekli G'aniyevdan yayılır", () => {
    const m = "G'aniyev Botir keldi. G'ANIYEV imzoladi. G'aniyevdan so'raldi.";
    const y = yazi(m, yay(m, [{ start: 0, end: 14 }], "uz"));
    expect(y).toEqual(expect.arrayContaining(["G'ANIYEV", "G'aniyev"]));
    expect(y.filter((x) => x === "G'aniyev").length).toBeGreaterThanOrEqual(2);
  });
});

describe("I5 — kişi kimliği sıradan bağımsız", () => {
  it("tek soyad tam addan ÖNCE geçse de aynı kişi", () => {
    const e = new OturumEslemesi("tr");
    const m = "Yılmaz ifade verdi. Davacı Ahmet Yılmaz geldi.";
    const s1 = m.indexOf("Yılmaz");
    const s2 = m.indexOf("Ahmet Yılmaz");
    expect(e.maskele(m, [{ start: s1, end: s1 + 6, tur: "KİŞİ" }, { start: s2, end: s2 + 12, tur: "KİŞİ" }])).toBe(
      "⟦KİŞİ_1⟧ ifade verdi. Davacı ⟦KİŞİ_1⟧ geldi.",
    );
  });
  it("tek kelime bilinen bir kişinin ADI da olabiliyorsa belirsizdir, ayrı yer tutucu alır", () => {
    const e = new OturumEslemesi("tr");
    const m = "Mehmet Ali ve Ali Can geldi; Ali imzaladı.";
    const sp = [
      { start: 0, end: 10, tur: "KİŞİ" as const },
      { start: 14, end: 21, tur: "KİŞİ" as const },
      { start: m.indexOf("; Ali") + 2, end: m.indexOf("; Ali") + 5, tur: "KİŞİ" as const },
    ];
    expect(e.maskele(m, sp)).toBe("⟦KİŞİ_1⟧ ve ⟦KİŞİ_2⟧ geldi; ⟦KİŞİ_3⟧ imzaladı.");
    expect(e.geriKoy("⟦KİŞİ_3⟧")).toBe("Ali");
  });
});

describe("I6 — parantezsiz/biçim bozuk yer tutucu", () => {
  it.each(["kişi_1", "Kişi_1", "KİŞİ_１", "KİŞİ-1", "KİŞİ1", "KİSİ_1", "KİŞİ_1", "TELEFON_2", "EPOSTA3"])(
    "%s → fail-closed",
    (bozuk) => {
      const e = new OturumEslemesi("tr");
      e.maskele("Ali Veli", [{ start: 0, end: 8, tur: "KİŞİ" }]);
      expect(() => e.geriKoy(`yaz: ${bozuk} burada`)).toThrow(GeriKoymaHatasi);
    },
  );
  it.each(["Kişi 1 ve Kişi 2 olarak anılacak", "Adres 5: Ankara", "TC 10000000146 numaralı", "IBAN no ile"])("olağan metin yanlış alarm vermez: %s", (metin) => {
    const e = new OturumEslemesi("tr");
    expect(e.geriKoy(metin)).toBe(metin);
  });
});

describe("Minor 1 (yükseltildi) — avukat listesi izin listesine yenilmez", () => {
  it("izin listesindeki kurum adının içindeki avukat terimi yine maskelenir", async () => {
    const m = new Maskeleyici({ lang: "tr", algilayici: { async tespit() { return []; } }, avukatListesi: ["Kaya Holding"], izinEk: ["Kaya Holding Vakfı"] });
    expect(await m.maskele("Müvekkil Kaya Holding Vakfı adına")).toBe("Müvekkil ⟦KİŞİ_1⟧ Vakfı adına");
  });
});
