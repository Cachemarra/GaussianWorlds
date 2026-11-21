import * as THREE from "three";
import { CONFIG } from "./config.js";

// Deterministic 32-bit integer hash for chunk coordinates and feature seeds.
export function hashCoords(cx, cz, seed = CONFIG.WORLD_SEED) {
  let h = Math.imul(cx, 374761393) ^ Math.imul(cz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// Fast deterministic Mulberry32 PRNG returning floats in [0, 1).
export function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2D(ix, iz, seed) {
  let h = Math.imul(ix, 1619) ^ Math.imul(iz, 31337) ^ Math.imul(seed, 6971);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function quintic(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Smooth C2-continuous 2D value noise in [0, 1].
export function valueNoise2D(x, z, seed = CONFIG.WORLD_SEED) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = quintic(fx);
  const v = quintic(fz);

  const a = hash2D(ix, iz, seed);
  const b = hash2D(ix + 1, iz, seed);
  const c = hash2D(ix, iz + 1, seed);
  const d = hash2D(ix + 1, iz + 1, seed);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// 4-octave fractal Brownian motion in [-1, 1].
function fbm(x, z, octaves = 4, seed = CONFIG.WORLD_SEED) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += (valueNoise2D(x * freq, z * freq, seed + i * 101) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

// Smooth continuous biome weights across all 7 biomes.
export function getBiomeWeights(x, z) {
  const temp = valueNoise2D(x * 0.0038 + 12.1, z * 0.0038 - 7.4, CONFIG.WORLD_SEED + 911);
  const humid = valueNoise2D(x * 0.0038 - 5.7, z * 0.0038 + 19.3, CONFIG.WORLD_SEED + 1523);
  const weird = valueNoise2D(x * 0.0035 + 41.3, z * 0.0035 + 23.7, CONFIG.WORLD_SEED + 3109);

  let nSea = smoothstep(0.60, 0.80, humid) * smoothstep(0.35, 0.65, temp);
  let nCave = smoothstep(0.64, 0.84, 1.0 - temp) * smoothstep(0.45, 0.72, 1.0 - humid);
  let nLiminal = smoothstep(0.66, 0.86, weird) * smoothstep(0.35, 0.65, temp);
  let nDreamcore = smoothstep(0.64, 0.84, 1.0 - weird) * smoothstep(0.45, 0.75, humid);
  let nTerrorcore = smoothstep(0.68, 0.88, weird) * smoothstep(0.62, 0.85, 1.0 - temp);
  let nConifer = smoothstep(0.45, 0.72, 1.0 - temp) * (1.0 - nCave * 0.7);
  let nMeadow = Math.max(0.08, 1.0 - nSea - nCave - nLiminal - nDreamcore - nTerrorcore - nConifer * 0.6);

  // Anchor all 7 biomes cleanly in reachable sectors around origin.
  const wAnchorMeadow = 1.0 - smoothstep(45, 110, Math.hypot(x, z));
  const wAnchorConifer = 1.0 - smoothstep(45, 110, Math.hypot(x - 160, z));
  const wAnchorCave = 1.0 - smoothstep(45, 105, Math.hypot(x, z - 160));
  const wAnchorSea =
    (1.0 - smoothstep(0, 40, Math.max(0, x + 115))) *
    (1.0 - smoothstep(75, 130, Math.abs(z)));
  const wAnchorLiminal = 1.0 - smoothstep(50, 105, Math.hypot(x, z + 170));
  const wAnchorDreamcore = 1.0 - smoothstep(50, 105, Math.hypot(x - 150, z + 150));
  const wAnchorTerrorcore = 1.0 - smoothstep(50, 105, Math.hypot(x + 150, z - 150));

  const farBlend = smoothstep(235, 345, Math.hypot(x, z));
  let meadow = THREE.MathUtils.lerp(wAnchorMeadow + 0.001, nMeadow, farBlend);
  let conifer = THREE.MathUtils.lerp(wAnchorConifer, nConifer, farBlend);
  let cave = THREE.MathUtils.lerp(wAnchorCave, nCave, farBlend);
  let sea = THREE.MathUtils.lerp(wAnchorSea, nSea, farBlend);
  let liminal = THREE.MathUtils.lerp(wAnchorLiminal, nLiminal, farBlend);
  let dreamcore = THREE.MathUtils.lerp(wAnchorDreamcore, nDreamcore, farBlend);
  let terrorcore = THREE.MathUtils.lerp(wAnchorTerrorcore, nTerrorcore, farBlend);

  const sum = meadow + conifer + cave + sea + liminal + dreamcore + terrorcore;
  meadow /= sum;
  conifer /= sum;
  cave /= sum;
  sea /= sum;
  liminal /= sum;
  dreamcore /= sum;
  terrorcore /= sum;

  const scores = [
    ["meadow", meadow],
    ["conifer", conifer],
    ["cave", cave],
    ["sea", sea],
    ["liminal", liminal],
    ["dreamcore", dreamcore],
    ["terrorcore", terrorcore],
  ];
  let dominant = "meadow";
  let best = -1;
  for (const [name, val] of scores) {
    if (val > best) {
      best = val;
      dominant = name;
    }
  }

  return { meadow, conifer, cave, sea, liminal, dreamcore, terrorcore, dominant };
}

// Meandering river mask [0..1] for meadow & conifer biomes.
export function getRiverMask(x, z) {
  if (Math.hypot(x, z) < 12 || Math.hypot(x - 160, z) < 12) return 0;

  const streamCenterZ = -26 + Math.sin(x * 0.045) * 6.5 + Math.cos(x * 0.018) * 4.0;
  const distStream = Math.abs(z - streamCenterZ);
  const scenicStream = 1.0 - smoothstep(2.8, 7.2, distStream);

  const warpX = x + fbm(x * 0.015, z * 0.015, 2, CONFIG.WORLD_SEED + 313) * 18.0;
  const warpZ = z + fbm(x * 0.015 + 31, z * 0.015 - 19, 2, CONFIG.WORLD_SEED + 617) * 18.0;
  const ridge = Math.abs(valueNoise2D(warpX * 0.014, warpZ * 0.014, CONFIG.WORLD_SEED + 881) - 0.5) * 2.0;
  const noiseRiver = 1.0 - smoothstep(0.035, 0.095, ridge);

  return Math.max(scenicStream, noiseRiver);
}

// Occasional calm pond/lake basin mask [0..1] for meadow & conifer biomes.
export function getLakeMask(x, z) {
  if (Math.hypot(x, z) < 15 || Math.hypot(x - 160, z) < 15) return 0;
  const n = valueNoise2D(x * 0.022 + 4.2, z * 0.022 - 8.7, CONFIG.WORLD_SEED + 2029);
  return smoothstep(0.70, 0.80, n);
}

// Combined land water-carving mask [0..1] for meadow and conifer.
export function getWaterMask(x, z, weights = getBiomeWeights(x, z)) {
  const landWaterWeight = weights.meadow + weights.conifer;
  if (landWaterWeight < 0.25) return 0;
  return Math.max(getRiverMask(x, z), getLakeMask(x, z)) * smoothstep(0.25, 0.65, landWaterWeight);
}

// Evaluable heightfield for terrain, player physics, water features, and figure placement.
export function getTerrainHeight(x, z) {
  const w = getBiomeWeights(x, z);

  // 1. Meadow: gentle rolling hills cleanly above water level.
  const meadowRaw =
    2.2 +
    fbm(x * 0.019, z * 0.019, 4, CONFIG.WORLD_SEED) * 2.3 +
    fbm(x * 0.075, z * 0.075, 2, CONFIG.WORLD_SEED + 7919) * 0.28;
  const spawnEase = 1 - Math.exp(-(x * x + z * z) / 220);
  const meadowH = THREE.MathUtils.lerp(1.4, meadowRaw, 0.35 + 0.65 * spawnEase);

  // 2. Conifer forest: taller alpine ridges.
  const coniferH =
    3.6 +
    fbm(x * 0.022 + 5.1, z * 0.022 - 3.3, 4, CONFIG.WORLD_SEED + 331) * 3.4 +
    fbm(x * 0.08, z * 0.08, 2, CONFIG.WORLD_SEED + 991) * 0.4;

  // 3. Cave floor: damp undulating cavern floor with shallow mineral pools.
  const caveFloorRaw =
    1.15 +
    fbm(x * 0.045, z * 0.045, 3, CONFIG.WORLD_SEED + 4409) * 1.15;
  const cavePool = smoothstep(0.68, 0.80, valueNoise2D(x * 0.055, z * 0.055, CONFIG.WORLD_SEED + 4517));
  const caveH = caveFloorRaw - cavePool * 1.55;

  // 4. Sea: sandy shoreline sloping cleanly below WATER_LEVEL (0.0) to -7.5..-10.5m seabed.
  const shoreLineX = -134 + Math.sin(z * 0.04) * 5.0;
  const seaSlope = smoothstep(shoreLineX + 18, shoreLineX - 28, x);
  const seabedUndulation = fbm(x * 0.04, z * 0.04, 3, CONFIG.WORLD_SEED + 7717) * 1.8;
  const seaH = THREE.MathUtils.lerp(1.8, -8.2 + seabedUndulation, seaSlope);

  // 5. Liminal: flat commercial carpet floor at y=1.0 with occasional sunken poolroom basins.
  const poolCellX = Math.floor((x + 12) / 24);
  const poolCellZ = Math.floor((z + 12) / 24);
  const isPoolCell =
    Math.hypot(x, z + 170) > 16 &&
    hashCoords(poolCellX, poolCellZ, CONFIG.WORLD_SEED + 6101) % 7 === 0 &&
    Math.abs(x - poolCellX * 24) < 5.5 &&
    Math.abs(z - poolCellZ * 24) < 5.5;
  const liminalH = isPoolCell ? -1.1 : 1.0;

  // 6. Dreamcore: soft dreamy rolling pastel hills with shallow reflective pastel ponds.
  const dreamRaw =
    2.3 +
    fbm(x * 0.021 - 8.2, z * 0.021 + 4.4, 3, CONFIG.WORLD_SEED + 8209) * 2.2;
  const dreamPool = smoothstep(0.72, 0.82, valueNoise2D(x * 0.028, z * 0.028, CONFIG.WORLD_SEED + 8291));
  const dreamSpawnEase = 1 - Math.exp(-((x - 150) * (x - 150) + (z + 150) * (z + 150)) / 240);
  const dreamcoreH = THREE.MathUtils.lerp(1.8, dreamRaw - dreamPool * 2.9, 0.4 + 0.6 * dreamSpawnEase);

  // 7. Terrorcore: jagged dark ash ridges with sunken crimson pools.
  const terrorRaw =
    2.4 +
    Math.abs(fbm(x * 0.032 + 3.1, z * 0.032 - 6.8, 4, CONFIG.WORLD_SEED + 9311)) * 3.1;
  const terrorPool = smoothstep(0.69, 0.79, valueNoise2D(x * 0.036, z * 0.036, CONFIG.WORLD_SEED + 9403));
  const terrorSpawnEase = 1 - Math.exp(-((x + 150) * (x + 150) + (z - 150) * (z - 150)) / 220);
  const terrorcoreH = THREE.MathUtils.lerp(1.7, terrorRaw - terrorPool * 3.3, 0.4 + 0.6 * terrorSpawnEase);

  let h =
    meadowH * w.meadow +
    coniferH * w.conifer +
    caveH * w.cave +
    seaH * w.sea +
    liminalH * w.liminal +
    dreamcoreH * w.dreamcore +
    terrorcoreH * w.terrorcore;

  // Carve rivers and ponds/lakes in meadow & conifer below WATER_LEVEL.
  const river = getRiverMask(x, z);
  const lake = getLakeMask(x, z);
  const landWater = Math.max(river, lake) * smoothstep(0.25, 0.7, w.meadow + w.conifer);
  if (landWater > 0.001) {
    const bedDepth = -1.65 - lake * 0.85;
    h = THREE.MathUtils.lerp(h, bedDepth, landWater);
  }

  return h;
}

// Vaulted cavern ceiling height for the Cave biome.
// Alternates between tall cathedral caverns (~12-14m) and tight oppressive tunnels (~4.0-5.5m).
export function getCaveCeilingHeight(x, z) {
  const floor = getTerrainHeight(x, z);
  const chamberRaw = valueNoise2D(x * 0.018 + 7.3, z * 0.018 - 13.7, CONFIG.WORLD_SEED + 5471);
  const chamberMask = smoothstep(0.28, 0.74, chamberRaw);
  const baseHeight = THREE.MathUtils.lerp(4.4, 13.2, chamberMask);
  const detail = fbm(x * 0.055 + 11.3, z * 0.055 - 7.1, 3, CONFIG.WORLD_SEED + 5501) * 1.4;
  const distCaveCenter = Math.hypot(x, z - 160);
  const perimeterArch = smoothstep(58, 105, distCaveCenter) * 4.2;
  return Math.max(floor + 3.8, floor + baseHeight + detail - perimeterArch);
}

// Indoor acoustic drop-ceiling height for Liminal Spaces (varies subtly by zone; safe with 0 args).
export function getLiminalCeilingHeight(x, z) {
  if (x === undefined || z === undefined) return 4.6;
  if (Math.hypot(x, z + 170) < 16) return 4.6;
  const size = CONFIG.CHUNK_SIZE;
  const cellX = Math.floor((x + size * 0.5) / size);
  const cellZ = Math.floor((z + size * 0.5) / size);
  const h = (hashCoords(cellX, cellZ, CONFIG.WORLD_SEED + 6217) % 100) / 100;
  if (h < 0.22) return 3.4; // oppressive narrow/low passage
  if (h > 0.87) return 7.0; // rare eerie atrium
  return 4.6; // standard fluorescent corridor
}

// Central-difference terrain normal stored into outVec.
export function getTerrainNormal(x, z, outVec = new THREE.Vector3()) {
  const eps = 0.5;
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);
  return outVec.set(hL - hR, 2 * eps, hD - hU).normalize();
}

// Surface material type for player footstep sound selection.
export function getSurfaceType(x, z, footY = getTerrainHeight(x, z)) {
  const groundY = getTerrainHeight(x, z);
  if (groundY < CONFIG.WATER_LEVEL - 0.08 && footY <= CONFIG.WATER_LEVEL + 0.25) {
    return "water";
  }
  const w = getBiomeWeights(x, z);
  if (w.dominant === "liminal") return "carpet";
  if (w.dominant === "cave" || w.dominant === "terrorcore") return "stone";
  if (w.dominant === "sea" || (groundY < CONFIG.WATER_LEVEL + 0.55 && w.sea > 0.2)) return "sand";
  if (w.dominant === "conifer") return "forest";
  return "grass";
}

// Slow meadow variation in [0, 1] for painterly grass/flower palettes.
export function getMeadowBiome(x, z) {
  return valueNoise2D(x * 0.032 + 17.3, z * 0.032 - 9.1, CONFIG.WORLD_SEED + 4242);
}
