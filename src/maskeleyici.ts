import { OturumEslemesi } from "./esleme";
import { kalipSpanlari } from "./kaliplar";
import { edatBirlestir, normalize, yay } from "./kural";
import { avukatListesiSpanlari, izinListesiyleSuz } from "./listeler";
import { AlgilayiciHatasi, MaskelemeHatasi, MetinDegilHatasi, type Algilayici, type Span, type Tur } from "./tipler";

/** `ner_names._EXCLUDED_LABELS` ile aynı: bunlar maskelenmez. */
const HARIC = new Set(["CITY", "COUNTRY", "STATE", "COMPANY_NAME", "DATE", "TIME", "AGE", "GENDER", "LICENSE_PLATE"]);
const NER_TUR: Record<string, Tur> = {
  GIVEN_NAME: "KİŞİ",
  SURNAME: "KİŞİ",
  BUILDING_NUMBER: "ADRES",
  SECONDARY_ADDRESS: "ADRES",
  STREET_ADDRESS: "ADRES",
  STREET_NAME: "ADRES",
  ZIP_CODE: "ADRES",
  EMAIL: "EPOSTA",
  PHONE: "TELEFON",
  FAX_NUMBER: "TELEFON",
  IBAN: "IBAN",
  ACCOUNT_NUMBER: "KİMLİK",
  CREDIT_DEBIT_CARD: "KİMLİK",
  CUSTOMER_ID: "KİMLİK",
  CVV: "KİMLİK",
  DRIVERS_LICENSE: "KİMLİK",
  EMPLOYEE_ID: "KİMLİK",
  GOVERNMENT_ID: "KİMLİK",
  MEDICAL_RECORD_NUMBER: "KİMLİK",
  PASSPORT: "KİMLİK",
  PIN: "KİMLİK",
  ROUTING_NUMBER: "KİMLİK",
  SSN: "KİMLİK",
  SWIFT_BIC: "KİMLİK",
  TAX_ID: "KİMLİK",
};
/** Örtüşmede kazanan tür: deterministik kalıplar en güvenilir olandır. */
const ONCELIK: Tur[] = ["TC", "IBAN", "TELEFON", "EPOSTA", "PLAKA", "KİŞİ", "KİMLİK", "ADRES", "PII"];
const PARCA = 30_000;
const ORTUSME = 200;

/** NUL yok ve (satır sonu/sekme dışı) kontrol karakteri + U+FFFD oranı < %1 ise metindir. */
export function metinMi(metin: string): boolean {
  if (metin.includes("\u0000")) return false;
  let kontrol = 0;
  for (const c of metin) {
    const k = c.codePointAt(0)!;
    // U+FFFD: ikili içeriğin UTF-8 olarak çözülmesinden kalan yer değiştirme karakteri (1A ertelenen).
    if ((k < 0x20 && c !== "\n" && c !== "\r" && c !== "\t") || (k >= 0x7f && k < 0xa0) || k === 0xfffd) kontrol++;
  }
  return metin.length === 0 || kontrol / metin.length < 0.01;
}

function parcalar(metin: string): [number, string][] {
  if (metin.length <= PARCA) return [[0, metin]];
  const sonuc: [number, string][] = [];
  let bas = 0;
  for (;;) {
    let son = Math.min(bas + PARCA, metin.length);
    if (son < metin.length) {
      const nl = metin.lastIndexOf("\n", son);
      if (nl > bas + ORTUSME) son = nl + 1;
    }
    sonuc.push([bas, metin.slice(bas, son)]);
    if (son >= metin.length) return sonuc;
    bas = son - ORTUSME;
  }
}

/** Örtüşen span'leri birleştirir (öncelikli tür kazanır); boşlukla ayrılan bitişik KİŞİ'leri tek kişi yapar. */
function birlestir(metin: string, spanlar: Span[]): Span[] {
  const sirali = [...spanlar].sort((a, b) => a.start - b.start || b.end - a.end);
  const sonuc: Span[] = [];
  for (const s of sirali) {
    const son = sonuc[sonuc.length - 1];
    if (son && s.start < son.end) {
      son.end = Math.max(son.end, s.end);
      if (ONCELIK.indexOf(s.tur) < ONCELIK.indexOf(son.tur)) son.tur = s.tur;
    } else if (son && son.tur === "KİŞİ" && s.tur === "KİŞİ" && /^[ \t]+$/u.test(metin.slice(son.end, s.start))) {
      son.end = s.end;
    } else sonuc.push({ ...s });
  }
  return sonuc;
}

export interface MaskeleyiciSecenek {
  algilayici: Algilayici;
  lang: string;
  avukatListesi?: string[];
  izinEk?: string[];
  esleme?: OturumEslemesi;
}

