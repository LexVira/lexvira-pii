/** Maskelenen değerin türü; yer tutucu `⟦<TÜR>_<n>⟧` biçiminde bu adı taşır. */
export type Tur = "KİŞİ" | "TC" | "TELEFON" | "IBAN" | "EPOSTA" | "PLAKA" | "ADRES" | "KİMLİK" | "PII";

export const TURLER: readonly Tur[] = ["KİŞİ", "TC", "TELEFON", "IBAN", "EPOSTA", "PLAKA", "ADRES", "KİMLİK", "PII"];

/** Özgün metindeki yarı açık aralık [start, end). */
export interface Span {
  start: number;
  end: number;
  tur: Tur;
}

/** NER algılayıcısı; `packages/maskeleme-ner` ONNX uygulamasını sağlar, testler sahtesini. */
export interface Algilayici {
  tespit(metin: string): Promise<{ etiket: string; start: number; end: number }[]>;
}

/** Tüm maskeleme hatalarının tabanı. `kod` spec §8.1 hata kataloğundaki koddur. */
export class MaskelemeHatasi extends Error {
  constructor(
    readonly kod: string,
    mesaj: string,
  ) {
    super(mesaj);
    this.name = new.target.name;
  }
}

export class AlgilayiciHatasi extends MaskelemeHatasi {
  constructor(mesaj: string) {
    super("mask_inference_failed", mesaj);
  }
}

export class MetinDegilHatasi extends MaskelemeHatasi {
  constructor(mesaj: string) {
    super("mask_unsupported_content", mesaj);
  }
}

export class GeriKoymaHatasi extends MaskelemeHatasi {
  constructor(readonly bozuk: string[]) {
    super("restore_placeholder_invalid", `geri konamayan yer tutucu: ${bozuk.join(", ")}`);
  }
}

export class ModelHatasi extends MaskelemeHatasi {
  constructor(neden: string) {
    super("mask_model_unavailable", neden);
  }
}
