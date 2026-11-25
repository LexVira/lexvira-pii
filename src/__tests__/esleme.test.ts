import { describe, expect, it } from "vitest";
import { OturumEslemesi } from "../esleme";
import { GeriKoymaHatasi, type Span, type Tur } from "../tipler";

const sp = (metin: string, deger: string, tur: Tur = "KİŞİ", bas = 0): Span => {
  const s = metin.indexOf(deger, bas);
  if (s < 0) throw new Error(`yok: ${deger}`);
  return { start: s, end: s + deger.length, tur };
};

describe("OturumEslemesi", () => {
  it("aynı kişi farklı biçimlerde aynı yer tutucuyu alır, ek korunur", () => {
    const e = new OturumEslemesi("tr");
    const m1 = "Davacı Ahmet Yılmaz geldi.";
    const m2 = "AHMET YILMAZ ve Yılmaz'ın vekili";
    expect(e.maskele(m1, [sp(m1, "Ahmet Yılmaz")])).toBe("Davacı ⟦KİŞİ_1⟧ geldi.");
    expect(e.maskele(m2, [sp(m2, "AHMET YILMAZ"), sp(m2, "Yılmaz", "KİŞİ", 10)])).toBe("⟦KİŞİ_1⟧ ve ⟦KİŞİ_1⟧'ın vekili");
  });

  it("aynı soyadlı iki kişi ayrı yer tutucu alır; yalnız soyad belirsizse ayrı yer tutucu", () => {
    const e = new OturumEslemesi("tr");
    const m = "Ahmet Yılmaz ve Ayşe Yılmaz; Yılmaz imzaladı.";
    const out = e.maskele(m, [sp(m, "Ahmet Yılmaz"), sp(m, "Ayşe Yılmaz"), sp(m, "Yılmaz", "KİŞİ", m.indexOf("; "))]);
    expect(out).toBe("⟦KİŞİ_1⟧ ve ⟦KİŞİ_2⟧; ⟦KİŞİ_3⟧ imzaladı.");
    expect(e.geriKoy(out)).toBe(m);
  });

  it("birebir dönüşüm (kişi + kalıp)", () => {
    const e = new OturumEslemesi("tr");
    const m = "Tanık Ayşe Kaya, TC 10000000146, tel 05321234567.";
    const mask = e.maskele(m, [sp(m, "Ayşe Kaya"), sp(m, "10000000146", "TC"), sp(m, "05321234567", "TELEFON")]);
    expect(mask).toBe("Tanık ⟦KİŞİ_1⟧, TC ⟦TC_1⟧, tel ⟦TELEFON_1⟧.");
    expect(e.geriKoy(mask)).toBe(m);
  });

  it.each(["⟦KİŞİ_1", "[KİŞİ_1]", "⟦KISI_1⟧", "KİŞİ_1⟧", "⟦KİŞİ_99⟧", "⟦TC_1⟧"])("bozuk/bilinmeyen yer tutucu %s → fail-closed", (bozuk) => {
    const e = new OturumEslemesi("tr");
    e.maskele("Ali Veli", [{ start: 0, end: 8, tur: "KİŞİ" }]);
    expect(() => e.geriKoy(`yaz: ${bozuk} burada`)).toThrow(GeriKoymaHatasi);
  });

  it("geçerli ve bozuk birlikteyse hata bozuk olanı adlandırır", () => {
    const e = new OturumEslemesi("tr");
    e.maskele("Ali Veli", [{ start: 0, end: 8, tur: "KİŞİ" }]);
    try {
      e.geriKoy("⟦KİŞİ_1⟧ ve ⟦KİŞİ_7⟧");
      throw new Error("hata bekleniyordu");
    } catch (h) {
      expect((h as GeriKoymaHatasi).bozuk).toEqual(["⟦KİŞİ_7⟧"]);
    }
  });

  it("gevşek geri koyma bilinmeyeni olduğu gibi bırakır", () => {
    const e = new OturumEslemesi("tr");
    e.maskele("Ali Veli", [{ start: 0, end: 8, tur: "KİŞİ" }]);
    expect(e.geriKoyGevsek("⟦KİŞİ_1⟧ ve ⟦KİŞİ_9⟧")).toBe("Ali Veli ve ⟦KİŞİ_9⟧");
  });

  it("yol maskeleme ayırıcıları korur ve geri döner", () => {
    const e = new OturumEslemesi("tr");
    const yol = "/Users/av/Davalar/Ahmet Yılmaz - Boşanma/dilekce.docx";
    const y = e.yolMaskele(yol, (p) => (p.startsWith("Ahmet Yılmaz") ? [{ start: 0, end: 12, tur: "KİŞİ" }] : []));
    expect(y).toBe("/Users/av/Davalar/⟦KİŞİ_1⟧ - Boşanma/dilekce.docx");
    expect(e.geriKoy(y)).toBe(yol);
    expect(e.yolMaskele("C:\\Davalar\\Ahmet Yılmaz\\a.txt", (p) => (p === "Ahmet Yılmaz" ? [{ start: 0, end: 12, tur: "KİŞİ" }] : []))).toBe("C:\\Davalar\\⟦KİŞİ_1⟧\\a.txt");
  });

  it("serileştirme oturumu korur", () => {
    const e = new OturumEslemesi("tr");
    e.maskele("Ali Veli", [{ start: 0, end: 8, tur: "KİŞİ" }]);
    const k = OturumEslemesi.coz(e.serilestir());
    expect(k.geriKoy("⟦KİŞİ_1⟧")).toBe("Ali Veli");
    expect(k.maskele("ALİ VELİ", [{ start: 0, end: 8, tur: "KİŞİ" }])).toBe("⟦KİŞİ_1⟧");
    expect(k.maskele("Ayşe Kaya", [{ start: 0, end: 9, tur: "KİŞİ" }])).toBe("⟦KİŞİ_2⟧");
  });

  it("kişi kelimeleri yayılım için dışa açılır", () => {
    const e = new OturumEslemesi("tr");
    e.maskele("Ahmet Yılmaz", [{ start: 0, end: 12, tur: "KİŞİ" }]);
    expect(e.kisiKelimeleri()).toEqual(expect.arrayContaining(["Ahmet", "Yılmaz"]));
  });

  it("örtüşen span'ler reddedilir (çağıran birleştirmeli)", () => {
    const e = new OturumEslemesi("tr");
    expect(() => e.maskele("Ali Veli", [{ start: 0, end: 5, tur: "KİŞİ" }, { start: 3, end: 8, tur: "KİŞİ" }])).toThrow();
  });
});
