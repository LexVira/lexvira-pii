import { describe, expect, it } from "vitest";
import { kalipSpanlari } from "../kaliplar";

/** ai-service'te ölçülen karesel geri izleme (40 bin karakterde ~10 sn); TS kalıpları da doğrusal kalmalı. */
describe("kalıplar — doğrusal süre", () => {
  it.each([
    ["ASCII nokta dizisi", "b.".repeat(20_000)],
    ["Türkçe nokta dizisi", "ş.".repeat(20_000)],
    ["@ içermeyen uzun kelime", "ğ".repeat(40_000)],
    ["çok sayıda @", "a@".repeat(20_000)],
  ])("%s 40 bin karakterde < 500 ms", (_ad, metin) => {
    const t = performance.now();
    kalipSpanlari(metin);
    expect(performance.now() - t).toBeLessThan(500);
  });
});
