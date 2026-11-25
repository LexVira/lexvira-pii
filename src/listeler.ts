import izinVerisi from "../veri/izin-listesi.json" with { type: "json" };
import { katla } from "./kural";
import type { Span } from "./tipler";

const IZIN = izinVerisi as unknown as Record<string, string[]>;

/** Ofsetleri korumak için karakter karakter katla (küçük harf + ASCII katlaması); uzunluğu değişen karakter aynen kalır. */
function esUzunlukKucult(metin: string, lang: string): string {
  let cikti = "";
  for (const c of metin) {
    const k = katla(c, lang);
    cikti += k.length === c.length ? k : c;
  }
  return cikti;
}

const kacis = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

function terimGecisleri(metin: string, terimler: string[], lang: string): { start: number; end: number }[] {
  const alt = esUzunlukKucult(metin, lang);
  const sonuc: { start: number; end: number }[] = [];
  for (const t of terimler) {
    const govde = kacis(esUzunlukKucult(t.trim(), lang)).replace(/\s+/gu, "\\s+");
    if (!govde) continue;
    const desen = new RegExp(`(?<![\\p{L}\\p{N}_])${govde}(?![\\p{L}\\p{N}_])`, "gu");
    for (const m of alt.matchAll(desen)) sonuc.push({ start: m.index!, end: m.index! + m[0].length });
  }
  return sonuc.sort((a, b) => a.start - b.start);
}

/** Avukatın "her zaman maskele" listesi: büyük/küçük harf duyarsız, kelime sınırlı, tür KİŞİ. */
export function avukatListesiSpanlari(metin: string, terimler: string[], lang: string): Span[] {
  return terimGecisleri(metin, terimler, lang).map((g) => ({ ...g, tur: "KİŞİ" as const }));
}

/** Deterministik kalıp türleri: kurum adı içinde bile korunur (ör. kurum adına yazılmış bir IBAN). */
const KALIP_TURLERI = new Set<Span["tur"]>(["TC", "IBAN", "TELEFON", "EPOSTA", "PLAKA"]);

/**
 * Kamuya açık izin listesi: bir kurum/mahkeme adı geçişinin TAMAMEN içinde kalan NER kaynaklı
 * span'leri (KİŞİ, PII, ADRES, KİMLİK) atar. Deterministik kalıp span'lerine dokunmaz.
 * (1A doğrulamasında kk'de NER bir kurum adındaki "құқықтары" kelimesini ADRES saymıştı.)
 */
export function izinListesiyleSuz(metin: string, spanlar: Span[], lang: string, ek: string[] = []): Span[] {
  const gecisler = terimGecisleri(metin, [...(IZIN[lang] ?? []), ...ek], lang);
  if (gecisler.length === 0) return spanlar;
  return spanlar.filter(
    (s) => KALIP_TURLERI.has(s.tur) || !gecisler.some((g) => g.start <= s.start && s.end <= g.end),
  );
}
