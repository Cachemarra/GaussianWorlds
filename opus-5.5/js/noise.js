// Seeded 2D simplex noise + hashing. Deterministic for a given seed.
import { CFG } from './config.js';

export function hash2(x, z, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul((s + CFG.SEED) | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
function grad(ix, iz, s, x, z) {
  const h = hash2(ix, iz, s) & 7;
  const gx = [1, -1, 1, -1, 1.41, -1.41, 0, 0][h], gz = [1, 1, -1, -1, 0, 0, 1.41, -1.41][h];
  return gx * x + gz * z;
}
export function noise2(x, z, s = 0) { // ~[-1,1]
  const k = (x + z) * F2, i = Math.floor(x + k), j = Math.floor(z + k);
  const t = (i + j) * G2, x0 = x - i + t, z0 = z - j + t;
  const i1 = x0 > z0 ? 1 : 0, j1 = 1 - i1;
  const x1 = x0 - i1 + G2, z1 = z0 - j1 + G2, x2 = x0 - 1 + 2 * G2, z2 = z0 - 1 + 2 * G2;
  let n = 0, a;
  if ((a = 0.5 - x0 * x0 - z0 * z0) > 0) n += a ** 4 * grad(i, j, s, x0, z0);
  if ((a = 0.5 - x1 * x1 - z1 * z1) > 0) n += a ** 4 * grad(i + i1, j + j1, s, x1, z1);
  if ((a = 0.5 - x2 * x2 - z2 * z2) > 0) n += a ** 4 * grad(i + 1, j + 1, s, x2, z2);
  return 70 * n;
}
export function fbm(x, z, oct = 3, s = 0) {
  let v = 0, amp = 0.5, f = 1;
  for (let o = 0; o < oct; o++, amp *= 0.5, f *= 2) v += amp * noise2(x * f, z * f, s + o * 101);
  return v / (1 - amp * 2) ; // normalize ~[-1,1]
}
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;
