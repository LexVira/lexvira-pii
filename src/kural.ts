/**
 * Ön deneme V1/V2 kuralları (`tools/lexvira-desktop-spike/olc/kural.py`, son inceleme sonrası sürüm).
 * Alt proje 0 raporu: V2 ile tutarlı derlemde 11/12 dil ≥ %95.
 */

const KELIME_DUZ = /[\p{L}\p{M}]+/gu;
const KELIME_KESMELI = /[\p{L}\p{M}]+(?:['ʻ’‘][\p{L}\p{M}]+)*/gu;

/**
 * Harf + birleşik işaret dizisi. Özbekçede harfler ARASINDAKI kesme işareti kelimenin parçasıdır
 * ("G'ulomov", "O‘zbekiston") — aksi hâlde adlar bölünüp yayılmıyordu (I4). Türkçe/Azericede kesme
 * işareti eki ayırır ("Koç'den"), orada kelime sınırıdır.
 */
export function kelimeDeseni(lang: string): RegExp {
  return lang === "uz" ? KELIME_KESMELI : KELIME_DUZ;
}

/** Dile duyarlı küçük harf: tr/az'da `I→ı`, `İ→i` elle çevrilir (ICU sürümüne bağımlılık yok). */
export function kucult(k: string, lang: string): string {
  if (lang === "tr" || lang === "az") k = k.replace(/I/g, "ı").replace(/İ/g, "i");
  return k.toLowerCase();
}

const KATLAMA: Record<string, string> = { ı: "i", ş: "s", ğ: "g", ç: "c", ö: "o", ü: "u", "ʻ": "'", "’": "'", "‘": "'" };

/**
 * Karşılaştırma anahtarı: dile duyarlı küçük harf + (tr/az) ASCII katlaması + kesme işareti birliği.
 * "İsmail" = "ISMAIL" = "Ismail", "Şahin" = "SAHIN" (ASCII klavyeyle yazılmış Türkçe ad). Uzunluk korunur;
 * ofsetler daima özgün metinden alınır (I3).
 */
export function katla(k: string, lang: string): string {
  const alt = kucult(k, lang);
  let cikti = "";
  for (const c of alt) cikti += (lang === "tr" || lang === "az" ? KATLAMA[c] : c === "ʻ" || c === "’" || c === "‘" ? "'" : undefined) ?? c;
  return cikti;
}

const buyukMu = (k: string) => k === k.toUpperCase() && k !== k.toLowerCase();
const buyukBaslarMi = (k: string) => k.length > 0 && buyukMu(k[0]);

/**
 * V1: tamamı büyük harf (≥2 harf) kelimeleri "Başharf küçük" yazar; UZUNLUK korunur
 * (değişecekse kelime aynen kalır) ki model çıktısının ofsetleri özgün metne uysun.
 */
export function normalize(metin: string, lang: string): string {
  return metin.replace(kelimeDeseni(lang), (k) => {
    if (k.length < 2 || !buyukMu(k)) return k;
    const yeni = k[0] + kucult(k.slice(1), lang);
    return yeni.length === k.length ? yeni : k;
  });
}

/**
 * V2: yakalanan kişi adlarının BÜYÜK harfle başlayan (≥3 harf) kelimelerini, metinde yine BÜYÜK
 * harfle başlayan geçişlerinde işaretler. Küçük harfli edatlar ("van", "der") ve isimle aynı
 * yazılan sıradan kelimeler ("kaya parçası") yayılmaz.
 * `ekKelimeler`: oturumda daha önce yakalanmış kişilerin kelimeleri (belgeler arası yayılım).
 */
/** Ekini kesme işaretsiz, bitişik yazan diller (Türkçe özel adda kesme işareti kullanır, burada yok). */
const BITISIK_EKLI = new Set(["uz", "kk", "az"]);
const EK_AZAMI = 5;
const KOK_ASGARI = 4;

export function yay(
  metin: string,
  kisi: { start: number; end: number }[],
  lang: string,
  ekKelimeler: string[] = [],
): { start: number; end: number }[] {
  const KELIME = kelimeDeseni(lang);
  const kaynak = [...kisi.flatMap((s) => metin.slice(s.start, s.end).match(KELIME) ?? []), ...ekKelimeler];
  const kelimeler = new Set(kaynak.filter((w) => w.length >= 3 && buyukBaslarMi(w)).map((w) => katla(w, lang)));
  if (kelimeler.size === 0) return [];
  const bitisik = BITISIK_EKLI.has(lang) ? [...kelimeler].filter((k) => k.length >= KOK_ASGARI) : [];
  const sonuc: { start: number; end: number }[] = [];
  for (const m of metin.matchAll(KELIME)) {
    const w = m[0];
    if (!buyukBaslarMi(w)) continue;
    const k = katla(w, lang);
    // Bitişik ek: "Raxmonovdan", "ISMOILOVdan", "BEKMURODOVга" — kök bilinen bir ad, ek KÜÇÜK harfli ve kısa.
    if (kelimeler.has(k)) {
      sonuc.push({ start: m.index!, end: m.index! + w.length });
      continue;
    }
    // Span yalnız KÖKÜ kapsar, ek açıkta kalır ("⟦KİŞİ_1⟧dan"): eşleme tablosu kişiyi aynı tanısın.
    const kok = bitisik.find((kk) => {
      if (!k.startsWith(kk)) return false;
      const ek = w.slice(kk.length);
      return ek.length >= 1 && ek.length <= EK_AZAMI && ek === ek.toLowerCase() && ek !== ek.toUpperCase();
    });
    if (kok) sonuc.push({ start: m.index!, end: m.index! + kok.length });
  }
  return sonuc;
}

/** Soyad önüne gelen edatlar (yalnız gözlenen dil: nl). Başka diller geliştirme kümesi gerektirirse eklenir. */
const EDATLAR: Record<string, string[]> = { nl: ["van", "de", "der", "den", "het", "ter", "ten", "te", "in", "'t"] };

/**
 * Edatlı soyadlar (K13): bir kişi span'inin HEMEN önündeki edat dizisi span'e katılır, iki durumda:
 * - dizi BÜYÜK harfle başlıyorsa ("tussen De Groot", "met VAN DER LINDEN");
 * - küçük harfliyse yalnız hemen önünde başka bir kişi span'i varsa ("Jan van der Meer").
 * Aksi hâlde edat bir ilgeçtir ("Gemachtigde van Anna") ve katılmaz. Kişi span'i yoksa edat tek
 * başına kişi sayılmaz ("de uitspraak van de rechtbank").
 */
export function edatBirlestir(metin: string, kisi: { start: number; end: number }[], lang: string): { start: number; end: number }[] {
  const edatlar = EDATLAR[lang];
  if (!edatlar) return kisi;
  const desen = new RegExp(`(?:^|(?<=[^\\p{L}\\p{M}']))((?:(?:${edatlar.join("|")})\\s+)+)$`, "iu");
  return kisi.map((s) => {
    const pencere = metin.slice(Math.max(0, s.start - 40), s.start);
    const m = desen.exec(pencere);
    if (!m) return s;
    const bas = s.start - m[1].length;
    const buyukBaslar = buyukBaslarMi(m[1]);
    const oncesindeKisi = kisi.some((o) => o !== s && o.end <= bas && /^[ \t]+$/u.test(metin.slice(o.end, bas)));
    return buyukBaslar || oncesindeKisi ? { start: bas, end: s.end } : s;
  });
}
