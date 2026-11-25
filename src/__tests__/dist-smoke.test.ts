import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import vektorler from "../../test-vektorleri/kaliplar.json" with { type: "json" };

describe("dist smoke — built ESM entrypoint", () => {
  it("loads built public.js in a subprocess and passes all pattern vectors", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const distUrl = pathToFileURL(path.resolve(testDir, "..", "..", "dist", "public.js")).href;

    const script = `
      const dist = await import(process.argv[1]);
      const girdiler = JSON.parse(process.argv[2]);
      const vektorCiktilari = girdiler.map((girdi) => dist.maskPii(girdi).masked);
      const validTckn = dist.isValidTckn("10000000146");
      const foundPii = dist.findPii("TC 10000000146", { lang: "tr" });
      const session = dist.createSession({ lang: "tr" });
      const maskedSession = await session.mask("TC 10000000146");
      const restoredSession = dist.restorePii(maskedSession, session);

      let restoreThrewGeriKoymaHatasi = false;
      try {
        dist.restorePii("⟦TC_99⟧", session);
      } catch (err) {
        restoreThrewGeriKoymaHatasi = err instanceof dist.GeriKoymaHatasi;
      }

      process.stdout.write(JSON.stringify({
        vektorCiktilari,
        validTckn,
        foundPii,
        maskedSession,
        restoredSession,
        restoreThrewGeriKoymaHatasi,
        errorTypes: {
          GeriKoymaHatasi: typeof dist.GeriKoymaHatasi,
          MaskelemeHatasi: typeof dist.MaskelemeHatasi,
          AlgilayiciHatasi: typeof dist.AlgilayiciHatasi,
          MetinDegilHatasi: typeof dist.MetinDegilHatasi,
        },
      }));
    `;

    const stdout = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", script, distUrl, JSON.stringify(vektorler.map((v) => v.girdi))],
      { encoding: "utf8" },
    );
    const sonuc = JSON.parse(stdout);

    expect(sonuc.vektorCiktilari).toHaveLength(vektorler.length);
    for (let i = 0; i < vektorler.length; i++) {
      expect(sonuc.vektorCiktilari[i]).toBe(vektorler[i].beklenen);
    }

    expect(sonuc.validTckn).toBe(true);
    expect(sonuc.foundPii).toEqual([
      { type: "NATIONAL_ID", start: 3, end: 14, text: "10000000146" },
    ]);
    expect(sonuc.maskedSession).toBe("TC ⟦TC_1⟧");
    expect(sonuc.restoredSession).toBe("TC 10000000146");
    expect(sonuc.restoreThrewGeriKoymaHatasi).toBe(true);
    expect(sonuc.errorTypes).toEqual({
      GeriKoymaHatasi: "function",
      MaskelemeHatasi: "function",
      AlgilayiciHatasi: "function",
      MetinDegilHatasi: "function",
    });
  });
});
