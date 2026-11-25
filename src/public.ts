import { OturumEslemesi } from "./esleme";
import { kalipSpanlari, tcGecerli } from "./kaliplar";
import { izinListesiyleSuz } from "./listeler";
import { Maskeleyici } from "./maskeleyici";
import type { Algilayici, Span, Tur } from "./tipler";

export { AlgilayiciHatasi, GeriKoymaHatasi, MaskelemeHatasi, MetinDegilHatasi } from "./tipler";

/** English public PII entity types mapped 1:1 to internal `Tur` identifiers. */
export type PiiType =
  | "PERSON"
  | "NATIONAL_ID"
  | "PHONE"
  | "IBAN"
  | "EMAIL"
  | "PLATE"
  | "ADDRESS"
  | "ID_DOCUMENT"
  | "PII";

export const TUR_TO_PII_TYPE: Readonly<Record<Tur, PiiType>> = {
  KİŞİ: "PERSON",
  TC: "NATIONAL_ID",
  TELEFON: "PHONE",
  IBAN: "IBAN",
  EPOSTA: "EMAIL",
  PLAKA: "PLATE",
  ADRES: "ADDRESS",
  KİMLİK: "ID_DOCUMENT",
  PII: "PII",
};

export const PII_TYPE_TO_TUR: Readonly<Record<PiiType, Tur>> = {
  PERSON: "KİŞİ",
  NATIONAL_ID: "TC",
  PHONE: "TELEFON",
  IBAN: "IBAN",
  EMAIL: "EPOSTA",
  PLATE: "PLAKA",
  ADDRESS: "ADRES",
  ID_DOCUMENT: "KİMLİK",
  PII: "PII",
};

const PLACEHOLDERS: Readonly<Record<PiiType, string>> = {
  NATIONAL_ID: "[TC-KİMLİK-GİZLİ]",
  PHONE: "[TELEFON-GİZLİ]",
  IBAN: "[IBAN-GİZLİ]",
  EMAIL: "[EMAIL-GİZLİ]",
  PLATE: "[PLAKA-GİZLİ]",
  PERSON: "[KİŞİ-GİZLİ]",
  ADDRESS: "[ADRES-GİZLİ]",
  ID_DOCUMENT: "[KİMLİK-GİZLİ]",
  PII: "[PII-GİZLİ]",
};

export interface FindPiiOptions {
  lang?: string;
  allowlist?: string[];
}

export interface PiiSpan {
  type: PiiType;
  start: number;
  end: number;
  text: string;
}

export interface MaskPiiEntity {
  type: PiiType;
  start: number;
  end: number;
}

export interface MaskPiiResult {
  masked: string;
  entities: MaskPiiEntity[];
}

export interface PiiDetection {
  label: string;
  start: number;
  end: number;
}

export interface PiiDetector {
  detect(text: string): Promise<PiiDetection[]>;
}

export interface SessionOptions {
  lang?: string;
  detector?: PiiDetector;
  blocklist?: string[];
  allowlist?: string[];
}

export interface PiiSession {
  readonly lang: string;
  readonly size: number;
  mask(text: string): Promise<string>;
  maskPath(path: string): Promise<string>;
  restore(text: string): string;
  restoreBestEffort(text: string): string;
  setBlocklist(terms: readonly string[]): void;
  serialize(): string;
}

const NOOP_DETECTOR: Algilayici = {
  async tespit() {
    return [];
  },
};

/** Validate a Turkish Republic Identity Number (TCKN) checksum. */
export function isValidTckn(value: string): boolean {
  return tcGecerli(value);
}

/**
 * Find deterministic PII spans in `text` (TCKN, IBAN, phone, email, plate),
 * passing through the institution allowlist filter.
 */
export function findPii(text: string, options: FindPiiOptions = {}): PiiSpan[] {
  const lang = options.lang ?? "tr";
  const allowlist = options.allowlist ?? [];
  const filtered: Span[] = izinListesiyleSuz(text, kalipSpanlari(text), lang, allowlist);
  return filtered.map((s) => ({
    type: TUR_TO_PII_TYPE[s.tur],
    start: s.start,
    end: s.end,
    text: text.slice(s.start, s.end),
  }));
}

/**
 * Mask deterministic PII spans in `text` using stable vector placeholders
 * such as `[TC-KİMLİK-GİZLİ]` and `[EMAIL-GİZLİ]`.
 */
export function maskPii(text: string, options: FindPiiOptions = {}): MaskPiiResult {
  const spans = findPii(text, options);
  let masked = "";
  let cursor = 0;
  for (const s of spans) {
    masked += text.slice(cursor, s.start) + PLACEHOLDERS[s.type];
    cursor = s.end;
  }
  masked += text.slice(cursor);
  return {
    masked,
    entities: spans.map(({ type, start, end }) => ({ type, start, end })),
  };
}

/**
 * Create a session-aware PII masker/restorer backed by `Maskeleyici` and `OturumEslemesi`.
 * Preserves internal `⟦<TÜR>_<n>⟧` placeholders (e.g. `⟦KİŞİ_1⟧`, `⟦TC_1⟧`) for lossless restoration.
 */
export function createSession(options: SessionOptions = {}): PiiSession {
  const lang = options.lang ?? "tr";
  const algilayici: Algilayici = options.detector
    ? {
        async tespit(metin: string) {
          const hits = await options.detector!.detect(metin);
          return hits.map((h) => ({ etiket: h.label, start: h.start, end: h.end }));
        },
      }
    : NOOP_DETECTOR;

  const mapping = new OturumEslemesi(lang);
  const masker = new Maskeleyici({
    algilayici,
    lang,
    avukatListesi: options.blocklist,
    izinEk: options.allowlist,
    esleme: mapping,
  });

  return {
    get lang() {
      return mapping.lang;
    },
    get size() {
      return mapping.boyut;
    },
    mask: (text: string) => masker.maskele(text),
    maskPath: (path: string) => masker.maskeleYol(path),
    restore: (text: string) => mapping.geriKoy(text),
    restoreBestEffort: (text: string) => mapping.geriKoyGevsek(text),
    setBlocklist: (terms: readonly string[]) => masker.avukatListesiniAyarla(terms),
    serialize: () => mapping.serilestir(),
  };
}

/**
 * Fail-closed restoration of session placeholders in `text`.
 * Throws `GeriKoymaHatasi` if any unknown or corrupted placeholder remains.
 */
export function restorePii(text: string, session: PiiSession): string {
  return session.restore(text);
}
