import { katla, kelimeDeseni } from "./kural";
import { GeriKoymaHatasi, MaskelemeHatasi, TURLER, type Span, type Tur } from "./tipler";

const YER_TUTUCU = new RegExp(`⟦(${TURLER.join("|")})_(\\d+)⟧`, "gu");
/**
 * Modelin bozabileceği yer tutucu kalıntıları (NFKC'ye normalize edilmiş metinde, büyük/küçük harf duyarsız):
 * parantez (⟦⟧〚〛), "kişi_1", "KİŞİ-1", "KİŞİ1", tam genişlik rakam, "KİSİ_1", ASCII'leşmiş adlar.
 * Boşluklu biçimler ("Kişi 1", "Adres 5") olağan metinde geçtiği için bilinçli olarak YANLIŞ ALARM sayılmaz;
 * TC yalnız alt çizgiyle ("TC_1") — "TC 10000000146" olağan metindir (I6).
 */
const PARANTEZ = /[⟦⟧〚〛]/u;
const KALINTI = /(?<![\p{L}\p{N}])(?:(?:K[İIıi]\p{M}*[ŞSşs]\p{M}*[İIıi]\p{M}*|TELEFON|EPOSTA|K[İIıi]ML[İIıi]K|ADRES|PLAKA|IBAN|PII)[_-]?\p{Nd}+|TC_\p{Nd}+)(?![\p{L}])/iu;

interface Durum {
  lang: string;
  sayac: Partial<Record<Tur, number>>;
  anahtarlar: [string, string][];
  soyadlar: [string, string[]][];
  adlar?: [string, string[]][];
  yazimlar: [string, string][];
}

/**
 * Bir oturumun (sohbet + okunan dosyalar) maskeleme eşlemesi. Yalnız cihazda yaşar.
 * - Kişi kimliği TAM addır (`katla`: küçük harf + ASCII katlaması, tek boşluk):
 *   "Ahmet Yılmaz" = "AHMET YILMAZ", "İsmail Kaya" = "ISMAIL KAYA".
 * - Tek başına geçen soyad, o soyadı taşıyan TEK kişi varsa ve kelime bilinen birinin ADI değilse ona
 *   bağlanır; aksi hâlde ayrı yer tutucu alır (aynı soyadlı iki kişi geri koymada karışmasın).
 * - Geri koyma, yer tutucunun ilk görülen özgün yazımını kullanır.
 */
export class OturumEslemesi {
  private sayac: Partial<Record<Tur, number>> = {};
  private anahtarlar = new Map<string, string>();
  private soyadlar = new Map<string, Set<string>>();
  private adlar = new Map<string, Set<string>>();
  private yazimlar = new Map<string, string>();

  constructor(readonly lang: string) {}

  get boyut(): number {
    return this.yazimlar.size;
  }

  private yeni(tur: Tur, anahtar: string, deger: string): string {
    const n = (this.sayac[tur] ?? 0) + 1;
    this.sayac[tur] = n;
    const yt = `⟦${tur}_${n}⟧`;
    // Bozuk/eski bir dökümden gelen sayaç var olan bir yer tutucuyu yeniden üretirse iki farklı değer aynı
    // yer tutucuyu paylaşır ve geri koyma yanlış kişiyi yazar — sessizce üzerine yazılmaz (1A ertelenen).
    if (this.yazimlar.has(yt)) throw new MaskelemeHatasi("mask_inference_failed", `yer tutucu çakışması: ${yt}`);
    this.anahtarlar.set(anahtar, yt);
    this.yazimlar.set(yt, deger);
    return yt;
  }

  private kayitliKisi(deger: string): string {
    const norm = katla(deger, this.lang).replace(/\s+/gu, " ").trim();
    const anahtar = `KİŞİ:${norm}`;
    const var_ = this.anahtarlar.get(anahtar);
    if (var_) return var_;
    const kelimeler = norm.split(" ");
    const yt = this.yeni("KİŞİ", anahtar, deger);
    const ekle = (m: Map<string, Set<string>>, k: string) => {
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add(yt);
    };
    ekle(this.soyadlar, kelimeler[kelimeler.length - 1]);
    ekle(this.adlar, kelimeler[0]);
    return yt;
  }

