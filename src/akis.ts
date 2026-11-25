import type { OturumEslemesi } from "./esleme";
import { GeriKoymaHatasi } from "./tipler";

/** Bir yer tutucunun azami uzunluğu (`⟦KİMLİK_99999⟧` = 14); güvenlik payıyla. */
const AZAMI_ONEK = 24;

/**
 * Akışlı model yanıtında yer tutucuları gerçek değerlere çevirir (ai-service `StreamDeanonymizer`).
 * Tamponun kuyruğunda kapanmamış bir `⟦…` varsa, kapanana kadar bekletilir; böylece ekrana hiçbir
 * zaman yarım yer tutucu ya da yarım isim çıkmaz. Ekran içindir: bilinmeyen yer tutucu olduğu gibi
 * kalır (`geriKoyGevsek`); dosyaya yazma `OturumEslemesi.geriKoy` ile ayrıca fail-closed denetlenir.
 */
export class AkisGeriKoyucu {
  private tampon = "";

  constructor(private readonly esleme: OturumEslemesi) {}

  besle(parca: string): string {
    this.tampon += parca;
    const acik = this.tampon.lastIndexOf("⟦");
    let kes = this.tampon.length;
    if (acik >= 0 && this.tampon.indexOf("⟧", acik) < 0 && this.tampon.length - acik <= AZAMI_ONEK) kes = acik;
    const cikti = this.esleme.geriKoyGevsek(this.tampon.slice(0, kes));
    this.tampon = this.tampon.slice(kes);
    return cikti;
  }

  /** Akış bitti: tamponda kapanmamış yer tutucu kalmışsa fail-closed. */
  bitir(): string {
    const kalan = this.tampon;
    this.tampon = "";
    if (kalan.includes("⟦") && !kalan.includes("⟧")) throw new GeriKoymaHatasi([kalan]);
    return this.esleme.geriKoyGevsek(kalan);
  }
}
