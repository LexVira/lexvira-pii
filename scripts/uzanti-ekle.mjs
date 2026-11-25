import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kokDizin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDizin = path.join(kokDizin, "dist");

const UZANTILI_SON = /\.(?:js|mjs|cjs|json|node|d\.ts)$/i;
const BELIRTEC_DESENI = /((?:from\s+|import\s*(?:\(\s*)?))(['"])(\.\.?\/[^'"]+)\2/g;

function dosyalariTopla(dizin) {
  const sonuc = [];
  for (const girdi of readdirSync(dizin)) {
    const tamYol = path.join(dizin, girdi);
    const bilgi = statSync(tamYol);
    if (bilgi.isDirectory()) {
      sonuc.push(...dosyalariTopla(tamYol));
    } else if (girdi.endsWith(".js") || girdi.endsWith(".d.ts")) {
      sonuc.push(tamYol);
    }
  }
  return sonuc;
}

function uzantiEkle(icerik) {
  return icerik.replace(BELIRTEC_DESENI, (tam, onek, tirnak, belirtec) => {
    if (UZANTILI_SON.test(belirtec)) {
      return tam;
    }
    const yeni = belirtec.endsWith("/") ? `${belirtec}index.js` : `${belirtec}.js`;
    return `${onek}${tirnak}${yeni}${tirnak}`;
  });
}

for (const dosya of dosyalariTopla(distDizin)) {
  const eski = readFileSync(dosya, "utf8");
  const yeni = uzantiEkle(eski);
  if (yeni !== eski) {
    writeFileSync(dosya, yeni, "utf8");
  }
}
