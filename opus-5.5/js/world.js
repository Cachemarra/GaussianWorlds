// Procedural terrain, biomes and chunked splat generation (deterministic by seed).
import * as THREE from 'three';
import { SplatMesh, dyno } from '@sparkjsdev/spark';
import { CFG } from './config.js';
import { noise2, fbm, hash2, rng, smooth, mix } from './noise.js';

const WY = CFG.WATER_Y;

// ---------- terrain field (evaluable in JS, used for physics too) ----------
export const W = { sea: 0, forest: 0, cave: 0, meadow: 0, wet: 0 }; // last sampled biome weights
export function height(x, z) {
  const s = fbm(x * 0.0022, z * 0.0022, 3, 11);
  const b = fbm(x * 0.0035 + 40, z * 0.0035 - 17, 2, 23);
  W.sea = smooth(-0.22, -0.4, s);
  const land = 1 - W.sea;
  W.forest = land * smooth(0.08, 0.25, b);
  W.cave = land * smooth(-0.2, -0.36, b);
  W.meadow = Math.max(0, land - W.forest - W.cave);
  W.wet = W.meadow + W.forest;
  let h = 1.2 + (fbm(x * 0.015, z * 0.015, 3, 5) * 0.5 + 0.5) * 3 + noise2(x * 0.08, z * 0.08, 7) * 0.2;
  h += W.forest * (fbm(x * 0.01 + 9, z * 0.01, 2, 8) * 0.5 + 0.5) * 4;
  h += W.cave * (1.5 + noise2(x * 0.05, z * 0.05, 9));
  // rivers (thin bands of |noise|) and lakes, only in meadow/forest
  const river = smooth(0.05, 0.0, Math.abs(noise2(x * 0.005, z * 0.005, 31))) * W.wet;
  const lake = smooth(0.42, 0.62, noise2(x * 0.011 + 5, z * 0.011 - 3, 41)) * W.wet;
  h = mix(h, -1.6, Math.max(river, lake));
  h = mix(h, -10 + noise2(x * 0.03, z * 0.03, 13) * 2, W.sea);
  return h;
}
// Cave ceiling above ground (Infinity = open sky). Low ceiling = wall.
export function ceilingAt(x, z, h, cave) {
  if (cave < 0.5) return Infinity;
  const open = smooth(0.4, 0.55, noise2(x * 0.02, z * 0.02, 77)); // entrances
  const wall = smooth(0.66, 0.52, cave) * (1 - open);
  return h + mix(4.8 + noise2(x * 0.1, z * 0.1, 79) * 1.2, 0.15, wall);
}
export function groundInfo(x, z) {
  const h = height(x, z);
  return { h, ceil: ceilingAt(x, z, h, W.cave), sea: W.sea, cave: W.cave, forest: W.forest, meadow: W.meadow };
}

// ---------- shared dyno uniforms + modifiers (wind / waves / day-night tint) ----------
export const U = {
  time: dyno.dynoFloat(0),
  tint: dyno.dynoVec3(new THREE.Vector3(1, 1, 1)),
  wind: dyno.dynoFloat(0.12),
};
// kind: 0 static (tint only), 1 sway (wind, scaled by splat length), 2 water (waves)
export function makeMod(kind) {
  return dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
    const d = new dyno.Dyno({
      inTypes: { gsplat: dyno.Gsplat, t: 'float', tint: 'vec3', wind: 'float' },
      outTypes: { gsplat: dyno.Gsplat },
      statements: ({ inputs: i, outputs: o }) => [
        `${o.gsplat} = ${i.gsplat};`,
        '{',
        `vec3 c = ${i.gsplat}.center;`,
        kind === 1 ? `float k = clamp(${i.gsplat}.scales.y * 4.0, 0.0, 1.0) * ${i.wind};
          float w = sin(${i.t}*1.6 + c.x*0.21 + c.z*0.13) + 0.45*sin(${i.t}*3.7 + c.x*1.3 + c.z*0.9);
          ${o.gsplat}.center.xz += k * w * vec2(0.8, 0.45);` : '',
        kind === 2 ? `${o.gsplat}.center.y += 0.07*sin(${i.t}*1.4 + c.x*0.5 + c.z*0.3) + 0.04*sin(${i.t}*2.3 - c.x*0.2 + c.z*0.7);` : '',
        `${o.gsplat}.rgba.rgb *= ${i.tint};`,
        '}',
      ],
    });
    return { gsplat: d.apply({ gsplat, t: U.time, tint: U.tint, wind: U.wind }).gsplat };
  });
}

