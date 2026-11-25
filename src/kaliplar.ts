import type { Span, Tur } from "./tipler";

/**
 * Deterministik kimlik kalıpları — `services/ai-service/app/guardrails/pii_filter.py`
 * `PIIFilter.PATTERNS` ile aynı semantik; parite `test-vektorleri/kaliplar.json` ile denetlenir
 * (2026-10-03'ten beri tam: IBAN telefondan önce, e-posta Unicode — ai-service d1907286c).
 * E-posta ve telefon kalıpları uzun boşluk/nokta dizilerinde DOĞRUSAL kalacak biçimde yazıldı
 * (`kaliplar-hiz.test.ts`, `inceleme-duzeltmeleri.test.ts`).
 *
 * Python `\b` (re.UNICODE) kelime sınırı burada `(?<![\p{L}\p{N}_])` / `(?![\p{L}\p{N}_])` ile taklit edilir.
 */
const SOL = String.raw`(?<![\p{L}\p{N}_])`;
const SAG = String.raw`(?![\p{L}\p{N}_])`;

const KALIPLAR: [Tur, RegExp][] = [
  ["TC", new RegExp(String.raw`${SOL}([1-9]\d{10})${SAG}`, "gu")],
  ["IBAN", new RegExp(String.raw`${SOL}TR\s*\d{2}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{2}${SAG}`, "gu")],
  // Python kalıbıyla eşdeğer; iç içe `\s*[(\s]*` belirsiz tekrarları kaldırıldı (40 bin boşlukta 10 sn → ms, I2).
  ["TELEFON", /(?:\+90|0)[(\s]*[1-9]\d{2}[)\s]*\d{3}\s*\d{2}\s*\d{2}/gu],
  // Yerel kısım yalnız bir karakter dizisinin BAŞINDA başlayabilir: `\b` benzeri sınırla her konumdan
  // yeniden denenen eşleşme uzun noktalı dizilerde karesel geri izliyordu (40 bin karakterde 54 sn).
  ["EPOSTA", new RegExp(String.raw`(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}${SAG}`, "gu")],
  ["PLAKA", new RegExp(String.raw`${SOL}(?:0[1-9]|[1-7]\d|8[01])\s?[A-ZÇĞİÖŞÜ]{1,3}\s?\d{2,5}${SAG}`, "gu")],
];

/** TC kimlik numarası sağlama toplamı (Python `_validate_tc` ile aynı). */
export function tcGecerli(tc: string): boolean {
  if (!/^[1-9]\d{10}$/.test(tc)) return false;
  const d = [...tc].map(Number);
  const tek = d[0] + d[2] + d[4] + d[6] + d[8];
  const cift = d[1] + d[3] + d[5] + d[7];
  if ((((tek * 7 - cift) % 10) + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

/** Metindeki kalıp eşleşmeleri; örtüşmeyen, başlangıca göre sıralı. Önce gelen kalıp kazanır. */
export function kalipSpanlari(metin: string): Span[] {
  const sonuc: Span[] = [];
  const dolu = (s: number, e: number) => sonuc.some((x) => s < x.end && e > x.start);
  for (const [tur, desen] of KALIPLAR) {
    for (const m of metin.matchAll(desen)) {
      const s = m.index ?? 0;
      const e = s + m[0].length;
      if (tur === "TC" && !tcGecerli(m[1])) continue;
      if (!dolu(s, e)) sonuc.push({ start: s, end: e, tur });
    }
  }
  return sonuc.sort((a, b) => a.start - b.start);
}