  private yerTutucu(deger: string, tur: Tur): string {
    if (tur !== "KİŞİ") {
      const anahtar = `${tur}:${deger.replace(/\s+/gu, "")}`;
      return this.anahtarlar.get(anahtar) ?? this.yeni(tur, anahtar, deger);
    }
    const norm = katla(deger, this.lang).replace(/\s+/gu, " ").trim();
    if (norm.includes(" ")) return this.kayitliKisi(deger);
    const var_ = this.anahtarlar.get(`KİŞİ:${norm}`);
    if (var_) return var_;
    // Tek kelime: bu soyadı taşıyan TEK kişi varsa ve kelime bilinen bir kişinin ADI değilse ona bağlanır;
    // aksi hâlde belirsizdir ve kendi yazımını geri koyan ayrı yer tutucu alır (I5).
    const adaylar = this.soyadlar.get(norm);
    if (adaylar?.size === 1 && !this.adlar.has(norm)) return [...adaylar][0];
    return this.yeni("KİŞİ", `KİŞİ:${norm}`, deger);
  }

  /**
   * Span'leri yer tutucularla değiştirir. Önce çok kelimeli kişi adları kaydedilir, sonra tek kelimeler
   * çözülür; böylece "Yılmaz … Ahmet Yılmaz" sırası kimliği bölmez (I5). Span'ler tamsayı, metin içinde
   * ve örtüşmesiz olmalı; değilse işlem durur (I1).
   */
  maskele(metin: string, spanlar: Span[]): string {
    const sirali = [...spanlar].sort((a, b) => a.start - b.start);
    for (const [i, s] of sirali.entries()) {
      if (!Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start < 0 || s.end > metin.length || s.start >= s.end) {
        throw new MaskelemeHatasi("mask_inference_failed", `geçersiz span [${s.start}, ${s.end})`);
      }
      if (i > 0 && s.start < sirali[i - 1].end) throw new MaskelemeHatasi("mask_inference_failed", "örtüşen span'ler: önce birleştirilmeli");
    }
    for (const s of sirali) {
      const deger = metin.slice(s.start, s.end);
      if (s.tur === "KİŞİ" && /\s/u.test(deger.trim())) this.kayitliKisi(deger);
    }
    let cikti = "";
    let son = 0;
    for (const s of sirali) {
      cikti += metin.slice(son, s.start) + this.yerTutucu(metin.slice(s.start, s.end), s.tur);
      son = s.end;
    }
    return cikti + metin.slice(son);
  }

  /** Yolu `/` ve `\` ayırıcılarını koruyarak parça parça maskeler. */
  yolMaskele(yol: string, spanlarFn: (parca: string) => Span[]): string {
    return yol
      .split(/([\\/])/u)
      .map((p) => (p === "/" || p === "\\" || p === "" ? p : this.maskele(p, spanlarFn(p))))
      .join("");
  }

  private coz_(metin: string): { cikti: string; bilinmeyen: string[] } {
    const bilinmeyen: string[] = [];
    const cikti = metin.replace(YER_TUTUCU, (yt) => {
      const deger = this.yazimlar.get(yt);
      if (deger === undefined) bilinmeyen.push(yt);
      return deger ?? yt;
    });
    return { cikti, bilinmeyen };
  }

  /**
   * Fail-closed geri koyma: eşlemede olmayan yer tutucu veya bozulmuş kalıntı varsa
   * `GeriKoymaHatasi`. Dosyaya yazılacak her içerik buradan geçer (spec §6.4).
   */
  geriKoy(metin: string): string {
    const { cikti, bilinmeyen } = this.coz_(metin);
    const kalan = metin.replace(YER_TUTUCU, " ").normalize("NFKC");
    const bozuk = [...bilinmeyen];
    for (const m of kalan.matchAll(new RegExp(KALINTI.source, "giu"))) bozuk.push(m[0]);
    for (const m of kalan.matchAll(new RegExp(PARANTEZ.source, "gu"))) bozuk.push(m[0]);
    if (bozuk.length) throw new GeriKoymaHatasi(bozuk);
    return cikti;
  }