// ---------- splat buffers ----------
class Buf {
  d = [];
  add(x, y, z, sx, sy, sz, q, r, g, b, a) { this.d.push(x, y, z, sx, sy, sz, q.x, q.y, q.z, q.w, r, g, b, a); }
  get n() { return this.d.length / 14; }
}
const _c = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _col = new THREE.Color();
export function bufToMesh(buf, kind) {
  const d = buf.d;
  return new SplatMesh({
    constructSplats: (s) => {
      for (let i = 0; i < d.length; i += 14) {
        _c.set(d[i], d[i + 1], d[i + 2]); _s.set(d[i + 3], d[i + 4], d[i + 5]);
        _q.set(d[i + 6], d[i + 7], d[i + 8], d[i + 9]); _col.setRGB(d[i + 10], d[i + 11], d[i + 12]);
        s.pushSplat(_c, _s, _q, d[i + 13], _col);
      }
    },
    worldModifier: kind == null ? undefined : makeMod(kind),
  });
}
export { Buf };

const UP = new THREE.Vector3(0, 1, 0), tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), tv = new THREE.Vector3(), te = new THREE.Euler();
const yawQ = (a) => tq.setFromAxisAngle(UP, a);
const dirQ = (dx, dy, dz) => tq.setFromUnitVectors(UP, tv.set(dx, dy, dz).normalize());
const eulQ = (x, y, z) => tq.setFromEuler(te.set(x, y, z));

