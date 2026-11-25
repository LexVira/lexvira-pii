import { describe, expect, it } from "vitest";
import { AkisGeriKoyucu } from "../akis";
import { OturumEslemesi } from "../esleme";
import { GeriKoymaHatasi } from "../tipler";

const eslemeAliVeli = () => {
  const e = new OturumEslemesi("tr");
  e.maskele("Ali Veli", [{ start: 0, end: 8, tur: "KİŞİ" }]);
  return e;
};

describe("AkisGeriKoyucu", () => {
  it("ikiye bölünmüş yer tutucu tek parça hâlinde gerçek isme döner", () => {
    const a = new AkisGeriKoyucu(eslemeAliVeli());
    expect(a.besle("Sayın ⟦KİŞ") + a.besle("İ_1⟧ geldi") + a.bitir()).toBe("Sayın Ali Veli geldi");
  });

  it("hiçbir ara çıktı yarım yer tutucu içermez", () => {
    const a = new AkisGeriKoyucu(eslemeAliVeli());
    const parcalar = ["x ⟦", "K", "İŞ", "İ_", "1", "⟧ y"].map((p) => a.besle(p));
    for (const p of parcalar) expect(p).not.toMatch(/[⟦⟧]/u);
    expect(parcalar.join("") + a.bitir()).toBe("x Ali Veli y");
  });

  it("art arda iki yer tutucu ve aradaki metin", () => {
    const e = eslemeAliVeli();
    e.maskele("Ayşe Kaya", [{ start: 0, end: 9, tur: "KİŞİ" }]);
    const a = new AkisGeriKoyucu(e);
    const c = ["⟦KİŞİ_1⟧", " ile ⟦KİŞ", "İ_2⟧."].map((p) => a.besle(p)).join("") + a.bitir();
    expect(c).toBe("Ali Veli ile Ayşe Kaya.");
  });

  it("bitişte kapanmamış yer tutucu fail-closed", () => {
    const a = new AkisGeriKoyucu(eslemeAliVeli());
    a.besle("son ⟦KİŞ");
    expect(() => a.bitir()).toThrow(GeriKoymaHatasi);
  });

  it("uzun ⟦ öneki 24 karakteri aşınca bekletilmez", () => {
    const a = new AkisGeriKoyucu(new OturumEslemesi("tr"));
    expect(a.besle("⟦" + "a".repeat(30))).toBe("⟦" + "a".repeat(30));
  });

  it("yer tutucu içermeyen metin gecikmeden geçer", () => {
    const a = new AkisGeriKoyucu(eslemeAliVeli());
    expect(a.besle("merhaba ")).toBe("merhaba ");
    expect(a.besle("dünya")).toBe("dünya");
    expect(a.bitir()).toBe("");
  });
});