  /** Yalnız ekran akışı içindir: bilinmeyeni olduğu gibi bırakır, hata vermez. */
  geriKoyGevsek(metin: string): string {
    return this.coz_(metin).cikti;
  }

  /** Oturumdaki kişilerin özgün yazımlarındaki kelimeler (V2 belgeler arası yayılım için). */
  kisiKelimeleri(): string[] {
    const sonuc: string[] = [];
    for (const [yt, deger] of this.yazimlar) if (yt.startsWith("⟦KİŞİ_")) sonuc.push(...(deger.match(kelimeDeseni(this.lang)) ?? []));
    return sonuc;
  }

  serilestir(): string {
    const d: Durum = {
      lang: this.lang,
      sayac: this.sayac,
      anahtarlar: [...this.anahtarlar],
      soyadlar: [...this.soyadlar].map(([k, v]) => [k, [...v]]),
      adlar: [...this.adlar].map(([k, v]) => [k, [...v]]),
      yazimlar: [...this.yazimlar],
    };
    return JSON.stringify(d);
  }

  /** Şifreli depodan gelen dökümü doğrular; şekil bozuksa hiçbir eşleme kurulmaz (1A ertelenen). */
  static coz(json: string): OturumEslemesi {
    const bozuk = (neden: string) => new MaskelemeHatasi("mask_inference_failed", `eşleme dökümü bozuk: ${neden}`);
    let d: Durum;
    try {
      d = JSON.parse(json) as Durum;
    } catch {
      throw bozuk("JSON değil");
    }
    if (!d || typeof d !== "object" || Array.isArray(d)) throw bozuk("nesne değil");
    if (typeof d.lang !== "string") throw bozuk("lang");
    const ciftler = (x: unknown) => Array.isArray(x) && x.every((c) => Array.isArray(c) && c.length === 2 && typeof c[0] === "string");
    if (!ciftler(d.yazimlar) || !d.yazimlar.every(([, v]) => typeof v === "string")) throw bozuk("yazimlar");
    if (!ciftler(d.anahtarlar) || !d.anahtarlar.every(([, v]) => typeof v === "string")) throw bozuk("anahtarlar");
    if (!ciftler(d.soyadlar) || (d.adlar !== undefined && !ciftler(d.adlar))) throw bozuk("ad/soyad");
    if (!d.sayac || typeof d.sayac !== "object" || !Object.values(d.sayac).every((n) => Number.isSafeInteger(n) && (n as number) >= 0)) {
      throw bozuk("sayaç");
    }
    const yazimSet = new Set(d.yazimlar.map(([k]) => k));
    for (const [yt] of d.yazimlar) {
      const m = /^⟦([^_⟧]+)_(\d+)⟧$/u.exec(yt);
      if (!m || !(TURLER as readonly string[]).includes(m[1])) throw bozuk("yer tutucu biçimi");
      if (Number(m[2]) > ((d.sayac as Record<string, number>)[m[1]] ?? 0)) throw bozuk("sayaç yer tutucunun gerisinde");
    }
    for (const [, yt] of d.anahtarlar) if (!yazimSet.has(yt)) throw bozuk("yazımsız anahtar");
    for (const [, yts] of [...d.soyadlar, ...(d.adlar ?? [])]) {
      if (!Array.isArray(yts) || !yts.every((y) => yazimSet.has(y))) throw bozuk("yazımsız ad/soyad");
    }
    const e = new OturumEslemesi(d.lang);
    e.sayac = d.sayac;
    e.anahtarlar = new Map(d.anahtarlar);
    e.soyadlar = new Map(d.soyadlar.map(([k, v]) => [k, new Set(v)]));
    e.adlar = new Map((d.adlar ?? []).map(([k, v]) => [k, new Set(v)]));
    e.yazimlar = new Map(d.yazimlar);
    return e;
  }
}