// ---------- chunk content ----------
function genChunk(cx, cz, dens) {
  const S = CFG.CHUNK, x0 = cx * S, z0 = cz * S;
  const R = rng(hash2(cx, cz, 1));
  const st = new Buf(), sw = new Buf(), wa = new Buf();
  const k = 1 / Math.sqrt(dens); // size compensation for sparser LODs
  const r = (a, b) => a + (b - a) * R();

  // terrain carpet (+ cave ceiling/walls)
  const sp = 0.6 * k, n = Math.ceil(S / sp);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = x0 + (i + R()) * sp, z = z0 + (j + R()) * sp;
    const hx = height(x + 0.4, z), hz = height(x, z + 0.4);
    const h = height(x, z), w = { ...W };
    dirQ(h - hx, 0.4, h - hz); tq2.copy(tq).multiply(yawQ(R() * 6.28));
    const v = noise2(x * 0.15, z * 0.15, 3) * 0.08 + r(-0.05, 0.05);
    let cr = w.meadow * (0.36 + v) + w.forest * (0.24 + v) + w.cave * (0.33 + v) + w.sea * 0.66;
    let cg = w.meadow * (0.56 + v * 1.3) + w.forest * (0.3 + v) + w.cave * (0.3 + v) + w.sea * 0.58;
    let cb = w.meadow * (0.2 + v * 0.5) + w.forest * (0.14 + v) + w.cave * (0.28 + v) + w.sea * 0.42;
    if (h < 0.6 && h > -0.8) { const t = smooth(0.6, 0.1, h); cr = mix(cr, 0.82, t); cg = mix(cg, 0.73, t); cb = mix(cb, 0.5, t); } // shore sand
    if (h < WY) { const dk = Math.max(0.35, 1 + h * 0.07); cr *= dk; cg *= dk; cb *= dk; }
    st.add(x, h, z, sp * 0.8, 0.05, sp * 0.8, tq2, cr, cg, cb, 0.95);
    const ceil = ceilingAt(x, z, h, w.cave);
    if (ceil < Infinity) {
      const g = 0.2 + R() * 0.1;
      st.add(x, ceil, z, sp * 1.1, 0.25 * k, sp * 1.1, yawQ(R() * 6.28), g, g * 0.92, g * 0.85, 1);
      if (ceil - h > 1) st.add(x, ceil + 0.5, z, sp * 1.1, 0.3 * k, sp * 1.1, tq2, 0.36 + v, 0.4 + v, 0.3 + v, 1); // hill top seen from outside
      for (let y = h + 0.3; y < ceil && ceil - h < 2.6; y += 0.55 * k)
        st.add(x, y, z, sp * 0.6, 0.35 * k, sp * 0.6, yawQ(R() * 6.28), g + 0.05, g, g * 0.9, 1);
      if (R() < 0.025 * k && ceil - h > 3) { // stalactite
        for (let s = 0, L = r(0.6, 1.8); s < L; s += 0.25) st.add(x, ceil - s, z, 0.12 * (1 - s / L) + 0.03, 0.18, 0.12 * (1 - s / L) + 0.03, tq2, 0.4, 0.37, 0.33, 1);
      }
      if (R() < 0.015 * k) { // glowing crystals
        const hue = R() < 0.5 ? [0.3, 0.9, 1] : [0.8, 0.45, 1];
        for (let s = 0; s < 5; s++) st.add(x + r(-0.3, 0.3), h + 0.25, z + r(-0.3, 0.3), 0.06, r(0.2, 0.4), 0.06, eulQ(r(-0.5, 0.5), 0, r(-0.5, 0.5)), hue[0], hue[1], hue[2], 1);
      }
    }
  }

  // water surface (sea, rivers, lakes)
  const wsp = 1.0 * k, wn = Math.ceil(S / wsp);
  for (let i = 0; i < wn; i++) for (let j = 0; j < wn; j++) {
    const x = x0 + (i + 0.5) * wsp + r(-0.2, 0.2), z = z0 + (j + 0.5) * wsp + r(-0.2, 0.2);
    const h = height(x, z);
    if (h > WY - 0.05) continue;
    const deep = smooth(0, -6, h);
    wa.add(x, WY, z, wsp * 0.75, 0.03, wsp * 0.75, yawQ(R() * 6.28), mix(0.25, 0.08, deep) + r(0, 0.05), mix(0.55, 0.3, deep), mix(0.62, 0.55, deep) + r(0, 0.05), 0.55);
  }

  // grass, flowers, ferns
  const nGrass = Math.floor(3200 * dens);
  for (let i = 0; i < nGrass; i++) {
    const x = x0 + R() * S, z = z0 + R() * S, h = height(x, z);
    if (h < WY + 0.15 || R() > W.meadow + W.forest * 0.4 || ceilingAt(x, z, h, W.cave) < Infinity) continue;
    const hg = r(0.25, 0.6) * (W.forest > 0.5 ? 0.7 : 1), wd = 0.035 * k;
    const v = r(-0.08, 0.08), yl = noise2(x * 0.05, z * 0.05, 5) * 0.12;
    sw.add(x, h + hg * 0.45, z, wd, hg * 0.5, wd, eulQ(r(-0.3, 0.3), R() * 6.28, r(-0.3, 0.3)), 0.3 + yl + v, 0.6 + v + yl * 0.5, 0.18 + v * 0.5, 0.9);
    if (W.meadow > 0.6 && R() < 0.03) {
      const f = [[0.95, 0.85, 0.2], [0.9, 0.3, 0.25], [0.95, 0.95, 0.95], [0.6, 0.4, 0.9]][(R() * 4) | 0];
      sw.add(x, h + hg * 0.9, z, 0.06 * k, 0.05 * k, 0.06 * k, tq, f[0], f[1], f[2], 1);
    }
  }

  // trees
  const nTrees = Math.floor(R() * 3);
  const tryTree = (conifer) => {
    const x = x0 + r(2, S - 2), z = z0 + r(2, S - 2), h = height(x, z);
    if (h < WY + 0.4 || W.sea > 0.2 || ceilingAt(x, z, h, W.cave) < Infinity) return;
    if (conifer ? W.forest < 0.4 : W.meadow < 0.4) return;
    conifer ? conif(st, sw, R, x, h, z, dens) : decid(st, sw, R, x, h, z, dens);
  };
  for (let t = 0; t < nTrees; t++) tryTree(false);
  for (let t = 0; t < 14; t++) tryTree(true);

  // rocks
  const nRocks = Math.floor(R() * 2.5 + 3 * W.cave + 2 * W.sea);
  for (let t = 0; t < nRocks; t++) {
    const x = x0 + r(1, S - 1), z = z0 + r(1, S - 1), h = height(x, z), sz = r(0.4, 1.4);
    const m = Math.max(8, Math.floor(60 * dens * sz));
    for (let s = 0; s < m; s++) {
      const a = R() * 6.28, e = R() * 1.4, rr = sz * r(0.5, 1);
      const g = 0.38 + r(-0.07, 0.07) + (e > 1 ? 0.06 : 0);
      st.add(x + Math.cos(a) * Math.cos(e) * rr, h + Math.sin(e) * rr * 0.7, z + Math.sin(a) * Math.cos(e) * rr, 0.22 * sz * k, 0.16 * sz * k, 0.22 * sz * k, eulQ(R(), R(), R()), g, g * 0.97 + (R() < 0.2 ? 0.08 : 0), g * 0.9, 1);
    }
  }

  // well (pozo): occasional, meadow/forest, dry ground
  if (R() < 0.08) {
    const x = x0 + r(4, S - 4), z = z0 + r(4, S - 4), h = height(x, z);
    if (W.wet > 0.9 && h > 0.8 && ceilingAt(x, z, h, W.cave) === Infinity) well(st, R, x, h, z);
  }

  // sea life: kelp (sway) + coral
  const nKelp = Math.floor(70 * dens);
  for (let t = 0; t < nKelp; t++) {
    const x = x0 + R() * S, z = z0 + R() * S, h = height(x, z);
    if (h > -2.5) continue;
    const L = r(1.5, Math.min(6, -h - 0.5));
    for (let s = 0; s < L; s += 0.35 * k) sw.add(x + Math.sin(s) * 0.1, h + s, z, 0.07 * k, 0.25 * k, 0.03, yawQ(R() * 6), 0.25, 0.45 + s * 0.03, 0.15, 0.9);
    if (R() < 0.4) {
      const c = [[0.95, 0.45, 0.4], [0.95, 0.75, 0.3], [0.6, 0.35, 0.8]][(R() * 3) | 0];
      for (let s = 0; s < 6; s++) st.add(x + r(-0.4, 0.4), h + r(0.1, 0.5), z + r(-0.4, 0.4), 0.15, 0.15, 0.15, tq, c[0], c[1], c[2], 1);
    }
  }
  return { st, sw, wa };
}

