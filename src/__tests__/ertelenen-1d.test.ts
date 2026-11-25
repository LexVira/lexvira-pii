import { describe, expect, it } from "vitest";
import { OturumEslemesi } from "../esleme";
import { metinMi } from "../maskeleyici";
import { MaskelemeHatasi } from "../tipler";

describe("metinMi — U+FFFD (1A ertelenen)", () => {
  it("ikili dosyanın UTF-8 çözümünden gelen yoğun U+FFFD metin sayılmaz", () => {
    expect(metinMi("PDF" + "�".repeat(5) + "x".repeat(45))).toBe(false);
  });
  it("uzun metinde tek tük U+FFFD metin sayılır", () => {
    expect(metinMi("a".repeat(500) + "�")).toBe(true);
  });
});

describe("OturumEslemesi.coz şema doğrulaması (1A ertelenen)", () => {
  const gecerli = () => {
    const e = new OturumEslemesi("tr");
    e.maskele("Ahmet Yılmaz geldi", [{ start: 0, end: 12, tur: "KİŞİ" }]);
    return JSON.parse(e.serilestir()) as Record<string, unknown>;
  };

  it("geçerli döküm yüklenir", () => {
    expect(() => OturumEslemesi.coz(JSON.stringify(gecerli()))).not.toThrow();
  });

  it.each([
    ["JSON değil", "{bozuk"],
    ["dizi", "[]"],
    ["lang yok", JSON.stringify({ ...gecerli(), lang: 5 })],
    ["yazimlar dizi değil", JSON.stringify({ ...gecerli(), yazimlar: {} })],
    ["yer tutucu biçimi bozuk", JSON.stringify({ ...gecerli(), yazimlar: [["KİŞİ_1", "Ahmet"]] })],
    ["sayaç sayı değil", JSON.stringify({ ...gecerli(), sayac: { KİŞİ: "1" } })],
    ["sayaç mevcut yer tutucunun gerisinde", JSON.stringify({ ...gecerli(), sayac: { KİŞİ: 0 } })],
    ["anahtar yazımı olmayan yer tutucuya bakıyor", JSON.stringify({ ...gecerli(), anahtarlar: [["KİŞİ:x", "⟦KİŞİ_9⟧"]] })],
  ])("%s → MaskelemeHatasi", (_ad, json) => {
    expect(() => OturumEslemesi.coz(json)).toThrow(MaskelemeHatasi);
  });
});

describe("Maskeleyici.avukatListesiniAyarla (1E-A inceleme I5)", () => {
  it("çalışan maskeleyicide 'her zaman maskele' listesi hemen etkili olur; girdi kopyalanır", async () => {
    const { Maskeleyici } = await import("../maskeleyici");
    const m = new Maskeleyici({ lang: "tr", algilayici: { tespit: async () => [] } });
    expect(await m.maskele("Taraf Zeynep Ak geldi.")).toBe("Taraf Zeynep Ak geldi.");
    const liste = ["Zeynep Ak"];
    m.avukatListesiniAyarla(liste);
    liste.push("Taraf");
    expect(await m.maskele("Taraf Zeynep Ak geldi.")).toMatch(/^Taraf ⟦KİŞİ_\d+⟧ geldi\.$/u);
  });
});
