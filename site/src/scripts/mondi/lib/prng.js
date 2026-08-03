// ─────────────────────────────────────────────────────────────────────────────
// MONDI · lib/prng.js — UNICA fonte di casualità ammessa nella home.
// mulberry32 seedato con hash(slug): deterministico, riproducibile, veloce.
// Contratto: content-notes/mondi-architettura.md §0 (regole trasversali).
// ─────────────────────────────────────────────────────────────────────────────

/** Hash 32-bit di una stringa (xmur3). Stabile tra sessioni e browser. */
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** PRNG mulberry32: () => float in [0, 1). Seed intero 32-bit. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** PRNG seedato per uno slug: prngFor('vertigine')() ∈ [0,1). */
export function prngFor(slug) {
  return mulberry32(hashString(String(slug)));
}