function decid(st, sw, R, x, h, z, dens) {
  const r = (a, b) => a + (b - a) * R();
  const H = r(2.4, 3.6), k = 1 / Math.sqrt(dens);
  for (let y = 0; y < H; y += 0.3) st.add(x + Math.sin(y) * 0.05, h + y, z, 0.13 - y * 0.015, 0.22, 0.13 - y * 0.015, tq.identity(), 0.36, 0.25, 0.16, 1);
  const lobes = 3 + ((R() * 3) | 0);
  for (let l = 0; l < lobes; l++) {
    const cx = x + r(-1, 1), cy = h + H + r(-0.3, 1), cz = z + r(-1, 1), rad = r(0.9, 1.5);
    const autumn = R() < 0.15;
    for (let s = 0, m = Math.max(15, Math.floor(160 * dens)); s < m; s++) {
      const a = R() * 6.28, e = Math.acos(r(-1, 1)), rr = rad * Math.cbrt(R());
      const lx = Math.sin(e) * Math.cos(a), ly = Math.cos(e), lz = Math.sin(e) * Math.sin(a);
      const lit = 0.75 + ly * 0.25 + lx * 0.1;
      const base = autumn ? [0.75, 0.5, 0.15] : [0.25 + r(0, 0.15), 0.5 + r(0, 0.15), 0.15];
      sw.add(cx + lx * rr, cy + ly * rr * 0.8, cz + lz * rr, 0.16 * k, 0.1 * k, 0.12 * k, eulQ(R() * 3, R() * 3, R() * 3), base[0] * lit, base[1] * lit, base[2] * lit, 0.92);
    }
  }
}
function conif(st, sw, R, x, h, z, dens) {
  const r = (a, b) => a + (b - a) * R();
  const H = r(5, 9), k = 1 / Math.sqrt(dens), Rb = H * 0.28;
  for (let y = 0; y < H; y += 0.35) st.add(x, h + y, z, 0.12 * (1 - y / H) + 0.04, 0.25, 0.12 * (1 - y / H) + 0.04, tq.identity(), 0.3, 0.2, 0.13, 1);
  const m = Math.max(30, Math.floor(260 * dens));
  for (let s = 0; s < m; s++) {
    const t = Math.pow(R(), 0.8), y = h + 1 + t * (H - 1), rad = Rb * (1 - t) * r(0.3, 1), a = R() * 6.28;
    const dx = Math.cos(a), dz = Math.sin(a), lit = 0.7 + t * 0.3 + dx * 0.1;
    dirQ(dx, -0.35, dz);
    sw.add(x + dx * rad * 0.6, y - rad * 0.1, z + dz * rad * 0.6, 0.08 * k, rad * 0.5 + 0.1, 0.05 * k, tq, (0.1 + r(0, 0.05)) * lit, (0.3 + r(0, 0.08)) * lit, (0.2 + r(0, 0.05)) * lit, 0.95);
  }
}
function well(st, R, x, h, z) {
  for (let l = 0; l < 4; l++) for (let a = 0; a < 6.28; a += 0.24) {
    const g = 0.5 + R() * 0.12;
    st.add(x + Math.cos(a) * 0.85, h + 0.12 + l * 0.2, z + Math.sin(a) * 0.85, 0.13, 0.1, 0.11, yawQ(-a), g, g * 0.95, g * 0.88, 1);
  }
  st.add(x, h + 0.6, z, 0.72, 0.02, 0.72, tq.identity(), 0.05, 0.12, 0.18, 1); // dark water
  for (const s of [-1, 1]) for (let y = 0; y < 1.8; y += 0.25) st.add(x + s * 0.9, h + 0.8 + y, z, 0.05, 0.16, 0.05, tq.identity(), 0.38, 0.26, 0.16, 1);
  for (let a = -1.1; a <= 1.1; a += 0.15) st.add(x + a, h + 2.6 - Math.abs(a) * 0.5, z, 0.12, 0.05, 0.6, tq.identity(), 0.45, 0.22, 0.14, 1);
}

