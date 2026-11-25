import { describe, expect, it } from "vitest";
import { Maskeleyici, metinMi } from "../maskeleyici";
import type { Algilayici } from "../tipler";

/** Verilen metin için belirlenen değerleri, metinde geçiyorsa span olarak döndüren sahte algılayıcı. */
const sahte = (tablo: Record<string, [string, string][]>): Algilayici => ({
  async tespit(m) {
    const s: { etiket: string; start: number; end: number }[] = [];
    for (const [deger, etiket] of tablo[m] ?? []) {
      const i = m.indexOf(deger);
      if (i >= 0) s.push({ etiket, start: i, end: i + deger.length });
    }
    return s;
  },
});

describe("metinMi", () => {
  it("düz metin ve satır sonları kabul edilir", () => expect(metinMi("satır 1\nsatır 2\tşerit\r\n")).toBe(true));
  it("NUL içeren içerik reddedilir", () => expect(metinMi("abc\u0000def")).toBe(false));
  it("yüksek oranda kontrol karakteri reddedilir", () => expect(metinMi("PK\u0003\u0004" + "x".repeat(50))).toBe(false));
});

describe("Maskeleyici", () => {
  it("algılayıcı hata verirse fail-closed, özgün metin dönmez", async () => {
    const m = new Maskeleyici({ lang: "tr", algilayici: { async tespit() { throw new Error("onnx"); } } });
    await expect(m.maskele("Ahmet Yılmaz")).rejects.toMatchObject({ kod: "mask_inference_failed" });
  });

  it("metin olmayan içerik NER'e girmeden reddedilir", async () => {
    let cagrildi = false;
    const m = new Maskeleyici({ lang: "tr", algilayici: { async tespit() { cagrildi = true; return []; } } });
    await expect(m.maskele("PK\u0003\u0004\u0000\u0000binary")).rejects.toMatchObject({ kod: "mask_unsupported_content" });
    expect(cagrildi).toBe(false);
  });

  it("ad ve soyad span'leri tek kişi olur", async () => {
    const m = new Maskeleyici({ lang: "tr", algilayici: sahte({ "Davacı Ahmet Yılmaz geldi": [["Ahmet", "GIVEN_NAME"], ["Yılmaz", "SURNAME"]] }) });
    expect(await m.maskele("Davacı Ahmet Yılmaz geldi")).toBe("Davacı ⟦KİŞİ_1⟧ geldi");
  });

  it("V1: büyük harfli isim normalize edilmiş ikinci geçişte yakalanır", async () => {
    const m = new Maskeleyici({ lang: "tr", algilayici: sahte({ "davalı Elif Koç'den": [["Elif", "GIVEN_NAME"], ["Koç", "SURNAME"]] }) });
    expect(await m.maskele("davalı ELİF KOÇ'den")).toBe("davalı ⟦KİŞİ_1⟧'den");
  });

  it("V2: oturumda önceden yakalanan soyad sonraki metinde yayılır", async () => {
    const m = new Maskeleyici({ lang: "tr", algilayici: sahte({ "Tanık Ali Kaya": [["Ali", "GIVEN_NAME"], ["Kaya", "SURNAME"]] }) });
    await m.maskele("Tanık Ali Kaya");
    expect(await m.maskele("KAYA beyan etti; kaya düştü.")).toBe("⟦KİŞİ_1⟧ beyan etti; kaya düştü.");
  });

  it("hariç etiket (CITY) maskelenmez, kalıp maskelenir", async () => {
    const m = new Maskeleyici({ lang: "tr", algilayici: sahte({ "İstanbul TC 10000000146": [["İstanbul", "CITY"]] }) });
    expect(await m.maskele("İstanbul TC 10000000146")).toBe("İstanbul TC ⟦TC_1⟧");
  });

  it("bilinmeyen NER etiketi PII olarak maskelenir (güvenli taraf)", async () => {
    const m = new Maskeleyici({ lang: "tr", algilayici: sahte({ "kod X9Z": [["X9Z", "YENI_ETIKET"]] }) });
    expect(await m.maskele("kod X9Z")).toBe("kod ⟦PII_1⟧");
  });

  it("avukat listesi algılayıcının kaçırdığını maskeler", async () => {
    const m = new Maskeleyici({ lang: "tr", algilayici: sahte({}), avukatListesi: ["Deneme Holding"] });
    expect(await m.maskele("DENEME HOLDİNG ile görüşüldü")).toBe("⟦KİŞİ_1⟧ ile görüşüldü");
  });

  it("izin listesindeki kurum içindeki kişi span'i maskelenmez", async () => {
    const m = new Maskeleyici({ lang: "nl", algilayici: sahte({ "de Raad van State": [["State", "SURNAME"]] }) });
    expect(await m.maskele("de Raad van State")).toBe("de Raad van State");
  });

  it("örtüşen kalıp ve NER span'i tek yer tutucu olur, kalıp türü öncelikli", async () => {
    const m = new Maskeleyici({ lang: "tr", algilayici: sahte({ "TC 10000000146": [["10000000146", "GOVERNMENT_ID"]] }) });
    expect(await m.maskele("TC 10000000146")).toBe("TC ⟦TC_1⟧");
  });

  it("uzun metin ≤ 30.000 karakterlik örtüşen parçalarla işlenir; sınırdaki isim kaçmaz", async () => {
    const boylar: number[] = [];
    const algilayici: Algilayici = {
      async tespit(t) {
        boylar.push(t.length);
        const i = t.indexOf("Ahmet Yılmaz");
        return i >= 0 ? [{ etiket: "GIVEN_NAME", start: i, end: i + 5 }, { etiket: "SURNAME", start: i + 6, end: i + 12 }] : [];
      },
    };
    const m = new Maskeleyici({ lang: "tr", algilayici });
    const metin = "a".repeat(29_995) + " Ahmet Yılmaz " + "b".repeat(20_000);
    const sonuc = await m.maskele(metin);
    expect(Math.max(...boylar)).toBeLessThanOrEqual(30_000);
    expect(sonuc).toContain("⟦KİŞİ_1⟧");
    expect(sonuc).not.toContain("Ahmet");
  });

  it("nl edatlı soyad ad ile tek kişi olur; sonraki büyük harfli geçiş de yakalanır", async () => {
    const m = new Maskeleyici({ lang: "nl", algilayici: sahte({ "namens Anna Van der Linden.": [["Anna", "GIVEN_NAME"], ["Linden", "SURNAME"]] }) });
    expect(await m.maskele("namens Anna Van der Linden.")).toBe("namens ⟦KİŞİ_1⟧.");
    expect(await m.maskele("geschil met VAN DER LINDEN.")).toBe("geschil met ⟦KİŞİ_2⟧.");
  });

  it("uz bitişik ekli soyad oturumda yakalanır", async () => {
    const m = new Maskeleyici({ lang: "uz", algilayici: sahte({ "Xolmatov Raxmonov": [["Raxmonov", "SURNAME"]] }) });
    await m.maskele("Xolmatov Raxmonov");
    expect(await m.maskele("Raxmonovdan undirilsin")).toBe("⟦KİŞİ_1⟧dan undirilsin");
  });

  it("yol maskeleme oturum eşlemesini paylaşır", async () => {
    const m = new Maskeleyici({ lang: "tr", algilayici: sahte({ "Ahmet Yılmaz - Boşanma": [["Ahmet", "GIVEN_NAME"], ["Yılmaz", "SURNAME"]] }) });
    expect(await m.maskeleYol("/Davalar/Ahmet Yılmaz - Boşanma/dilekce.docx")).toBe("/Davalar/⟦KİŞİ_1⟧ - Boşanma/dilekce.docx");
  });

  it("sonSpanlar son maskelemenin özgün metin span'lerini verir", async () => {
    const m = new Maskeleyici({ lang: "tr", algilayici: sahte({ "Ali Kaya, TC 10000000146": [["Ali", "GIVEN_NAME"], ["Kaya", "SURNAME"]] }) });
    await m.maskele("Ali Kaya, TC 10000000146");
    expect(m.sonSpanlar).toEqual([{ start: 0, end: 8, tur: "KİŞİ" }, { start: 13, end: 24, tur: "TC" }]);
  });
});