/**
 * Cihaz içi maskeleme boru hattı (spec §6.2): kalıplar → NER (+V1) → avukat listesi → V2 yayılım
 * → izin listesi → birleştirme → oturum eşlemesi. Her hata fail-closed'dır: özgün metin ASLA dönmez.
 */
export class Maskeleyici {
  private readonly o: MaskeleyiciSecenek;
  private readonly _esleme: OturumEslemesi;
  private _sonSpanlar: Span[] = [];

  constructor(o: MaskeleyiciSecenek) {
    this.o = o;
    this._esleme = o.esleme ?? new OturumEslemesi(o.lang);
  }

  get esleme(): OturumEslemesi {
    return this._esleme;
  }

  /** Avukatın "her zaman maskele" listesini çalışan maskeleyicide günceller; sonraki her çağrıda etkilidir. */
  avukatListesiniAyarla(liste: readonly string[]): void {
    this.o.avukatListesi = [...liste];
  }

  /** Son `maskele` çağrısının özgün metin üzerindeki birleşik span'leri (değerlendirme için). */
  get sonSpanlar(): Span[] {
    return this._sonSpanlar.map((s) => ({ ...s }));
  }

  private async nerSpanlari(metin: string): Promise<Span[]> {
    const sonuc: Span[] = [];
    const ekle = (ham: { etiket: string; start: number; end: number }[], kayma: number, uzunluk: number) => {
      for (const h of ham) {
        // Algılayıcı dışa açık bir arayüzdür: bozuk span (ters, sınır dışı, NaN, kesirli) metni çoğaltıp
        // sızdırabilirdi; güvenlik sınırı girdiyi kendisi doğrular (I1).
        if (!Number.isInteger(h.start) || !Number.isInteger(h.end) || h.start < 0 || h.end > uzunluk || h.start >= h.end) {
          throw new AlgilayiciHatasi(`algılayıcıdan geçersiz span [${h.start}, ${h.end})`);
        }
        if (HARIC.has(h.etiket)) continue;
        sonuc.push({ start: h.start + kayma, end: h.end + kayma, tur: NER_TUR[h.etiket] ?? "PII" });
      }
    };
    try {
      for (const [kayma, parca] of parcalar(metin)) {
        ekle(await this.o.algilayici.tespit(parca), kayma, parca.length);
        const n = normalize(parca, this.o.lang);
        if (n !== parca) ekle(await this.o.algilayici.tespit(n), kayma, n.length);
      }
    } catch (h) {
      if (h instanceof MaskelemeHatasi) throw h;
      throw new AlgilayiciHatasi((h as Error).message);
    }
    return sonuc;
  }

  private async spanlar(metin: string): Promise<Span[]> {
    if (!metinMi(metin)) throw new MetinDegilHatasi("metin olmayan içerik");
    const lang = this.o.lang;
    const ham = [...kalipSpanlari(metin), ...(await this.nerSpanlari(metin))];
    // Avukatın "her zaman maskele" listesi izin listesine yenilmez: süzgeçten SONRA eklenir (inceleme Minor 1).
    const avukat = avukatListesiSpanlari(metin, this.o.avukatListesi ?? [], lang);
    const kisi = birlestir(metin, [...ham.filter((s) => s.tur === "KİŞİ"), ...avukat]);
    const yayilan = yay(metin, kisi, lang, this._esleme.kisiKelimeleri());
    // Edatlı soyad (nl): yayılım dahil bütün kişi span'leri önlerindeki edat dizisini alır.
    const edatli = edatBirlestir(metin, birlestir(metin, [...kisi, ...yayilan.map((s) => ({ ...s, tur: "KİŞİ" as const }))]), lang).map((s) => ({
      ...s,
      tur: "KİŞİ" as const,
    }));
    const suzulmus = izinListesiyleSuz(metin, [...ham, ...edatli], lang, this.o.izinEk ?? []);
    return birlestir(metin, [...suzulmus, ...avukat]);
  }

  async maskele(metin: string): Promise<string> {
    const sp = await this.spanlar(metin);
    this._sonSpanlar = sp;
    return this._esleme.maskele(metin, sp);
  }

  /** Yolu ayırıcıları koruyarak parça parça maskeler; aynı oturum eşlemesini kullanır. */
  async maskeleYol(yol: string): Promise<string> {
    const parcalari = yol.split(/([\\/])/u);
    const cikti: string[] = [];
    for (const p of parcalari) cikti.push(p === "/" || p === "\\" || p === "" ? p : await this.maskele(p));
    return cikti.join("");
  }
}
