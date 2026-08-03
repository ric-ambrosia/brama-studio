// ─────────────────────────────────────────────────────────────────────────────
// MONDI · lib/noise.js — simplex noise SEEDATO (niente Math.random) per ali
// farfalla, pulviscoli, correnti. Implementazione Gustavson, tabella di
// permutazione mescolata con mulberry32.
// Uso:
//   import { makeNoise3D, fbm3, curl3 } from '../lib/noise.js';
//   const n3 = makeNoise3D(hashString(slug));   // oppure makeNoise3D(ctx.prng)
//   const v  = n3(x, y, z);                     // ∈ [-1, 1]
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32 } from './prng.js';

const F3 = 1 / 3;
const G3 = 1 / 6;

const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

/**
 * Crea un simplex noise 3D deterministico.
 * @param {number|function} seed — intero 32-bit OPPURE una funzione prng ()=>[0,1)
 * @returns {(x:number,y:number,z:number)=>number} valore ∈ [-1, 1]
 */
export function makeNoise3D(seed = 1) {
  const rand = typeof seed === 'function' ? seed : mulberry32((seed >>> 0) || 1);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }

  return function noise3(xin, yin, zin) {
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);

    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0)      { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else               { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0)       { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0)  { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else               { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }

    const x1 = x0 - i1 + G3,      y1 = y0 - j1 + G3,      z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3,  y2 = y0 - j2 + 2 * G3,  z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3,   y3 = y0 - 1 + 3 * G3,   z3 = z0 - 1 + 3 * G3;

    const ii = i & 255, jj = j & 255, kk = k & 255;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      const gi = permMod12[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[gi] * x0 + GRAD3[gi + 1] * y0 + GRAD3[gi + 2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      const gi = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[gi] * x1 + GRAD3[gi + 1] * y1 + GRAD3[gi + 2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      const gi = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[gi] * x2 + GRAD3[gi + 1] * y2 + GRAD3[gi + 2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      const gi = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3;
      n3 = t3 * t3 * (GRAD3[gi] * x3 + GRAD3[gi + 1] * y3 + GRAD3[gi + 2] * z3);
    }
    return 32.0 * (n0 + n1 + n2 + n3);
  };
}

/** Noise 2D come fetta del 3D (comodo per pattern di superficie). */
export function makeNoise2D(seed = 1) {
  const n3 = makeNoise3D(seed);
  return (x, y) => n3(x, y, 0.5);
}

/** Fractal Brownian Motion su un noise 3D esistente. */
export function fbm3(noise, x, y, z, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

// offset dei tre potenziali per il curl (costanti arbitrarie ma fisse)
const CX = 31.416, CY = 47.853, CZ = 12.793;
const DX = -233.13, DY = 123.45, DZ = -54.21;

/**
 * Curl noise 3D (campo a divergenza nulla — correnti fluide senza sorgenti).
 * Scrive [vx, vy, vz] in `out` (array pre-allocato: niente allocazioni in update).
 */
export function curl3(noise, x, y, z, eps = 0.01, out = [0, 0, 0]) {
  const inv2e = 1 / (2 * eps);
  // potenziali: P1 = noise, P2 = noise sfalsato C, P3 = noise sfalsato D
  const p2 = (a, b, c) => noise(a + CX, b + CY, c + CZ);
  const p3 = (a, b, c) => noise(a + DX, b + DY, c + DZ);

  const dP3dy = (p3(x, y + eps, z) - p3(x, y - eps, z)) * inv2e;
  const dP2dz = (p2(x, y, z + eps) - p2(x, y, z - eps)) * inv2e;
  const dP1dz = (noise(x, y, z + eps) - noise(x, y, z - eps)) * inv2e;
  const dP3dx = (p3(x + eps, y, z) - p3(x - eps, y, z)) * inv2e;
  const dP2dx = (p2(x + eps, y, z) - p2(x - eps, y, z)) * inv2e;
  const dP1dy = (noise(x, y + eps, z) - noise(x, y - eps, z)) * inv2e;

  out[0] = dP3dy - dP2dz;
  out[1] = dP1dz - dP3dx;
  out[2] = dP2dx - dP1dy;
  return out;
}