// ---------- chunk manager ----------
export class World {
  constructor(scene) {
    this.scene = scene; this.chunks = new Map(); this.densityScale = 1; this.total = 0; this.frame = 0;
  }
  update(px, pz) {
    const S = CFG.CHUNK, R = CFG.RADIUS, pcx = Math.floor(px / S), pcz = Math.floor(pz / S);
    const want = [];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dz)), lod = ring <= 1 ? 0 : ring === 2 ? 1 : 2;
      const key = `${pcx + dx},${pcz + dz}`, c = this.chunks.get(key);
      if (!c || (c.lod !== lod && !c.pending)) want.push({ key, cx: pcx + dx, cz: pcz + dz, lod, d: dx * dx + dz * dz });
    }
    for (const [key, c] of this.chunks) {
      if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > R + 1) { this.dispose(c); this.chunks.delete(key); }
    }
    want.sort((a, b) => a.d - b.d);
    for (const w of want.slice(0, CFG.BUILDS_PER_FRAME)) this.build(w);
    this.total = 0;
    for (const c of this.chunks.values()) this.total += c.count;
    if (this.total > CFG.SPLAT_BUDGET && this.densityScale > 0.2) { // over budget: thin everything and rebuild
      this.densityScale *= 0.85;
      for (const c of this.chunks.values()) c.lod = -1;
    }
  }
  build({ key, cx, cz, lod }) {
    const old = this.chunks.get(key);
    const { st, sw, wa } = genChunk(cx, cz, CFG.LOD_DENSITY[lod] * this.densityScale);
    const meshes = [[st, 0], [sw, 1], [wa, 2]].filter(([b]) => b.n).map(([b, kind]) => {
      const m = bufToMesh(b, kind); m.userData.kind = kind; this.scene.add(m); return m;
    });
    const c = { cx, cz, lod, meshes, count: st.n + sw.n + wa.n, pending: true };
    this.chunks.set(key, c);
    // old chunk stays visible until the new one is ready
    Promise.all(meshes.map((m) => m.initialized)).then(() => { c.pending = false; if (old) this.dispose(old); });
  }
  dispose(c) { for (const m of c.meshes) { this.scene.remove(m); m.dispose?.(); } }
  // re-run generators: animated (sway/water) on near chunks every frame, tint refresh staggered
  animate() {
    this.frame++;
    let i = 0;
    for (const c of this.chunks.values()) {
      i++;
      const refresh = (this.frame + i) % 20 === 0;
      for (const m of c.meshes) if ((m.userData.kind > 0 && c.lod === 0) || refresh) m.updateVersion();
    }
  }
}
