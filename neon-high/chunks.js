import * as THREE from "three";
import { SplatMesh, dyno } from "@sparkjsdev/spark";
import { CONFIG } from "./config.js";
import {
  hashCoords,
  createRng,
  valueNoise2D,
  getBiomeWeights,
  getTerrainHeight,
  getCaveCeilingHeight,
  getLiminalCeilingHeight,
  getTerrainNormal,
  getMeadowBiome,
} from "./terrain.js";

// Shared GPU uniforms updated once per frame for all chunks.
const uTime = dyno.dynoFloat(0);
const uWindStrength = dyno.dynoFloat(CONFIG.WIND_STRENGTH);
const uTint = dyno.dynoVec3(new THREE.Vector3(1, 1, 1));
const uAmbient = dyno.dynoVec3(new THREE.Vector3(0.05, 0.06, 0.06));
const uFogColor = dyno.dynoVec3(new THREE.Vector3(0.68, 0.84, 0.94));
const uPlayerXZ = dyno.dynoVec2(new THREE.Vector2(0, 0));
const uFogStart = dyno.dynoFloat(CONFIG.FOG_START);
const uFogEnd = dyno.dynoFloat(CONFIG.FOG_END);
const uUnderwater = dyno.dynoFloat(0);
const uSunDir = dyno.dynoVec3(new THREE.Vector3(0.4, 0.8, -0.4).normalize());
const uCamPos = dyno.dynoVec3(new THREE.Vector3(0, 2, 0));
const uFlashlightPos = dyno.dynoVec3(new THREE.Vector3(0, 2, 0));
const uFlashlightDir = dyno.dynoVec3(new THREE.Vector3(0, 0, -1));
const uFlashlightOn = dyno.dynoFloat(0);
const uFlashlightColor = dyno.dynoVec3(new THREE.Vector3(1.0, 0.95, 0.85));
const uHorrorFlicker = dyno.dynoFloat(1.0);

const BASE_LOD_SETTINGS = [
  {
    groundGrid: 42,
    groundScale: [0.38, 0.08, 0.38],
    waterGrid: 24,
    waterScale: [0.68, 0.04, 0.68],
    ceilingGrid: 24,
    ceilingScale: [0.76, 0.24, 0.76],
    rockSplats: 40,
    trunkSplats: 130,
    foliageSplats: 480,
    foliageScale: [0.24, 0.18, 0.24],
    pineTrunkSplats: 68,
    pineFoliageSplats: 360,
    grassCount: 6200,
    grassScale: [0.025, 0.17, 0.025],
    coniferGrassCount: 3200,
    speleothemSplats: 22,
    crystalSplats: 26,
    coralSplats: 28,
    kelpStalks: 22,
    kelpSegs: 11,
    wellDetail: 2,
    wallStep: 0.42,
    dreamGrassCount: 4400,
    terrorAshCount: 2200,
  },
  {
    groundGrid: 26,
    groundScale: [0.60, 0.13, 0.60],
    waterGrid: 16,
    waterScale: [1.02, 0.06, 1.02],
    ceilingGrid: 16,
    ceilingScale: [1.14, 0.30, 1.14],
    rockSplats: 15,
    trunkSplats: 46,
    foliageSplats: 175,
    foliageScale: [0.36, 0.26, 0.36],
    pineTrunkSplats: 24,
    pineFoliageSplats: 135,
    grassCount: 1900,
    grassScale: [0.052, 0.22, 0.052],
    coniferGrassCount: 1050,
    speleothemSplats: 10,
    crystalSplats: 12,
    coralSplats: 12,
    kelpStalks: 12,
    kelpSegs: 6,
    wellDetail: 1,
    wallStep: 0.68,
    dreamGrassCount: 1400,
    terrorAshCount: 750,
  },
  {
    groundGrid: 17,
    groundScale: [0.92, 0.18, 0.92],
    waterGrid: 11,
    waterScale: [1.48, 0.08, 1.48],
    ceilingGrid: 10,
    ceilingScale: [1.75, 0.42, 1.75],
    rockSplats: 6,
    trunkSplats: 26,
    foliageSplats: 68,
    foliageScale: [0.55, 0.40, 0.55],
    pineTrunkSplats: 12,
    pineFoliageSplats: 52,
    grassCount: 520,
    grassScale: [0.11, 0.26, 0.11],
    coniferGrassCount: 300,
    speleothemSplats: 4,
    crystalSplats: 5,
    coralSplats: 5,
    kelpStalks: 6,
    kelpSegs: 3,
    wellDetail: 0,
    wallStep: 1.05,
    dreamGrassCount: 400,
    terrorAshCount: 220,
  },
];

function getEffectiveLodConfig(lod) {
  const b = BASE_LOD_SETTINGS[lod];
  const baseD = CONFIG.DENSITY_SCALE || 1.0;
  // Concentrate extra splat detail in near/mid chunks so full horizon remains loaded under budget.
  const lodWeight = lod === 0 ? 1.0 : lod === 1 ? 0.65 : 0.35;
  const d = 1.0 + (baseD - 1.0) * lodWeight;
  const s = CONFIG.SPLAT_SIZE_SCALE || 1.0;
  const rootD = Math.sqrt(d);
  const scaleFactor = s / Math.pow(d, 0.22);

  return {
    groundGrid: Math.round(b.groundGrid * rootD),
    groundScale: b.groundScale.map((v) => v * scaleFactor),
    waterGrid: Math.round(b.waterGrid * rootD),
    waterScale: b.waterScale.map((v) => v * scaleFactor),
    ceilingGrid: Math.round(b.ceilingGrid * rootD),
    ceilingScale: b.ceilingScale.map((v) => v * scaleFactor),
    rockSplats: Math.round(b.rockSplats * d),
    trunkSplats: Math.round(b.trunkSplats * d),
    foliageSplats: Math.round(b.foliageSplats * d),
    foliageScale: b.foliageScale.map((v) => v * s),
    pineTrunkSplats: Math.round(b.pineTrunkSplats * d),
    pineFoliageSplats: Math.round(b.pineFoliageSplats * d),
    grassCount: Math.round(b.grassCount * d),
    grassScale: [b.grassScale[0] * s, b.grassScale[1], b.grassScale[2] * s],
    coniferGrassCount: Math.round(b.coniferGrassCount * d),
    speleothemSplats: Math.round(b.speleothemSplats * d),
    crystalSplats: Math.round(b.crystalSplats * d),
    coralSplats: Math.round(b.coralSplats * d),
    kelpStalks: Math.round(b.kelpStalks * rootD),
    kelpSegs: b.kelpSegs,
    wellDetail: b.wellDetail,
    wallStep: Math.max(0.22, b.wallStep / Math.pow(d, 0.35)),
    dreamGrassCount: Math.round(b.dreamGrassCount * d),
    terrorAshCount: Math.round(b.terrorAshCount * d),
  };
}

function createChunkModifier(chunkOriginVec2, grassStart, foliageStart, waterStart) {
  const uChunkOrigin = dyno.dynoVec2(chunkOriginVec2);
  const uGrassStart = dyno.dynoInt(grassStart);
  const uFoliageStart = dyno.dynoInt(foliageStart);
  const uWaterStart = dyno.dynoInt(waterStart);

  return dyno.dynoBlock(
    { gsplat: dyno.Gsplat },
    { gsplat: dyno.Gsplat },
    ({ gsplat }) => {
      const d = new dyno.Dyno({
        inTypes: {
          gsplat: dyno.Gsplat,
          time: "float",
          windStrength: "float",
          tint: "vec3",
          ambient: "vec3",
          fogColor: "vec3",
          playerXZ: "vec2",
          fogStart: "float",
          fogEnd: "float",
          underwater: "float",
          sunDir: "vec3",
          camPos: "vec3",
          flashlightPos: "vec3",
          flashlightDir: "vec3",
          flashlightOn: "float",
          flashlightColor: "vec3",
          horrorFlicker: "float",
          chunkOrigin: "vec2",
          grassStart: "int",
          foliageStart: "int",
          waterStart: "int",
        },
        outTypes: { gsplat: dyno.Gsplat },
        globals: () => [
          dyno.unindent(`
            vec4 gw_quatMul(vec4 q1, vec4 q2) {
              return vec4(
                q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
                q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
                q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,
                q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z
              );
            }
            vec4 gw_axisAngle(vec3 axis, float angle) {
              float halfA = angle * 0.5;
              return vec4(axis * sin(halfA), cos(halfA));
            }
            vec3 gw_quatRotY(vec4 q) {
              return vec3(
                2.0 * (q.x * q.y - q.w * q.z),
                1.0 - 2.0 * (q.x * q.x + q.z * q.z),
                2.0 * (q.y * q.z + q.w * q.x)
              );
            }
          `),
        ],
        statements: ({ inputs, outputs }) =>
          dyno.unindentLines(`
            ${outputs.gsplat} = ${inputs.gsplat};
            vec3 pos = ${inputs.gsplat}.center;
            vec2 wXZ = pos.xz + ${inputs.chunkOrigin};
            vec3 worldPos = vec3(wXZ.x, pos.y, wXZ.y);
            vec3 baseRgb = ${inputs.gsplat}.rgba.rgb;
            int idx = ${inputs.gsplat}.index;
            float t = ${inputs.time};
            vec3 sunD = normalize(${inputs.sunDir});
            float isSoftFoliage = 0.0;
            float waterSpec = 0.0;

            if (idx >= ${inputs.grassStart} && idx < ${inputs.foliageStart}) {
              isSoftFoliage = 1.0;
              float gust = sin(wXZ.x * 0.16 - t * 2.1 + sin(wXZ.y * 0.11 + t * 0.7))
                         + 0.45 * sin(wXZ.x * 0.37 + wXZ.y * 0.29 - t * 3.4);
              float flutter = 0.22 * sin(float(idx) * 0.73 + t * 5.2);
              float sway = (gust * 0.55 + 0.35 + flutter) * ${inputs.windStrength};
              ${outputs.gsplat}.center.x += sway * 0.11;
              ${outputs.gsplat}.center.z += sway * 0.045;
              ${outputs.gsplat}.center.y -= abs(sway) * 0.018;
              vec4 tiltQ = gw_axisAngle(normalize(vec3(-0.35, 0.0, 0.94)), sway * 0.34);
              ${outputs.gsplat}.quaternion = gw_quatMul(tiltQ, ${inputs.gsplat}.quaternion);
            } else if (idx >= ${inputs.foliageStart} && idx < ${inputs.waterStart}) {
              isSoftFoliage = 1.0;
              float canopy = sin(wXZ.x * 0.14 + wXZ.y * 0.12 - t * 1.45) * 0.095;
              float leaf = sin(float(idx) * 1.13 + t * 4.1) * 0.045;
              float w = ${inputs.windStrength};
              ${outputs.gsplat}.center.x += (canopy + leaf) * w;
              ${outputs.gsplat}.center.z += (canopy * 0.5 - leaf * 0.6) * w;
              ${outputs.gsplat}.center.y += sin(float(idx) * 0.51 + t * 3.2) * 0.025 * w;
              vec4 leafQ = gw_axisAngle(vec3(0.0, 0.0, 1.0), (canopy + leaf) * 1.4 * w);
              ${outputs.gsplat}.quaternion = gw_quatMul(leafQ, ${inputs.gsplat}.quaternion);
            } else if (idx >= ${inputs.waterStart}) {
              float wave = sin(wXZ.x * 0.45 + t * 1.8) * cos(wXZ.y * 0.38 - t * 1.35) * 0.075
                         + sin(wXZ.x * 0.9 - wXZ.y * 0.7 + t * 2.6) * 0.03;
              ${outputs.gsplat}.center.y += wave;
              worldPos.y += wave;
              float shimmer = 0.06 * sin(wXZ.x * 0.8 + wXZ.y * 0.6 + t * 2.4);
              ${outputs.gsplat}.rgba.rgb += vec3(shimmer * 0.6, shimmer * 0.9, shimmer);
              vec3 toCam = ${inputs.camPos} - worldPos;
              vec3 V = toCam / max(length(toCam), 0.001);
              vec3 N = normalize(vec3(cos(wXZ.x * 0.45 + t * 1.8) * 0.12, 1.0, sin(wXZ.y * 0.38 - t * 1.35) * 0.12));
              vec3 R = reflect(-V, N);
              waterSpec = pow(max(dot(R, sunD), 0.0), 26.0) * 0.85;
            }

            vec4 q = ${outputs.gsplat}.quaternion;
            float ndlRaw = clamp(dot(normalize(gw_quatRotY(q)), sunD) * 0.42 + 0.68, 0.42, 1.18);
            float ndl = mix(ndlRaw, mix(1.0, ndlRaw, 0.50), isSoftFoliage);

            vec3 lit = ${outputs.gsplat}.rgba.rgb * ${inputs.tint} * ndl + ${inputs.ambient};
            lit += vec3(waterSpec);

            if (${inputs.horrorFlicker} < 0.99 && pos.y > 3.2 && baseRgb.r > 0.85 && baseRgb.g > 0.85) {
              lit *= ${inputs.horrorFlicker};
            }

            if (${inputs.flashlightOn} > 0.01) {
              vec3 toSplat = worldPos - ${inputs.flashlightPos};
              float dL = length(toSplat);
              float cone = smoothstep(0.76, 0.96, dot(toSplat / max(dL, 0.001), normalize(${inputs.flashlightDir})));
              float atten = cone / (1.0 + dL * dL * 0.014);
              lit += baseRgb * ${inputs.flashlightColor} * atten * 2.4 * ${inputs.flashlightOn};
            }

            if (${inputs.underwater} > 0.01 && pos.y < 0.1) {
              float caustic = 0.5 + 0.5 * sin(wXZ.x * 0.75 + t * 2.2) * cos(wXZ.y * 0.75 - t * 1.9);
              lit += vec3(0.03, 0.11, 0.14) * caustic * ${inputs.underwater};
            }
            float dist = length(wXZ - ${inputs.playerXZ});
            float fogT = smoothstep(${inputs.fogStart}, ${inputs.fogEnd}, dist);
            ${outputs.gsplat}.rgba.rgb = mix(lit, ${inputs.fogColor}, fogT * 0.92);
            ${outputs.gsplat}.rgba.a *= 1.0 - smoothstep(${inputs.fogEnd} - 6.0, ${inputs.fogEnd} + 2.0, dist);
          `),
      });

      return {
        gsplat: d.apply({
          gsplat,
          time: uTime,
          windStrength: uWindStrength,
          tint: uTint,
          ambient: uAmbient,
          fogColor: uFogColor,
          playerXZ: uPlayerXZ,
          fogStart: uFogStart,
          fogEnd: uFogEnd,
          underwater: uUnderwater,
          sunDir: uSunDir,
          camPos: uCamPos,
          flashlightPos: uFlashlightPos,
          flashlightDir: uFlashlightDir,
          flashlightOn: uFlashlightOn,
          flashlightColor: uFlashlightColor,
          horrorFlicker: uHorrorFlicker,
          chunkOrigin: uChunkOrigin,
          grassStart: uGrassStart,
          foliageStart: uFoliageStart,
          waterStart: uWaterStart,
        }).gsplat,
      };
    }
  );
}

// Deciduous / Dreamcore / Dead tree L-system skeleton.
function generateBranchTree(lx, wy, lz, rng, scale, dead = false) {
  const segments = [];
  const leafAnchors = [];

  const trunkH = (dead ? 3.8 + rng() * 2.4 : 2.8 + rng() * 1.6) * scale;
  const leanX = (rng() - 0.5) * (dead ? 1.45 : 0.45);
  const leanZ = (rng() - 0.5) * (dead ? 1.45 : 0.45);
  const twistX = dead ? (rng() - 0.5) * 0.75 : 0;
  const twistZ = dead ? (rng() - 0.5) * 0.75 : 0;
  const p0 = new THREE.Vector3(lx, wy - 0.15, lz);
  const pMid = new THREE.Vector3(lx + leanX * 0.5 + twistX, wy + trunkH * 0.52, lz + leanZ * 0.5 + twistZ);
  const pTop = new THREE.Vector3(lx + leanX, wy + trunkH, lz + leanZ);

  segments.push({ a: p0, b: pMid, r0: 0.24 * scale, r1: 0.17 * scale });
  segments.push({ a: pMid, b: pTop, r0: 0.17 * scale, r1: 0.10 * scale });

  const branchCount = 4 + Math.floor(rng() * 2);
  const baseAngle = rng() * Math.PI * 2;
  for (let b = 0; b < branchCount; b++) {
    const az = baseAngle + (b / branchCount) * Math.PI * 2 + (rng() - 0.5) * 0.45;
    const pitch = dead ? 0.35 + rng() * 0.75 : 0.45 + rng() * 0.4;
    const len = (1.5 + rng() * 0.9) * scale;
    const startT = 0.65 + (b % 2) * 0.3;
    const start = new THREE.Vector3().lerpVectors(pMid, pTop, startT);
    const dir = new THREE.Vector3(
      Math.cos(az) * Math.cos(pitch),
      Math.sin(pitch),
      Math.sin(az) * Math.cos(pitch)
    ).normalize();
    const end = start.clone().addScaledVector(dir, len);
    segments.push({ a: start, b: end, r0: 0.095 * scale, r1: 0.045 * scale });
    leafAnchors.push({ pos: end.clone(), radius: (1.05 + rng() * 0.4) * scale });

    for (let t = 0; t < 2; t++) {
      const subAz = az + (t === 0 ? -0.65 : 0.65) + (rng() - 0.5) * 0.25;
      const subPitch = dead ? 0.5 + rng() * 0.6 : 0.3 + rng() * 0.45;
      const subLen = (0.85 + rng() * 0.5) * scale;
      const subStart = new THREE.Vector3().lerpVectors(start, end, 0.6 + t * 0.25);
      const subEnd = subStart.clone().add(
        new THREE.Vector3(
          Math.cos(subAz) * Math.cos(subPitch) * subLen,
          Math.sin(subPitch) * subLen,
          Math.sin(subAz) * Math.cos(subPitch) * subLen
        )
      );
      segments.push({ a: subStart, b: subEnd, r0: 0.048 * scale, r1: 0.022 * scale });
      leafAnchors.push({ pos: subEnd, radius: (0.82 + rng() * 0.35) * scale });
    }
  }
  leafAnchors.push({ pos: pTop.clone().add(new THREE.Vector3(0, 0.55 * scale, 0)), radius: 1.2 * scale });
  return { segments, leafAnchors };
}

function generateConiferTree(lx, wy, lz, rng, scale) {
  const gnarled = rng() < 0.38;
  const height = (gnarled ? 5.2 + rng() * 2.8 : 7.0 + rng() * 3.8) * scale;
  const baseRadius = (gnarled ? 1.75 + rng() * 0.65 : 1.45 + rng() * 0.5) * scale;
  const leanX = (rng() - 0.5) * (gnarled ? 1.15 : 0.22);
  const leanZ = (rng() - 0.5) * (gnarled ? 1.15 : 0.22);
  const bendX = gnarled ? (rng() - 0.5) * 0.65 : 0;
  const bendZ = gnarled ? (rng() - 0.5) * 0.65 : 0;
  const tierFreq = 4.8 + rng() * 2.6;
  const asymX = gnarled ? 0.8 + rng() * 0.4 : 1.0;
  const asymZ = gnarled ? 0.8 + rng() * 0.4 : 1.0;
  return { lx, wy, lz, height, baseRadius, leanX, leanZ, bendX, bendZ, tierFreq, asymX, asymZ, gnarled };
}

function pushRockCluster(splats, lx, y, lz, radius, count, shade, baseColor, rng, center, scales, quat, color) {
  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(rng());
    const r = radius * (0.42 + rng() * 0.58);
    center.set(
      lx + Math.sin(phi) * Math.cos(theta) * r,
      y + Math.cos(phi) * r * 0.66,
      lz + Math.sin(phi) * Math.sin(theta) * r
    );
    const s = (radius / Math.cbrt(Math.max(1, count))) * (1.28 + rng() * 0.5);
    scales.set(s * 1.2, s * 0.85, s * 1.1);
    quat.setFromEuler(new THREE.Euler(rng() * 1.5, rng() * 3.14, rng() * 1.5));
    const moss = rng() > 0.72 ? 0.06 : 0;
    const v = (0.85 + rng() * 0.3) * shade;
    color.setRGB(
      THREE.MathUtils.clamp(baseColor[0] * v, 0.04, 0.95),
      THREE.MathUtils.clamp(baseColor[1] * v + moss, 0.04, 0.95),
      THREE.MathUtils.clamp(baseColor[2] * v, 0.04, 0.95)
    );
    splats.pushSplat(center, scales, quat, 0.96, color);
  }
}

function pushWellStructure(splats, lx, y, lz, detail, rng, center, scales, quat, color) {
  const ringCount = detail === 2 ? 28 : detail === 1 ? 14 : 8;
  const layers = detail === 2 ? 3 : detail === 1 ? 2 : 1;
  const r = 0.85;

  for (let layer = 0; layer < layers; layer++) {
    const py = y + 0.14 + (layer / Math.max(1, layers)) * 0.72;
    for (let i = 0; i < ringCount; i++) {
      const a = (i / ringCount) * Math.PI * 2 + layer * 0.25;
      center.set(lx + Math.cos(a) * r, py, lz + Math.sin(a) * r);
      const s = detail === 2 ? 0.18 : detail === 1 ? 0.25 : 0.34;
      scales.set(s * 1.15, s * 0.85, s);
      quat.setFromEuler(new THREE.Euler(rng() * 0.2, a, rng() * 0.2));
      const g = 0.36 + rng() * 0.14;
      color.setRGB(g * 0.95, g * (rng() > 0.7 ? 1.06 : 0.96), g * 0.92);
      splats.pushSplat(center, scales, quat, 0.97, color);
    }
  }

  const postSegs = detail === 2 ? 7 : detail === 1 ? 4 : 2;
  for (const side of [-1, 1]) {
    for (let i = 0; i < postSegs; i++) {
      const t = (i + 0.5) / postSegs;
      center.set(lx + side * (r + 0.04), y + 0.8 + t * 1.35, lz);
      scales.set(0.08, 0.24, 0.08);
      quat.identity();
      color.setRGB(0.36, 0.22, 0.12);
      splats.pushSplat(center, scales, quat, 0.97, color);
    }
  }

  const roofCount = detail === 2 ? 24 : detail === 1 ? 10 : 5;
  for (let i = 0; i < roofCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const u = rng();
    const v = (rng() - 0.5) * 1.65;
    center.set(lx + side * u * 1.05, y + 2.55 - u * 0.48, lz + v);
    scales.set(0.26, 0.07, 0.34);
    quat.setFromEuler(new THREE.Euler(0, 0, -side * 0.42));
    const c = 0.78 + rng() * 0.25;
    color.setRGB(0.42 * c, 0.25 * c, 0.15 * c);
    splats.pushSplat(center, scales, quat, 0.96, color);
  }
}

function pushFloatingEye(splats, lx, y, lz, radius, irisColor, glowHalo, center, scales, quat, color) {
  quat.identity();
  // Sclera sphere
  const count = 18;
  for (let i = 0; i < count; i++) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    center.set(
      lx + Math.sin(phi) * Math.cos(theta) * radius * 0.55,
      y + Math.cos(phi) * radius * 0.45,
      lz + Math.sin(phi) * Math.sin(theta) * radius * 0.55
    );
    scales.set(radius * 0.42, radius * 0.35, radius * 0.42);
    color.setRGB(0.95, 0.94, 0.96);
    splats.pushSplat(center, scales, quat, 0.96, color);
  }
  // Iris & pupil facing toward spawn / viewer axis (+Z and -Z so visible from both sides)
  for (const dirZ of [-1, 1]) {
    center.set(lx, y, lz + dirZ * radius * 0.52);
    scales.set(radius * 0.26, radius * 0.26, radius * 0.12);
    color.setRGB(irisColor[0], irisColor[1], irisColor[2]);
    splats.pushSplat(center, scales, quat, 0.98, color);

    center.set(lx, y, lz + dirZ * radius * 0.60);
    scales.set(radius * 0.11, radius * 0.14, radius * 0.09);
    color.setRGB(0.04, 0.02, 0.05);
    splats.pushSplat(center, scales, quat, 0.99, color);
  }
  if (glowHalo) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      center.set(lx + Math.cos(a) * radius * 1.15, y + radius * 0.5 + Math.sin(a) * 0.18, lz + Math.sin(a) * radius * 1.15);
      scales.set(0.16, 0.06, 0.16);
      color.setRGB(1.0, 0.92, 0.68);
      splats.pushSplat(center, scales, quat, 0.9, color);
    }
  }
}

function buildChunkData(cx, cz, lod) {
  const cfg = getEffectiveLodConfig(lod);
  const size = CONFIG.CHUNK_SIZE;
  const half = size * 0.5;
  const originX = cx * size;
  const originZ = cz * size;

  const wCenter = getBiomeWeights(originX, originZ);
  const dominant = wCenter.dominant;

  const rngGround = createRng(hashCoords(cx, cz, CONFIG.WORLD_SEED + 11));
  const rngFeatures = createRng(hashCoords(cx, cz, CONFIG.WORLD_SEED + 29));
  const rngGrass = createRng(hashCoords(cx, cz, CONFIG.WORLD_SEED + 53));
  const rngCanopy = createRng(hashCoords(cx, cz, CONFIG.WORLD_SEED + 89));

  const rocks = [];
  const meadowTrees = [];
  const coniferTrees = [];
  const coniferLogs = [];
  const coniferStumps = [];
  const wells = [];
  const speleothems = [];
  const crystals = [];
  const corals = [];
  const kelpStalks = [];
  const liminalWalls = [];
  const liminalPillars = [];
  const liminalChairs = [];
  const liminalLamps = [];
  const liminalStairs = [];
  const liminalPortals = [];
  const liminalCeilY = dominant === "liminal" ? getLiminalCeilingHeight(originX, originZ) : 4.6;
  const dreamTrees = [];
  const dreamStairs = [];
  const dreamEyes = [];
  const dreamArches = [];
  const dreamClouds = [];
  const terrorTrees = [];
  const terrorSpires = [];
  const terrorRibs = [];
  const terrorEyes = [];

  if (dominant === "meadow" || dominant === "conifer") {
    const rockCount = 1 + Math.floor(rngFeatures() * 3);
    for (let i = 0; i < rockCount; i++) {
      const lx = (rngFeatures() - 0.5) * (size - 3.0);
      const lz = (rngFeatures() - 0.5) * (size - 3.0);
      const wx = originX + lx;
      const wz = originZ + lz;
      const gy = getTerrainHeight(wx, wz);
      const radius = 0.45 + rngFeatures() * 0.65;
      const shade = 0.8 + rngFeatures() * 0.35;
      if (wx * wx + wz * wz > 28 && Math.hypot(wx - 160, wz) > 28 && gy > CONFIG.WATER_LEVEL + 0.15) {
        rocks.push({ lx, lz, y: gy, radius, shade });
      }
    }

    if (dominant === "meadow") {
      const roll = rngFeatures();
      const treeCount = roll < 0.25 ? 0 : roll < 0.78 ? 1 : 2;
      for (let i = 0; i < treeCount; i++) {
        const lx = (rngFeatures() - 0.5) * (size - 5.5);
        const lz = (rngFeatures() - 0.5) * (size - 5.5);
        const wx = originX + lx;
        const wz = originZ + lz;
        const gy = getTerrainHeight(wx, wz);
        const scale = 0.85 + rngFeatures() * 0.45;
        const skel = generateBranchTree(lx, gy, lz, rngFeatures, scale, false);
        if (wx * wx + wz * wz > 42 && gy > CONFIG.WATER_LEVEL + 0.25) {
          meadowTrees.push(skel);
        }
      }
    } else {
      const pineCount = 2 + Math.floor(rngFeatures() * 2);
      for (let i = 0; i < pineCount; i++) {
        const lx = (rngFeatures() - 0.5) * (size - 4.5);
        const lz = (rngFeatures() - 0.5) * (size - 4.5);
        const wx = originX + lx;
        const wz = originZ + lz;
        const gy = getTerrainHeight(wx, wz);
        const scale = 0.88 + rngFeatures() * 0.42;
        const pine = generateConiferTree(lx, gy, lz, rngFeatures, scale);
        if (Math.hypot(wx - 160, wz) > 36 && gy > CONFIG.WATER_LEVEL + 0.25) {
          coniferTrees.push(pine);
        }
      }
      // Occasional mossy fallen logs & tree stumps.
      if (rngFeatures() < 0.72) {
        const lx = (rngFeatures() - 0.5) * (size - 6.0);
        const lz = (rngFeatures() - 0.5) * (size - 6.0);
        const wx = originX + lx;
        const wz = originZ + lz;
        const gy = getTerrainHeight(wx, wz);
        if (Math.hypot(wx - 160, wz) > 12 && gy > CONFIG.WATER_LEVEL + 0.25) {
          coniferLogs.push({
            lx,
            lz,
            y: gy,
            len: 2.3 + rngFeatures() * 1.9,
            radius: 0.22 + rngFeatures() * 0.11,
            yaw: rngFeatures() * Math.PI * 2,
          });
        }
      }
      const stumpCount = rngFeatures() < 0.65 ? 1 + Math.floor(rngFeatures() * 2) : 0;
      for (let i = 0; i < stumpCount; i++) {
        const lx = (rngFeatures() - 0.5) * (size - 4.0);
        const lz = (rngFeatures() - 0.5) * (size - 4.0);
        const wx = originX + lx;
        const wz = originZ + lz;
        const gy = getTerrainHeight(wx, wz);
        if (Math.hypot(wx - 160, wz) > 10 && gy > CONFIG.WATER_LEVEL + 0.2) {
          coniferStumps.push({
            lx,
            lz,
            y: gy,
            h: 0.42 + rngFeatures() * 0.46,
            radius: 0.26 + rngFeatures() * 0.14,
          });
        }
      }
    }

    const tryAddWell = (wx, wz) => {
      const lx = wx - originX;
      const lz = wz - originZ;
      if (lx >= -half && lx < half && lz >= -half && lz < half) {
        const gy = getTerrainHeight(wx, wz);
        if (gy > CONFIG.WATER_LEVEL + 0.35) wells.push({ lx, lz, y: gy });
      }
    };
    tryAddWell(10, -14);
    tryAddWell(170, -14);
    if (rngFeatures() < 0.18) {
      const lx = (rngFeatures() - 0.5) * (size - 7);
      const lz = (rngFeatures() - 0.5) * (size - 7);
      const wx = originX + lx;
      const wz = originZ + lz;
      const gy = getTerrainHeight(wx, wz);
      if (gy > CONFIG.WATER_LEVEL + 0.4 && Math.hypot(wx, wz) > 12 && Math.hypot(wx - 160, wz) > 12) {
        wells.push({ lx, lz, y: gy });
      }
    }
  } else if (dominant === "cave") {
    const count = 9 + Math.floor(rngFeatures() * 5);
    for (let i = 0; i < count; i++) {
      const lx = (rngFeatures() - 0.5) * (size - 2.5);
      const lz = (rngFeatures() - 0.5) * (size - 2.5);
      const wx = originX + lx;
      const wz = originZ + lz;
      const gy = getTerrainHeight(wx, wz);
      const cy = getCaveCeilingHeight(wx, wz);
      const isStalactite = rngFeatures() < 0.55;
      const clearance = cy - gy;
      const height = isStalactite && clearance > 9.0
        ? 1.5 + rngFeatures() * 3.8
        : 1.0 + rngFeatures() * 2.2;
      const baseR = 0.22 + rngFeatures() * 0.28;
      if (Math.hypot(wx, wz - 160) > 6 || !isStalactite) {
        if (clearance > height + 1.9) {
          speleothems.push({ lx, lz, y: isStalactite ? cy : gy, isStalactite, height, baseR });
        }
      }
    }

    const crystalCount = 4 + Math.floor(rngFeatures() * 3);
    for (let i = 0; i < crystalCount; i++) {
      const lx = (rngFeatures() - 0.5) * (size - 3.0);
      const lz = (rngFeatures() - 0.5) * (size - 3.0);
      const wx = originX + lx;
      const wz = originZ + lz;
      const gy = getTerrainHeight(wx, wz);
      const huePick = rngFeatures();
      if (gy > CONFIG.WATER_LEVEL + 0.05) {
        crystals.push({ lx, lz, y: gy, huePick, scale: 0.7 + rngFeatures() * 0.65 });
      }
    }
  } else if (dominant === "sea") {
    const coralCount = 4 + Math.floor(rngFeatures() * 3);
    for (let i = 0; i < coralCount; i++) {
      const lx = (rngFeatures() - 0.5) * (size - 3.0);
      const lz = (rngFeatures() - 0.5) * (size - 3.0);
      const wx = originX + lx;
      const wz = originZ + lz;
      const gy = getTerrainHeight(wx, wz);
      const kind = rngFeatures();
      if (gy < CONFIG.WATER_LEVEL - 1.2) {
        corals.push({ lx, lz, y: gy, kind, radius: 0.55 + rngFeatures() * 0.6 });
      }
    }

    for (let i = 0; i < cfg.kelpStalks; i++) {
      const lx = (rngFeatures() - 0.5) * (size - 1.5);
      const lz = (rngFeatures() - 0.5) * (size - 1.5);
      const wx = originX + lx;
      const wz = originZ + lz;
      const gy = getTerrainHeight(wx, wz);
      const maxKelpH = Math.max(0.4, -gy - 0.45);
      const h = Math.min(maxKelpH, 1.4 + rngFeatures() * 2.8);
      if (gy < CONFIG.WATER_LEVEL - 1.5 && maxKelpH > 0.6) {
        kelpStalks.push({ lx, lz, y: gy, h, phase: rngFeatures() * Math.PI * 2 });
      }
    }
  } else if (dominant === "liminal") {
    // Yellow-wallpapered Backrooms-like partition walls leaving wide hallways.
    const wallCandidates = [
      { lx: -6.5, lz: 0, halfW: 0.35, halfD: 5.5 },
      { lx: 6.5, lz: 0, halfW: 0.35, halfD: 5.5 },
      { lx: 0, lz: -7.5, halfW: 5.0, halfD: 0.35 },
    ];
    for (let i = 0; i < wallCandidates.length; i++) {
      if (rngFeatures() < 0.68) {
        const w = wallCandidates[i];
        const wx = originX + w.lx;
        const wz = originZ + w.lz;
        // Keep central liminal spawn (0, -170) and doorway (0, -178) unobstructed.
        if (Math.hypot(wx, wz + 170) > 6.5 && Math.hypot(wx, wz + 178) > 4.5) {
          liminalWalls.push(w);
        }
      }
    }

    // Square structural pillars breaking corridor openness.
    const pillarSpots = [
      { lx: -4.2, lz: -4.2 },
      { lx: 4.2, lz: 4.2 },
      { lx: -4.2, lz: 5.0 },
      { lx: 4.2, lz: -5.0 },
    ];
    for (let i = 0; i < pillarSpots.length; i++) {
      if (rngFeatures() < 0.42) {
        const ps = pillarSpots[i];
        const wx = originX + ps.lx;
        const wz = originZ + ps.lz;
        const gy = getTerrainHeight(wx, wz);
        if (gy > 0.5 && Math.hypot(wx, wz + 170) > 6.5 && Math.hypot(wx, wz + 178) > 4.5) {
          liminalPillars.push({ lx: ps.lx, lz: ps.lz, half: 0.46 });
        }
      }
    }

    // Lone wooden chairs ominously facing walls or corners.
    const chairCount = rngFeatures() < 0.62 ? (rngFeatures() < 0.35 ? 2 : 1) : 0;
    for (let i = 0; i < chairCount; i++) {
      const lx = (rngFeatures() - 0.5) * 14;
      const lz = (rngFeatures() - 0.5) * 14;
      const wx = originX + lx;
      const wz = originZ + lz;
      const gy = getTerrainHeight(wx, wz);
      if (gy > 0.5 && Math.hypot(wx, wz + 170) > 6.0 && Math.hypot(wx, wz + 178) > 4.2) {
        // Face outward toward nearest wall/corner.
        const yaw = Math.atan2(lx, lz);
        liminalChairs.push({ lx, lz, y: gy, yaw });
      }
    }

    // Hanging swaying fluorescent lamps (especially eerie in standard & tall atrium zones).
    if (liminalCeilY >= 4.2) {
      const lampCount = 1 + (rngFeatures() < 0.55 ? 1 : 0);
      for (let i = 0; i < lampCount; i++) {
        const lx = (rngFeatures() - 0.5) * 12;
        const lz = (rngFeatures() - 0.5) * 12;
        const drop = liminalCeilY > 6.0 ? 1.55 : 0.82;
        liminalLamps.push({
          lx,
          lz,
          ceilY: liminalCeilY,
          barY: Math.max(3.35, liminalCeilY - drop),
          alongZ: rngFeatures() < 0.5,
        });
      }
    }

    // Impossible upside-down or ceiling-terminating stairs.
    if (rngFeatures() < 0.65) {
      const lx = (rngFeatures() - 0.5) * 10;
      const lz = (rngFeatures() - 0.5) * 10;
      const wx = originX + lx;
      const wz = originZ + lz;
      if (Math.hypot(wx, wz + 170) > 5.5) {
        liminalStairs.push({ lx, lz, upsideDown: rngFeatures() < 0.55 });
      }
    }

    // Freestanding non-Euclidean portal doorway (guaranteed right ahead of liminal spawn at (0, -178)).
    const addPortal = (wx, wz, shiftX, shiftZ) => {
      const lx = wx - originX;
      const lz = wz - originZ;
      if (lx >= -half && lx < half && lz >= -half && lz < half) {
        liminalPortals.push({ lx, lz, wx, wz, shiftX, shiftZ });
      }
    };
    addPortal(0, -178, 24, 0);
    if (rngFeatures() < 0.35) {
      const lx = (rngFeatures() - 0.5) * 8;
      const lz = (rngFeatures() - 0.5) * 8;
      const wx = originX + lx;
      const wz = originZ + lz;
      if (Math.hypot(wx, wz + 170) > 10) {
        addPortal(wx, wz, rngFeatures() < 0.5 ? 24 : -24, 0);
      }
    }
  } else if (dominant === "dreamcore") {
    const treeCount = 1 + Math.floor(rngFeatures() * 2);
    for (let i = 0; i < treeCount; i++) {
      const lx = (rngFeatures() - 0.5) * (size - 5.0);
      const lz = (rngFeatures() - 0.5) * (size - 5.0);
      const wx = originX + lx;
      const wz = originZ + lz;
      const gy = getTerrainHeight(wx, wz);
      const skel = generateBranchTree(lx, gy, lz, rngFeatures, 0.95 + rngFeatures() * 0.45, false);
      if (Math.hypot(wx - 150, wz + 150) > 10 && gy > CONFIG.WATER_LEVEL + 0.3) {
        dreamTrees.push({ skel, tintPick: rngFeatures() });
      }
    }
    // Floating pastel staircase ascending into the sky.
    if (rngFeatures() < 0.55) {
      dreamStairs.push({
        lx: (rngFeatures() - 0.5) * 10,
        lz: (rngFeatures() - 0.5) * 10,
        baseY: 2.8 + rngFeatures() * 1.8,
        rot: rngFeatures() * Math.PI * 2,
      });
    }
    // Giant floating dreamcore eyes with halos.
    if (rngFeatures() < 0.72) {
      dreamEyes.push({
        lx: (rngFeatures() - 0.5) * 12,
        lz: (rngFeatures() - 0.5) * 12,
        y: 6.5 + rngFeatures() * 3.8,
        radius: 1.0 + rngFeatures() * 0.55,
      });
    }
    // Pastel checkerboard pillar arch.
    if (rngFeatures() < 0.45) {
      const lx = (rngFeatures() - 0.5) * 12;
      const lz = (rngFeatures() - 0.5) * 12;
      const wx = originX + lx;
      const wz = originZ + lz;
      const gy = getTerrainHeight(wx, wz);
      if (Math.hypot(wx - 150, wz + 150) > 9 && gy > CONFIG.WATER_LEVEL + 0.3) {
        dreamArches.push({ lx, lz, y: gy });
      }
    }
    // Low drifting pastel cloud banks (y = 7..13m, pushed into foliage range so they drift softly).
    const cloudCount = 1 + (rngFeatures() < 0.55 ? 1 : 0);
    for (let i = 0; i < cloudCount; i++) {
      dreamClouds.push({
        lx: (rngFeatures() - 0.5) * 14,
        lz: (rngFeatures() - 0.5) * 14,
        y: 7.2 + rngFeatures() * 5.6,
        rx: 2.4 + rngFeatures() * 2.0,
        rz: 1.7 + rngFeatures() * 1.6,
        tintPick: rngFeatures(),
      });
    }
  } else if (dominant === "terrorcore") {
    const deadCount = 2 + Math.floor(rngFeatures() * 2);
    for (let i = 0; i < deadCount; i++) {
      const lx = (rngFeatures() - 0.5) * (size - 4.5);
      const lz = (rngFeatures() - 0.5) * (size - 4.5);
      const wx = originX + lx;
      const wz = originZ + lz;
      const gy = getTerrainHeight(wx, wz);
      const skel = generateBranchTree(lx, gy, lz, rngFeatures, 0.95 + rngFeatures() * 0.5, true);
      if (Math.hypot(wx + 150, wz - 150) > 12 && gy > CONFIG.WATER_LEVEL + 0.25) {
        terrorTrees.push(skel);
      }
    }
    const spireCount = 2 + Math.floor(rngFeatures() * 3);
    for (let i = 0; i < spireCount; i++) {
      const lx = (rngFeatures() - 0.5) * (size - 3.5);
      const lz = (rngFeatures() - 0.5) * (size - 3.5);
      const wx = originX + lx;
      const wz = originZ + lz;
      const gy = getTerrainHeight(wx, wz);
      if (Math.hypot(wx + 150, wz - 150) > 9 && gy > CONFIG.WATER_LEVEL + 0.2) {
        terrorSpires.push({ lx, lz, y: gy, h: 2.2 + rngFeatures() * 3.0, r: 0.45 + rngFeatures() * 0.35 });
      }
    }
    // Jagged ribcage-like obsidian arches curving overhead.
    if (rngFeatures() < 0.65) {
      const lx = (rngFeatures() - 0.5) * 10;
      const lz = (rngFeatures() - 0.5) * 10;
      const wx = originX + lx;
      const wz = originZ + lz;
      const gy = getTerrainHeight(wx, wz);
      if (Math.hypot(wx + 150, wz - 150) > 11 && gy > CONFIG.WATER_LEVEL + 0.25) {
        terrorRibs.push({
          lx,
          lz,
          y: gy,
          span: 4.8 + rngFeatures() * 1.8,
          height: 4.6 + rngFeatures() * 2.2,
          yaw: rngFeatures() * Math.PI,
          ribPairs: 3 + (rngFeatures() < 0.5 ? 1 : 0),
        });
      }
    }
    // Clusters of watching red eyes: high floating pairs + low pairs peering from behind monoliths.
    if (rngFeatures() < 0.85) {
      const clusterX = (rngFeatures() - 0.5) * 12;
      const clusterZ = (rngFeatures() - 0.5) * 12;
      const pairCount = 1 + Math.floor(rngFeatures() * 3);
      for (let i = 0; i < pairCount; i++) {
        terrorEyes.push({
          lx: clusterX + (rngFeatures() - 0.5) * 2.6,
          lz: clusterZ + (rngFeatures() - 0.5) * 2.6,
          y: 2.6 + rngFeatures() * 2.8,
          scale: 0.85 + rngFeatures() * 0.45,
        });
      }
    }
    for (const ts of terrorSpires) {
      if (rngFeatures() < 0.58) {
        const ang = rngFeatures() * Math.PI * 2;
        const off = ts.r * 1.15 + 0.22;
        terrorEyes.push({
          lx: ts.lx + Math.cos(ang) * off,
          lz: ts.lz + Math.sin(ang) * off,
          y: ts.y + 0.95 + rngFeatures() * Math.min(1.4, ts.h * 0.45),
          scale: 0.72 + rngFeatures() * 0.25,
        });
      }
    }
  }

  // Analytical colliders & portals.
  const colliders = [];
  const portals = [];
  for (const rock of rocks) {
    colliders.push({
      x: originX + rock.lx,
      z: originZ + rock.lz,
      minY: rock.y - 0.3,
      maxY: rock.y + rock.radius * 0.72,
      r: rock.radius * 0.9,
      walkable: true,
      kind: "rock",
    });
  }
  for (const well of wells) {
    colliders.push({
      x: originX + well.lx,
      z: originZ + well.lz,
      minY: well.y - 0.3,
      maxY: well.y + 2.6,
      r: 1.02,
      walkable: false,
      kind: "well",
    });
  }
  for (const tree of meadowTrees) {
    const seg0 = tree.segments[0];
    if (seg0) {
      colliders.push({
        x: originX + seg0.a.x,
        z: originZ + seg0.a.z,
        minY: seg0.a.y,
        maxY: seg0.b.y + 2.2,
        r: Math.max(0.32, seg0.r0 * 1.45),
        walkable: false,
        kind: "tree",
      });
    }
  }
  for (const pine of coniferTrees) {
    colliders.push({
      x: originX + pine.lx,
      z: originZ + pine.lz,
      minY: pine.wy,
      maxY: pine.wy + pine.height * 0.85,
      r: 0.42,
      walkable: false,
      kind: "pine",
    });
  }
  for (const log of coniferLogs) {
    const cosY = Math.cos(log.yaw);
    const sinY = Math.sin(log.yaw);
    for (const s of [-0.35, 0, 0.35]) {
      colliders.push({
        x: originX + log.lx + cosY * s * log.len,
        z: originZ + log.lz + sinY * s * log.len,
        minY: log.y - 0.2,
        maxY: log.y + log.radius * 1.9,
        r: log.radius * 1.35,
        walkable: true,
        kind: "log",
      });
    }
  }
  for (const st of coniferStumps) {
    colliders.push({
      x: originX + st.lx,
      z: originZ + st.lz,
      minY: st.y - 0.2,
      maxY: st.y + st.h,
      r: st.radius * 1.15,
      walkable: true,
      kind: "stump",
    });
  }
  for (const sp of speleothems) {
    if (!sp.isStalactite) {
      colliders.push({
        x: originX + sp.lx,
        z: originZ + sp.lz,
        minY: sp.y - 0.3,
        maxY: sp.y + sp.height,
        r: sp.baseR * 1.05,
        walkable: false,
        kind: "stalagmite",
      });
    }
  }
  for (const cr of crystals) {
    colliders.push({
      x: originX + cr.lx,
      z: originZ + cr.lz,
      minY: cr.y - 0.2,
      maxY: cr.y + 0.85 * cr.scale,
      r: 0.42 * cr.scale,
      walkable: false,
      kind: "crystal",
    });
  }
  for (const co of corals) {
    colliders.push({
      x: originX + co.lx,
      z: originZ + co.lz,
      minY: co.y - 0.2,
      maxY: co.y + co.radius * 1.1,
      r: co.radius * 0.85,
      walkable: false,
      kind: "coral",
    });
  }
  for (const w of liminalWalls) {
    colliders.push({
      x: originX + w.lx,
      z: originZ + w.lz,
      minY: 0.5,
      maxY: liminalCeilY + 0.2,
      halfW: w.halfW,
      halfD: w.halfD,
      walkable: false,
      kind: "wall",
    });
  }
  for (const pil of liminalPillars) {
    colliders.push({
      x: originX + pil.lx,
      z: originZ + pil.lz,
      minY: 0.5,
      maxY: liminalCeilY + 0.2,
      halfW: pil.half,
      halfD: pil.half,
      walkable: false,
      kind: "pillar",
    });
  }
  for (const ch of liminalChairs) {
    colliders.push({
      x: originX + ch.lx,
      z: originZ + ch.lz,
      minY: ch.y - 0.1,
      maxY: ch.y + 1.1,
      r: 0.36,
      walkable: false,
      kind: "chair",
    });
  }
  for (const p of liminalPortals) {
    portals.push({
      x: p.wx,
      z: p.wz,
      radius: 1.35,
      shiftX: p.shiftX,
      shiftZ: p.shiftZ,
    });
  }
  for (const dt of dreamTrees) {
    const seg0 = dt.skel.segments[0];
    if (seg0) {
      colliders.push({
        x: originX + seg0.a.x,
        z: originZ + seg0.a.z,
        minY: seg0.a.y,
        maxY: seg0.b.y + 2.0,
        r: 0.38,
        walkable: false,
        kind: "dream_tree",
      });
    }
  }
  for (const a of dreamArches) {
    colliders.push({
      x: originX + a.lx - 1.25,
      z: originZ + a.lz,
      minY: a.y - 0.2,
      maxY: a.y + 3.6,
      r: 0.42,
      walkable: false,
      kind: "arch",
    });
    colliders.push({
      x: originX + a.lx + 1.25,
      z: originZ + a.lz,
      minY: a.y - 0.2,
      maxY: a.y + 3.6,
      r: 0.42,
      walkable: false,
      kind: "arch",
    });
  }
  for (const tt of terrorTrees) {
    const seg0 = tt.segments[0];
    if (seg0) {
      colliders.push({
        x: originX + seg0.a.x,
        z: originZ + seg0.a.z,
        minY: seg0.a.y,
        maxY: seg0.b.y + 2.0,
        r: 0.40,
        walkable: false,
        kind: "dead_tree",
      });
    }
  }
  for (const ts of terrorSpires) {
    colliders.push({
      x: originX + ts.lx,
      z: originZ + ts.lz,
      minY: ts.y - 0.2,
      maxY: ts.y + ts.h,
      r: ts.r * 0.9,
      walkable: false,
      kind: "spire",
    });
  }
  for (const rib of terrorRibs) {
    const cosY = Math.cos(rib.yaw);
    const sinY = Math.sin(rib.yaw);
    const halfSpan = rib.span * 0.5;
    for (let r = 0; r < rib.ribPairs; r++) {
      const along = (r - (rib.ribPairs - 1) * 0.5) * 1.45;
      for (const side of [-1, 1]) {
        const rx = rib.lx + cosY * side * halfSpan - sinY * along;
        const rz = rib.lz + sinY * side * halfSpan + cosY * along;
        colliders.push({
          x: originX + rx,
          z: originZ + rz,
          minY: rib.y - 0.2,
          maxY: rib.y + 2.4,
          r: 0.42,
          walkable: false,
          kind: "rib_arch",
        });
      }
    }
  }

  let grassStart = 0;
  let foliageStart = 0;
  let waterStart = 0;

  const mesh = new SplatMesh({
    constructSplats: (splats) => {
      const center = new THREE.Vector3();
      const scales = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const color = new THREE.Color();
      const up = new THREE.Vector3(0, 1, 0);
      const down = new THREE.Vector3(0, -1, 0);
      const normal = new THREE.Vector3();
      const dir = new THREE.Vector3();

      // ================================================================
      // 1. STATIC SPLATS [0 .. grassStart - 1]
      // ================================================================
      const n = cfg.groundGrid;
      const step = size / n;
      for (let gz = 0; gz < n; gz++) {
        for (let gx = 0; gx < n; gx++) {
          const lx = -half + (gx + 0.15 + rngGround() * 0.7) * step;
          const lz = -half + (gz + 0.15 + rngGround() * 0.7) * step;
          const wx = originX + lx;
          const wz = originZ + lz;
          const h = getTerrainHeight(wx, wz);
          getTerrainNormal(wx, wz, normal);
          const bw = getBiomeWeights(wx, wz);
          const biome = getMeadowBiome(wx, wz);
          const jitter = (rngGround() - 0.5) * 0.08;

          center.set(lx, h - 0.03, lz);
          scales.set(
            cfg.groundScale[0] * (0.85 + rngGround() * 0.35),
            cfg.groundScale[1],
            cfg.groundScale[2] * (0.85 + rngGround() * 0.35)
          );
          quat.setFromUnitVectors(up, normal);

          if (bw.liminal > 0.5) {
            // Crisp 2DGS floor tiles in Liminal Spaces.
            scales.set(cfg.groundScale[0] * 1.05, 0, cfg.groundScale[2] * 1.05);
            if (h < 0.2) {
              // Tiled poolroom basin
              const checker = (Math.floor(wx * 1.2) + Math.floor(wz * 1.2)) & 1;
              color.setRGB(checker ? 0.62 : 0.48, checker ? 0.80 : 0.70, checker ? 0.82 : 0.75);
            } else {
              // Damp commercial ochre carpet with dark damp stains
              const stain = (rngGround() - 0.5) * 0.06;
              const dampNoise = valueNoise2D(wx * 0.21 + 5.1, wz * 0.21 - 3.7, CONFIG.WORLD_SEED + 6637);
              const dampT = THREE.MathUtils.clamp((dampNoise - 0.66) / 0.22, 0, 1);
              const dampDark = 1.0 - dampT * dampT * 0.46;
              color.setRGB(
                (0.68 + stain) * dampDark,
                (0.61 + stain) * dampDark,
                (0.36 + stain * 0.5) * dampDark
              );
            }
          } else if (bw.dreamcore > 0.5) {
            const p = valueNoise2D(wx * 0.09, wz * 0.09, CONFIG.WORLD_SEED + 8888);
            if (p < 0.35) color.setRGB(0.84 + jitter * 0.7, 0.62 + jitter * 0.7, 0.76); // soft pastel pink
            else if (p < 0.68) color.setRGB(0.58 + jitter * 0.7, 0.82 + jitter * 0.7, 0.74); // soft mint
            else color.setRGB(0.72 + jitter * 0.7, 0.66 + jitter * 0.7, 0.86); // soft lavender
          } else if (bw.terrorcore > 0.5) {
            const c = 0.055 + rngGround() * 0.055;
            const vein = Math.abs(valueNoise2D(wx * 0.14 + 3.2, wz * 0.14 - 8.4, CONFIG.WORLD_SEED + 9719) - 0.5) * 2.0;
            if (vein < 0.075) {
              const glow = 1.0 - vein / 0.075;
              color.setRGB(0.12 + glow * 0.80, 0.03 + glow * 0.09, 0.03 + glow * 0.06);
            } else {
              const redCrack = rngGround() > 0.94 ? 0.18 : 0;
              color.setRGB(c * 1.15 + redCrack, c * 0.65, c * 0.70);
            }
          } else if (bw.cave > 0.5) {
            const v = 0.25 + rngGround() * 0.10;
            let crR = v * 0.92;
            let crG = v * 0.96;
            let crB = v * 1.12;
            // Bake soft cyan/emerald/violet crystal floor glow onto nearby cavern floor.
            for (let ci = 0; ci < crystals.length; ci++) {
              const cr = crystals[ci];
              const d = Math.hypot(lx - cr.lx, lz - cr.lz);
              if (d < 4.5) {
                const falloff = Math.pow(1.0 - d / 4.5, 1.8) * 0.58 * cr.scale;
                if (cr.huePick < 0.5) {
                  crR += 0.20 * falloff;
                  crG += 0.86 * falloff;
                  crB += 0.98 * falloff;
                } else if (cr.huePick < 0.8) {
                  crR += 0.26 * falloff;
                  crG += 0.92 * falloff;
                  crB += 0.66 * falloff;
                } else {
                  crR += 0.68 * falloff;
                  crG += 0.36 * falloff;
                  crB += 0.98 * falloff;
                }
              }
            }
            color.setRGB(
              THREE.MathUtils.clamp(crR, 0.04, 0.95),
              THREE.MathUtils.clamp(crG, 0.04, 0.95),
              THREE.MathUtils.clamp(crB, 0.04, 0.96)
            );
          } else if (bw.sea > 0.5 || h < CONFIG.WATER_LEVEL + 0.35) {
            const depthShade = THREE.MathUtils.clamp(1.0 + h * 0.04, 0.55, 1.05);
            color.setRGB(
              (0.66 + jitter) * depthShade,
              (0.62 + jitter) * depthShade,
              (0.45 + jitter * 0.5) * depthShade
            );
          } else if (bw.conifer > 0.5) {
            color.setRGB(
              THREE.MathUtils.clamp(0.16 + rngGround() * 0.08 + jitter, 0.04, 0.8),
              THREE.MathUtils.clamp(0.25 + rngGround() * 0.09 + jitter, 0.06, 0.8),
              THREE.MathUtils.clamp(0.11 + rngGround() * 0.05, 0.04, 0.7)
            );
          } else {
            color.setRGB(
              THREE.MathUtils.clamp(0.18 + biome * 0.18 + jitter, 0.05, 0.9),
              THREE.MathUtils.clamp(0.36 + biome * 0.11 + jitter, 0.1, 0.9),
              THREE.MathUtils.clamp(0.13 + (1 - biome) * 0.06 + jitter * 0.5, 0.04, 0.8)
            );
          }
          splats.pushSplat(center, scales, quat, 0.95, color);
        }
      }

      // Cave vaulted ceiling.
      if (dominant === "cave") {
        const cn = cfg.ceilingGrid;
        const cStep = size / cn;
        for (let gz = 0; gz < cn; gz++) {
          for (let gx = 0; gx < cn; gx++) {
            const lx = -half + (gx + 0.15 + rngGround() * 0.7) * cStep;
            const lz = -half + (gz + 0.15 + rngGround() * 0.7) * cStep;
            const wx = originX + lx;
            const wz = originZ + lz;
            if (getBiomeWeights(wx, wz).cave < 0.35) continue;
            const cy = getCaveCeilingHeight(wx, wz);
            center.set(lx, cy, lz);
            scales.set(cfg.ceilingScale[0], cfg.ceilingScale[1], cfg.ceilingScale[2]);
            quat.setFromUnitVectors(up, down);
            const v = 0.22 + rngGround() * 0.10;
            color.setRGB(v * 0.88, v * 0.94, v * 1.14);
            splats.pushSplat(center, scales, quat, 0.97, color);
          }
        }
      }

      // Liminal acoustic drop ceiling + fluorescent light tiles + wallpapered corridor walls + pillars/chairs/stairs/portals.
      if (dominant === "liminal") {
        const cn = cfg.ceilingGrid;
        const cStep = size / cn;
        for (let gz = 0; gz < cn; gz++) {
          for (let gx = 0; gx < cn; gx++) {
            const lx = -half + (gx + 0.5) * cStep;
            const lz = -half + (gz + 0.5) * cStep;
            const wx = originX + lx;
            const wz = originZ + lz;
            if (getBiomeWeights(wx, wz).liminal < 0.35) continue;
            const ceilY = getLiminalCeilingHeight(wx, wz);
            center.set(lx, ceilY, lz);
            // Crisp 2DGS ceiling & fluorescent light tiles (identity quat keeps ceiling panels brightly lit).
            scales.set(cfg.ceilingScale[0], 0, cfg.ceilingScale[2]);
            quat.identity();
            const isLight = (Math.floor(wx / 6) + Math.floor(wz / 6)) % 2 === 0 &&
              Math.abs(((wx % 6) + 6) % 6 - 3) < 1.2 &&
              Math.abs(((wz % 6) + 6) % 6 - 3) < 1.2;
            if (isLight) {
              color.setRGB(1.0, 0.98, 0.84);
            } else {
              const v = 0.72 + rngGround() * 0.08;
              color.setRGB(v * 0.95, v * 0.90, v * 0.72);
            }
            splats.pushSplat(center, scales, quat, 0.97, color);
          }
        }

        // Partition walls (2DGS planes with corner AO near floor, ceiling, and wall ends).
        const wStep = cfg.wallStep;
        const wallHeight = Math.max(2.2, liminalCeilY - 1.15);
        for (const w of liminalWalls) {
          const alongZ = w.halfD > w.halfW;
          const span = alongZ ? w.halfD * 2 : w.halfW * 2;
          const cols = Math.max(4, Math.round(span / wStep));
          const rows = Math.max(4, Math.round(wallHeight / wStep));
          quat.identity();
          for (let r = 0; r < rows; r++) {
            const py = 1.12 + (r / Math.max(1, rows - 1)) * wallHeight;
            const isBaseboard = r === 0;
            const floorAO = r === 1 ? 0.78 : 1.0;
            const ceilAO = r === rows - 1 ? 0.72 : r === rows - 2 ? 0.88 : 1.0;
            for (let c = 0; c < cols; c++) {
              const u = -0.5 + (c + 0.5) / cols;
              const edgeAO = (c === 0 || c === cols - 1) ? 0.84 : 1.0;
              const ao = floorAO * ceilAO * edgeAO;
              center.set(
                w.lx + (alongZ ? 0 : u * span),
                py,
                w.lz + (alongZ ? u * span : 0)
              );
              scales.set(
                alongZ ? 0 : wStep * 0.74,
                wStep * 0.74,
                alongZ ? wStep * 0.74 : 0
              );
              if (isBaseboard) {
                color.setRGB(0.24 * edgeAO, 0.17 * edgeAO, 0.10 * edgeAO);
              } else {
                const stripe = ((c + r) % 2) * 0.03;
                color.setRGB((0.84 - stripe) * ao, (0.79 - stripe) * ao, 0.50 * ao);
              }
              splats.pushSplat(center, scales, quat, 0.98, color);
            }
          }
        }

        // Square structural pillars (4 crisp 2DGS faces with baseboard & corner AO).
        const pRows = Math.max(4, Math.round(wallHeight / Math.max(0.45, wStep)));
        const pSy = (wallHeight / pRows) * 0.76;
        for (const pil of liminalPillars) {
          quat.identity();
          const h = pil.half;
          for (let r = 0; r < pRows; r++) {
            const py = 1.12 + (r / Math.max(1, pRows - 1)) * wallHeight;
            const isBaseboard = r === 0;
            const ao = (r === 1 ? 0.76 : 1.0) * (r === pRows - 1 ? 0.70 : r === pRows - 2 ? 0.86 : 1.0);
            if (isBaseboard) {
              color.setRGB(0.22, 0.16, 0.10);
            } else {
              color.setRGB(0.76 * ao, 0.71 * ao, 0.45 * ao);
            }
            for (const s of [-1, 1]) {
              center.set(pil.lx + s * h, py, pil.lz);
              scales.set(0, pSy, h * 1.12);
              splats.pushSplat(center, scales, quat, 0.98, color);

              center.set(pil.lx, py, pil.lz + s * h);
              scales.set(h * 1.12, pSy, 0);
              splats.pushSplat(center, scales, quat, 0.98, color);
            }
          }
        }

        // Lone wooden chairs facing corners/walls.
        if (lod <= 1) {
          for (const ch of liminalChairs) {
            const cosY = Math.cos(ch.yaw);
            const sinY = Math.sin(ch.yaw);
            const rotPt = (ox, oy, oz) => {
              center.set(
                ch.lx + ox * cosY - oz * sinY,
                ch.y + oy,
                ch.lz + ox * sinY + oz * cosY
              );
            };
            quat.setFromEuler(new THREE.Euler(0, ch.yaw, 0));
            // 4 legs
            color.setRGB(0.28, 0.18, 0.10);
            for (const sx of [-0.21, 0.21]) {
              for (const sz of [-0.21, 0.21]) {
                rotPt(sx, 0.25, sz);
                scales.set(0.04, 0.26, 0.04);
                splats.pushSplat(center, scales, quat, 0.98, color);
              }
            }
            // Flat 2DGS seat
            rotPt(0, 0.50, 0);
            scales.set(0.30, 0, 0.30);
            color.setRGB(0.36, 0.23, 0.13);
            splats.pushSplat(center, scales, quat, 0.98, color);
            // Backrest posts + slats on -Z side (so chair faces +Z toward wall/corner)
            color.setRGB(0.32, 0.20, 0.11);
            for (const sx of [-0.21, 0.21]) {
              rotPt(sx, 0.78, -0.21);
              scales.set(0.04, 0.30, 0.04);
              splats.pushSplat(center, scales, quat, 0.98, color);
            }
            for (const by of [0.74, 0.96]) {
              rotPt(0, by, -0.21);
              scales.set(0.25, 0.07, 0.035);
              splats.pushSplat(center, scales, quat, 0.98, color);
            }
          }
        }

        // Static ceiling suspension cords for hanging fluorescent lamps (the glowing bars are pushed into foliage range so they sway!).
        for (const lamp of liminalLamps) {
          quat.identity();
          const cordLen = Math.max(0.25, lamp.ceilY - lamp.barY);
          const midY = lamp.barY + cordLen * 0.5;
          color.setRGB(0.16, 0.15, 0.13);
          for (const endOff of [-0.55, 0.55]) {
            center.set(
              lamp.lx + (lamp.alongZ ? 0 : endOff),
              midY,
              lamp.lz + (lamp.alongZ ? endOff : 0)
            );
            scales.set(0.025, cordLen * 0.5, 0.025);
            splats.pushSplat(center, scales, quat, 0.95, color);
          }
        }

        // Impossible stairs (upside-down hanging from ceiling OR ascending dead-end into ceiling) with 2DGS treads.
        for (const st of liminalStairs) {
          const steps = 11;
          quat.identity();
          const climb = Math.max(1.8, liminalCeilY - 1.35);
          for (let i = 0; i < steps; i++) {
            const t = i / (steps - 1);
            const py = st.upsideDown
              ? (liminalCeilY - 0.18) - t * Math.min(2.4, climb)
              : 1.15 + t * climb;
            for (const xOff of [-0.55, 0, 0.55]) {
              center.set(st.lx + xOff, py, st.lz + (t - 0.5) * 4.2);
              scales.set(0.34, 0, 0.28);
              color.setRGB(0.76, 0.70, 0.45);
              splats.pushSplat(center, scales, quat, 0.96, color);
            }
          }
        }

        // Freestanding glowing portal doorways.
        for (const p of liminalPortals) {
          quat.identity();
          // Doorway frame posts + lintel
          for (let py = 1.15; py <= 3.7; py += 0.28) {
            for (const sx of [-1.05, 1.05]) {
              center.set(p.lx + sx, py, p.lz);
              scales.set(0.14, 0.22, 0.18);
              color.setRGB(0.32, 0.22, 0.14);
              splats.pushSplat(center, scales, quat, 0.98, color);
            }
          }
          for (let px = -1.05; px <= 1.05; px += 0.26) {
            center.set(p.lx + px, 3.78, p.lz);
            scales.set(0.22, 0.14, 0.18);
            color.setRGB(0.32, 0.22, 0.14);
            splats.pushSplat(center, scales, quat, 0.98, color);
          }
          // Glowing pale-cyan threshold shimmer inside freestanding doorway
          for (let py = 1.3; py <= 3.5; py += 0.38) {
            for (let px = -0.7; px <= 0.7; px += 0.35) {
              center.set(p.lx + px, py, p.lz);
              scales.set(0.28, 0.30, 0.08);
              color.setRGB(0.68, 0.96, 1.0);
              splats.pushSplat(center, scales, quat, 0.52, color);
            }
          }
        }
      }

      // Rocks & Wells.
      const rockColor = dominant === "conifer" ? [0.36, 0.37, 0.40] : [0.33, 0.35, 0.36];
      for (const rock of rocks) {
        pushRockCluster(
          splats, rock.lx, rock.y, rock.lz, rock.radius, cfg.rockSplats,
          rock.shade, rockColor, rngGround, center, scales, quat, color
        );
      }
      for (const well of wells) {
        pushWellStructure(splats, well.lx, well.y, well.lz, cfg.wellDetail, rngGround, center, scales, quat, color);
      }

      // Meadow tree trunks + Dreamcore pastel trunks + Terrorcore dead trees.
      const pushTreeSegments = (tree, perTree, rgbFn) => {
        const segs = tree.segments;
        for (let i = 0; i < perTree; i++) {
          const segIdx = i % segs.length;
          const seg = segs[segIdx];
          const t = rngGround();
          center.lerpVectors(seg.a, seg.b, t);
          const rad = THREE.MathUtils.lerp(seg.r0, seg.r1, t);
          const ang = rngGround() * Math.PI * 2;
          center.x += Math.cos(ang) * rad * 0.42;
          center.z += Math.sin(ang) * rad * 0.42;
          dir.subVectors(seg.b, seg.a).normalize();
          quat.setFromUnitVectors(up, dir);
          const segLen = seg.a.distanceTo(seg.b);
          const lenScale = Math.max(rad * 1.4, (segLen / Math.max(1, perTree / segs.length)) * 1.65);
          scales.set(rad * 0.85, lenScale, rad * 0.85);
          rgbFn(color, segIdx, t);
          // Grounded base AO on lower trunk splats.
          if (segIdx === 0 && t < 0.25) {
            color.multiplyScalar(0.72);
          }
          splats.pushSplat(center, scales, quat, 0.98, color);
        }
      };

      for (const tree of meadowTrees) {
        pushTreeSegments(tree, cfg.trunkSplats, (col) => {
          const bark = 0.82 + rngGround() * 0.32;
          col.setRGB(0.32 * bark, 0.21 * bark, 0.13 * bark);
        });
      }
      for (const dt of dreamTrees) {
        pushTreeSegments(dt.skel, cfg.trunkSplats, (col) => {
          const b = 0.80 + rngGround() * 0.14;
          col.setRGB(0.76 * b, 0.66 * b, 0.84 * b);
        });
      }
      for (const tt of terrorTrees) {
        pushTreeSegments(tt, Math.round(cfg.trunkSplats * 1.15), (col, segIdx, t) => {
          // Gnarled obsidian-bark dead trees with eerie glowing crimson fissures.
          const isFissure = segIdx <= 1 && Math.abs(Math.sin(t * 14.0 + segIdx * 2.1)) > 0.92 && rngGround() < 0.45;
          if (isFissure) {
            col.setRGB(0.92, 0.09, 0.08);
          } else {
            const b = 0.65 + rngGround() * 0.32;
            col.setRGB(0.065 * b, 0.045 * b, 0.055 * b);
          }
        });
      }

      // Conifer pine trunks (varied tall straight & gnarled leaning silhouettes + base AO).
      for (const pine of coniferTrees) {
        const trunkN = cfg.pineTrunkSplats;
        for (let i = 0; i < trunkN; i++) {
          const t = (i + rngGround() * 0.6) / trunkN;
          const bend = Math.sin(t * Math.PI);
          center.set(
            pine.lx + pine.leanX * t + pine.bendX * bend,
            pine.wy + t * pine.height * 0.92,
            pine.lz + pine.leanZ * t + pine.bendZ * bend
          );
          const rad = THREE.MathUtils.lerp(0.24, 0.05, t);
          scales.set(rad, (pine.height / trunkN) * 1.5, rad);
          quat.identity();
          const bark = (0.82 + rngGround() * 0.28) * (t < 0.25 ? 0.72 : 1.0);
          color.setRGB(0.36 * bark, 0.20 * bark, 0.13 * bark);
          splats.pushSplat(center, scales, quat, 0.98, color);
        }
      }

      // Conifer mossy fallen logs.
      const logSplats = lod === 0 ? 22 : lod === 1 ? 12 : 6;
      for (const log of coniferLogs) {
        const cosY = Math.cos(log.yaw);
        const sinY = Math.sin(log.yaw);
        dir.set(cosY, 0, sinY).normalize();
        quat.setFromUnitVectors(up, dir);
        for (let i = 0; i < logSplats; i++) {
          const u = (i / Math.max(1, logSplats - 1)) - 0.5;
          const isMoss = i % 3 === 0;
          center.set(
            log.lx + cosY * u * log.len + (rngGround() - 0.5) * 0.08,
            log.y + log.radius * (isMoss ? 1.18 : 0.72),
            log.lz + sinY * u * log.len + (rngGround() - 0.5) * 0.08
          );
          if (isMoss) {
            scales.set(log.radius * 0.85, log.radius * 0.45, log.radius * 0.85);
            color.setRGB(0.16 + rngGround() * 0.06, 0.36 + rngGround() * 0.10, 0.12);
          } else {
            scales.set(log.radius * 0.95, (log.len / logSplats) * 1.45, log.radius * 0.95);
            const bark = 0.75 + rngGround() * 0.25;
            color.setRGB(0.28 * bark, 0.17 * bark, 0.10 * bark);
          }
          splats.pushSplat(center, scales, quat, 0.97, color);
        }
      }

      // Conifer tree stumps.
      const stumpSplats = lod === 0 ? 12 : lod === 1 ? 6 : 3;
      for (const st of coniferStumps) {
        quat.identity();
        for (let i = 0; i < stumpSplats; i++) {
          const t = i / Math.max(1, stumpSplats - 1);
          const ang = i * 2.399;
          const r = st.radius * (0.4 + 0.5 * (1 - t * 0.3));
          center.set(st.lx + Math.cos(ang) * r * 0.45, st.y + t * st.h, st.lz + Math.sin(ang) * r * 0.45);
          scales.set(st.radius * 0.75, (st.h / Math.max(1, stumpSplats)) * 2.1, st.radius * 0.75);
          const ao = t < 0.3 ? 0.72 : 1.0;
          color.setRGB(0.30 * ao, 0.18 * ao, 0.11 * ao);
          splats.pushSplat(center, scales, quat, 0.98, color);
        }
        // Cut heartwood top
        center.set(st.lx, st.y + st.h + 0.02, st.lz);
        scales.set(st.radius * 0.95, 0.04, st.radius * 0.95);
        color.setRGB(0.56, 0.42, 0.26);
        splats.pushSplat(center, scales, quat, 0.98, color);
      }

      // Cave stalactites, stalagmites & crystals.
      for (const sp of speleothems) {
        const count = cfg.speleothemSplats;
        const sign = sp.isStalactite ? -1 : 1;
        for (let i = 0; i < count; i++) {
          const t = i / Math.max(1, count - 1);
          const rad = sp.baseR * (1.0 - t * 0.82);
          center.set(
            sp.lx + (rngGround() - 0.5) * rad * 0.35,
            sp.y + sign * t * sp.height,
            sp.lz + (rngGround() - 0.5) * rad * 0.35
          );
          scales.set(rad * 1.1, (sp.height / Math.max(1, count)) * 1.45, rad * 1.1);
          quat.identity();
          const v = 0.28 + rngGround() * 0.14;
          color.setRGB(v * 0.92, v * 0.95, v * 1.08);
          splats.pushSplat(center, scales, quat, 0.97, color);
        }
      }
      for (const cr of crystals) {
        const count = cfg.crystalSplats;
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2 + rngGround() * 0.4;
          const tilt = 0.2 + rngGround() * 0.55;
          const len = (0.45 + rngGround() * 0.65) * cr.scale;
          dir.set(Math.cos(ang) * Math.sin(tilt), Math.cos(tilt), Math.sin(ang) * Math.sin(tilt)).normalize();
          center.set(cr.lx, cr.y + 0.15, cr.lz).addScaledVector(dir, len * 0.5);
          scales.set(0.08 * cr.scale, len * 0.55, 0.08 * cr.scale);
          quat.setFromUnitVectors(up, dir);
          if (cr.huePick < 0.5) color.setRGB(0.32, 0.96, 1.0);
          else if (cr.huePick < 0.8) color.setRGB(0.40, 1.0, 0.78);
          else color.setRGB(0.76, 0.52, 1.0);
          splats.pushSplat(center, scales, quat, 0.96, color);
        }
      }

      // Dreamcore floating pastel stairs (crisp 2DGS treads), giant eyes & checkerboard arches.
      for (const ds of dreamStairs) {
        quat.setFromEuler(new THREE.Euler(0, ds.rot, 0));
        for (let i = 0; i < 10; i++) {
          const t = i / 9;
          const px = Math.cos(ds.rot) * (t - 0.5) * 4.5;
          const pz = Math.sin(ds.rot) * (t - 0.5) * 4.5;
          center.set(ds.lx + px, ds.baseY + t * 3.8, ds.lz + pz);
          scales.set(0.48, 0, 0.72);
          color.setRGB(i % 2 === 0 ? 0.86 : 0.66, i % 2 === 0 ? 0.68 : 0.82, 0.86);
          splats.pushSplat(center, scales, quat, 0.96, color);
        }
      }
      for (const de of dreamEyes) {
        pushFloatingEye(splats, de.lx, de.y, de.lz, de.radius, [0.46, 0.76, 0.98], true, center, scales, quat, color);
      }
      for (const a of dreamArches) {
        quat.identity();
        for (let h = 0; h < 10; h++) {
          const py = a.y + 0.25 + h * 0.35;
          for (const sx of [-1.25, 1.25]) {
            center.set(a.lx + sx, py, a.lz);
            scales.set(0.24, 0.24, 0.24);
            const pink = (h + (sx > 0 ? 1 : 0)) % 2 === 0;
            color.setRGB(pink ? 0.86 : 0.60, pink ? 0.62 : 0.84, pink ? 0.78 : 0.88);
            splats.pushSplat(center, scales, quat, 0.97, color);
          }
        }
        for (let x = -1.25; x <= 1.25; x += 0.35) {
          center.set(a.lx + x, a.y + 3.65, a.lz);
          scales.set(0.28, 0.24, 0.26);
          color.setRGB(0.84, 0.74, 0.86);
          splats.pushSplat(center, scales, quat, 0.97, color);
        }
      }

      // Terrorcore obsidian monolith spires, ribcage arches & clustered watching red eyes.
      for (const ts of terrorSpires) {
        const count = cfg.speleothemSplats;
        for (let i = 0; i < count; i++) {
          const t = i / Math.max(1, count - 1);
          const rad = ts.r * (1.0 - t * 0.85);
          center.set(ts.lx, ts.y + t * ts.h, ts.lz);
          scales.set(rad * 1.15, (ts.h / Math.max(1, count)) * 1.45, rad * 1.15);
          quat.identity();
          const glow = i % 5 === 0;
          color.setRGB(glow ? 0.84 : 0.06, glow ? 0.07 : 0.035, glow ? 0.09 : 0.045);
          splats.pushSplat(center, scales, quat, 0.98, color);
        }
      }
      // Jagged ribcage-like obsidian arches curving overhead.
      const ribSegs = lod === 0 ? 12 : lod === 1 ? 6 : 3;
      for (const rib of terrorRibs) {
        const cosY = Math.cos(rib.yaw);
        const sinY = Math.sin(rib.yaw);
        const halfSpan = rib.span * 0.5;
        for (let r = 0; r < rib.ribPairs; r++) {
          const along = (r - (rib.ribPairs - 1) * 0.5) * 1.45;
          for (const side of [-1, 1]) {
            for (let s = 0; s < ribSegs; s++) {
              const t = s / Math.max(1, ribSegs - 1);
              // Curve outward slightly then arch sharply inward toward apex
              const localX = side * halfSpan * Math.cos(t * Math.PI * 0.48) + side * Math.sin(t * Math.PI) * 0.45;
              const localY = Math.sin(t * Math.PI * 0.52) * rib.height;
              const jagged = (s % 2 === 0 ? 1 : -1) * 0.08 * (1 - t * 0.4);
              center.set(
                rib.lx + cosY * (localX + jagged) - sinY * along,
                rib.y + localY,
                rib.lz + sinY * (localX + jagged) + cosY * along
              );
              const thickness = THREE.MathUtils.lerp(0.32, 0.09, t);
              scales.set(thickness, thickness * 1.55, thickness * 0.95);
              quat.setFromEuler(new THREE.Euler(0, rib.yaw, side * (0.25 + t * 0.95)));
              const vein = s === Math.floor(ribSegs * 0.45) || s === Math.floor(ribSegs * 0.8);
              color.setRGB(vein ? 0.78 : 0.07, vein ? 0.06 : 0.04, vein ? 0.07 : 0.05);
              splats.pushSplat(center, scales, quat, 0.98, color);
            }
          }
        }
      }
      for (const te of terrorEyes) {
        const sc = te.scale ?? 1.0;
        quat.identity();
        for (const ox of [-0.20 * sc, 0.20 * sc]) {
          center.set(te.lx + ox, te.y, te.lz);
          scales.set(0.11 * sc, 0.065 * sc, 0.11 * sc);
          color.setRGB(1.0, 0.12, 0.10);
          splats.pushSplat(center, scales, quat, 0.98, color);
        }
      }

      // Sea corals.
      for (const co of corals) {
        const count = cfg.coralSplats;
        for (let i = 0; i < count; i++) {
          const ang = rngGround() * Math.PI * 2;
          const elev = rngGround() * 0.9;
          const r = co.radius * (0.25 + rngGround() * 0.75);
          center.set(co.lx + Math.cos(ang) * r, co.y + 0.1 + elev * co.radius * 1.15, co.lz + Math.sin(ang) * r);
          const s = 0.14 + rngGround() * 0.12;
          scales.set(s, s * (co.kind < 0.5 ? 1.7 : 0.9), s);
          quat.setFromEuler(new THREE.Euler(rngGround(), rngGround() * 3.14, rngGround()));
          if (co.kind < 0.35) color.setRGB(0.95, 0.38, 0.32);
          else if (co.kind < 0.7) color.setRGB(0.88, 0.34, 0.66);
          else color.setRGB(0.94, 0.76, 0.28);
          splats.pushSplat(center, scales, quat, 0.95, color);
        }
      }

      // ================================================================
      // 2. SWAYING GRASS / KELP / EMBER SPLATS [grassStart .. foliageStart - 1]
      // ================================================================
      grassStart = splats.numSplats;
      if (dominant === "meadow" || dominant === "conifer" || dominant === "dreamcore") {
        const targetGrass =
          dominant === "meadow"
            ? cfg.grassCount
            : dominant === "conifer"
              ? cfg.coniferGrassCount
              : cfg.dreamGrassCount;
        const tuftCount = Math.max(36, Math.floor(targetGrass / 7));
        const bladesPerTuft = Math.ceil(targetGrass / tuftCount);
        let pushed = 0;
        for (let t = 0; t < tuftCount && pushed < targetGrass; t++) {
          const tuftX = (rngGrass() - 0.5) * (size - 0.4);
          const tuftZ = (rngGrass() - 0.5) * (size - 0.4);
          const biome = getMeadowBiome(originX + tuftX, originZ + tuftZ);

          for (let b = 0; b < bladesPerTuft && pushed < targetGrass; b++) {
            const lx = THREE.MathUtils.clamp(tuftX + (rngGrass() - 0.5) * 0.85, -half, half);
            const lz = THREE.MathUtils.clamp(tuftZ + (rngGrass() - 0.5) * 0.85, -half, half);
            const wx = originX + lx;
            const wz = originZ + lz;
            const gy = getTerrainHeight(wx, wz);
            if (gy < CONFIG.WATER_LEVEL + 0.14) continue;

            const heightScale = 0.72 + rngGrass() * 0.75;
            const bladeH = cfg.grassScale[1] * heightScale * (dominant === "conifer" ? 1.15 : 1.0);
            center.set(lx, gy + bladeH * 0.72, lz);
            scales.set(cfg.grassScale[0], bladeH, cfg.grassScale[2]);
            quat.setFromEuler(
              new THREE.Euler((rngGrass() - 0.5) * 0.35, rngGrass() * Math.PI * 2, (rngGrass() - 0.5) * 0.35)
            );

            const roll = rngGrass();
            const baseAO = heightScale < 0.96 ? 0.84 : 1.0;
            if (dominant === "dreamcore") {
              if (roll < 0.35) color.setRGB(0.86 * baseAO, 0.64 * baseAO, 0.78 * baseAO);
              else if (roll < 0.7) color.setRGB(0.60 * baseAO, 0.84 * baseAO, 0.76 * baseAO);
              else color.setRGB(0.74 * baseAO, 0.68 * baseAO, 0.88 * baseAO);
            } else if (dominant === "meadow" && roll > 0.968 && lod <= 1) {
              center.y += bladeH * 0.55;
              scales.multiplyScalar(1.3);
              if (roll > 0.988) color.setRGB(0.96, 0.84, 0.24);
              else if (roll > 0.978) color.setRGB(0.72, 0.62, 0.95);
              else color.setRGB(0.95, 0.93, 0.84);
            } else if (dominant === "conifer") {
              const tip = (0.78 + rngGrass() * 0.36) * baseAO;
              color.setRGB(0.16 * tip, 0.36 * tip, 0.14 * tip);
            } else {
              const tipBright = (0.82 + rngGrass() * 0.42) * baseAO;
              color.setRGB(
                THREE.MathUtils.clamp((0.21 + biome * 0.23) * tipBright, 0.05, 0.92),
                THREE.MathUtils.clamp((0.48 + biome * 0.14) * tipBright, 0.12, 0.95),
                THREE.MathUtils.clamp((0.14 + (1 - biome) * 0.08) * tipBright, 0.04, 0.75)
              );
            }
            splats.pushSplat(center, scales, quat, 0.92, color);
            pushed++;
          }
        }
      } else if (dominant === "terrorcore") {
        // Dark red thorns + floating glowing ash embers swaying in the air.
        const count = cfg.terrorAshCount;
        for (let i = 0; i < count; i++) {
          const lx = (rngGrass() - 0.5) * (size - 0.5);
          const lz = (rngGrass() - 0.5) * (size - 0.5);
          const gy = getTerrainHeight(originX + lx, originZ + lz);
          if (i % 4 === 0) {
            // Drifting crimson ash ember
            center.set(lx, gy + 0.6 + rngGrass() * 4.5, lz);
            scales.set(0.05, 0.05, 0.05);
            quat.identity();
            color.setRGB(1.0, 0.22, 0.14);
          } else {
            if (gy < CONFIG.WATER_LEVEL + 0.1) continue;
            center.set(lx, gy + 0.14, lz);
            scales.set(cfg.grassScale[0], cfg.grassScale[1] * 0.9, cfg.grassScale[2]);
            quat.setFromEuler(new THREE.Euler((rngGrass() - 0.5) * 0.5, rngGrass() * 3.14, 0));
            color.setRGB(0.16, 0.06, 0.07);
          }
          splats.pushSplat(center, scales, quat, 0.9, color);
        }
      } else if (dominant === "sea") {
        for (const kelp of kelpStalks) {
          const segs = cfg.kelpSegs;
          for (let i = 0; i < segs; i++) {
            const t = (i + 0.5) / segs;
            center.set(
              kelp.lx + Math.sin(t * 4.5 + kelp.phase) * 0.16,
              kelp.y + t * kelp.h,
              kelp.lz + Math.cos(t * 3.8 + kelp.phase) * 0.16
            );
            scales.set(0.085, (kelp.h / segs) * 0.95, 0.035);
            quat.setFromEuler(new THREE.Euler(0.15 * Math.sin(t * 4 + kelp.phase), kelp.phase, 0));
            const shade = 0.75 + t * 0.4;
            color.setRGB(0.14 * shade, 0.48 * shade, 0.26 * shade);
            splats.pushSplat(center, scales, quat, 0.92, color);
          }
        }
      }

      // ================================================================
      // 3. TREE CANOPY FOLIAGE SPLATS [foliageStart .. waterStart - 1]
      // ================================================================
      foliageStart = splats.numSplats;
      for (const tree of meadowTrees) {
        const anchors = tree.leafAnchors;
        const perTree = cfg.foliageSplats;
        for (let i = 0; i < perTree; i++) {
          const anchor = anchors[i % anchors.length];
          const u = rngCanopy() * 2 - 1;
          const theta = rngCanopy() * Math.PI * 2;
          const rad = Math.cbrt(rngCanopy()) * anchor.radius;
          const s = Math.sqrt(Math.max(0, 1 - u * u));
          center.set(
            anchor.pos.x + s * Math.cos(theta) * rad,
            anchor.pos.y + u * rad * 0.74,
            anchor.pos.z + s * Math.sin(theta) * rad
          );
          const puff = 0.72 + rngCanopy() * 0.65;
          scales.set(cfg.foliageScale[0] * puff, cfg.foliageScale[1] * puff, cfg.foliageScale[2] * puff);
          quat.setFromEuler(new THREE.Euler(rngCanopy() * 2.0, rngCanopy() * 3.14, rngCanopy() * 2.0));
          const sunLift = u * 0.14 + 0.92 + (rngCanopy() - 0.5) * 0.15;
          color.setRGB(
            THREE.MathUtils.clamp(0.16 * sunLift + rngCanopy() * 0.08, 0.04, 0.85),
            THREE.MathUtils.clamp(0.42 * sunLift + rngCanopy() * 0.10, 0.1, 0.92),
            THREE.MathUtils.clamp(0.15 * sunLift + rngCanopy() * 0.05, 0.04, 0.75)
          );
          splats.pushSplat(center, scales, quat, 0.9, color);
        }
      }

      // Dreamcore cotton-candy pastel foliage + low drifting pastel cloud banks.
      for (const dt of dreamTrees) {
        const anchors = dt.skel.leafAnchors;
        const perTree = cfg.foliageSplats;
        for (let i = 0; i < perTree; i++) {
          const anchor = anchors[i % anchors.length];
          const u = rngCanopy() * 2 - 1;
          const theta = rngCanopy() * Math.PI * 2;
          const rad = Math.cbrt(rngCanopy()) * anchor.radius * 1.15;
          const s = Math.sqrt(Math.max(0, 1 - u * u));
          center.set(
            anchor.pos.x + s * Math.cos(theta) * rad,
            anchor.pos.y + u * rad * 0.8,
            anchor.pos.z + s * Math.sin(theta) * rad
          );
          const puff = 0.78 + rngCanopy() * 0.55;
          scales.set(cfg.foliageScale[0] * puff, cfg.foliageScale[1] * puff, cfg.foliageScale[2] * puff);
          quat.setFromEuler(new THREE.Euler(rngCanopy(), rngCanopy() * 3.14, rngCanopy()));
          const lift = 0.92 + u * 0.09;
          if (dt.tintPick < 0.34) color.setRGB(0.86 * lift, 0.62 * lift, 0.78 * lift);
          else if (dt.tintPick < 0.68) color.setRGB(0.58 * lift, 0.84 * lift, 0.78 * lift);
          else color.setRGB(0.74 * lift, 0.66 * lift, 0.88 * lift);
          splats.pushSplat(center, scales, quat, 0.92, color);
        }
      }
      // Low drifting pastel cloud banks (y = 7..13m, inside foliage range for gentle GPU drift).
      const cloudPuffs = lod === 0 ? 28 : lod === 1 ? 14 : 7;
      for (const cl of dreamClouds) {
        for (let i = 0; i < cloudPuffs; i++) {
          const ang = rngCanopy() * Math.PI * 2;
          const r = Math.sqrt(rngCanopy());
          const yOff = (rngCanopy() - 0.5) * 0.9;
          center.set(
            cl.lx + Math.cos(ang) * r * cl.rx,
            cl.y + yOff * (1.0 - r * 0.45),
            cl.lz + Math.sin(ang) * r * cl.rz
          );
          const puff = 0.75 + rngCanopy() * 0.65;
          scales.set(1.05 * puff, 0.46 * puff, 0.95 * puff);
          quat.identity();
          const topLit = 0.88 + yOff * 0.08;
          if (cl.tintPick < 0.35) color.setRGB(0.88 * topLit, 0.74 * topLit, 0.84 * topLit);
          else if (cl.tintPick < 0.7) color.setRGB(0.78 * topLit, 0.76 * topLit, 0.90 * topLit);
          else color.setRGB(0.86 * topLit, 0.82 * topLit, 0.88 * topLit);
          splats.pushSplat(center, scales, quat, 0.70, color);
        }
      }

      // Liminal hanging swaying fluorescent lamp bars (inside foliage range so they gently sway!).
      for (const lamp of liminalLamps) {
        quat.identity();
        for (let i = -2; i <= 2; i++) {
          const off = i * 0.28;
          center.set(
            lamp.lx + (lamp.alongZ ? 0 : off),
            lamp.barY,
            lamp.lz + (lamp.alongZ ? off : 0)
          );
          scales.set(lamp.alongZ ? 0.10 : 0.22, 0.06, lamp.alongZ ? 0.22 : 0.10);
          color.setRGB(1.0, 0.97, 0.86);
          splats.pushSplat(center, scales, quat, 0.96, color);
        }
      }

      for (const pine of coniferTrees) {
        const nNeedle = cfg.pineFoliageSplats;
        for (let i = 0; i < nNeedle; i++) {
          const tierT = rngCanopy();
          const yFrac = 0.22 + tierT * 0.80;
          const bend = Math.sin(yFrac * Math.PI);
          const tierWave = 1.0 - ((tierT * pine.tierFreq) % 1) * 0.26;
          const maxR = pine.baseRadius * (1.0 - tierT * 0.88) * tierWave;
          const r = Math.sqrt(rngCanopy()) * maxR;
          const ang = rngCanopy() * Math.PI * 2;
          center.set(
            pine.lx + pine.leanX * yFrac + pine.bendX * bend + Math.cos(ang) * r * pine.asymX,
            pine.wy + yFrac * pine.height - (r / Math.max(0.4, maxR)) * 0.34,
            pine.lz + pine.leanZ * yFrac + pine.bendZ * bend + Math.sin(ang) * r * pine.asymZ
          );
          const puff = (0.75 + rngCanopy() * 0.55) * (lod === 0 ? 1.0 : lod === 1 ? 1.45 : 2.1) * CONFIG.SPLAT_SIZE_SCALE;
          scales.set(0.24 * puff, 0.14 * puff, 0.24 * puff);
          quat.setFromEuler(new THREE.Euler((rngCanopy() - 0.5) * 0.5, ang, (rngCanopy() - 0.5) * 0.5));
          const lift = 0.82 + tierT * 0.25 + (rngCanopy() - 0.5) * 0.14;
          color.setRGB(
            THREE.MathUtils.clamp(0.08 * lift, 0.03, 0.65),
            THREE.MathUtils.clamp(0.29 * lift, 0.08, 0.78),
            THREE.MathUtils.clamp(0.15 * lift, 0.05, 0.65)
          );
          splats.pushSplat(center, scales, quat, 0.93, color);
        }
      }

      // ================================================================
      // 4. WATER SURFACE SPLATS [waterStart .. total - 1]
      // ================================================================
      waterStart = splats.numSplats;
      const wn = cfg.waterGrid;
      const wStep = size / wn;
      for (let gz = 0; gz < wn; gz++) {
        for (let gx = 0; gx < wn; gx++) {
          const lx = -half + (gx + 0.5) * wStep;
          const lz = -half + (gz + 0.5) * wStep;
          const wx = originX + lx;
          const wz = originZ + lz;
          const gy = getTerrainHeight(wx, wz);
          if (gy < CONFIG.WATER_LEVEL - 0.05) {
            center.set(lx, CONFIG.WATER_LEVEL, lz);
            // Crisp 2DGS water surface disc.
            scales.set(cfg.waterScale[0], 0, cfg.waterScale[2]);
            quat.identity();
            const depth = THREE.MathUtils.clamp(-gy / 6.0, 0, 1);
            if (dominant === "terrorcore") {
              color.setRGB(0.55, 0.05, 0.06);
            } else if (dominant === "dreamcore") {
              color.setRGB(0.68, 0.62, 0.86);
            } else if (dominant === "liminal") {
              color.setRGB(0.42, 0.84, 0.88);
            } else if (dominant === "sea") {
              color.setRGB(
                THREE.MathUtils.lerp(0.18, 0.07, depth),
                THREE.MathUtils.lerp(0.62, 0.34, depth),
                THREE.MathUtils.lerp(0.74, 0.58, depth)
              );
            } else {
              color.setRGB(0.16, 0.52, 0.66);
            }
            // Visible shoreline foam on shallow water edges (rivers, lakes, beach, pools).
            if (gy > CONFIG.WATER_LEVEL - 0.35 && dominant !== "terrorcore") {
              const foamT = THREE.MathUtils.clamp((gy - (CONFIG.WATER_LEVEL - 0.35)) / 0.30, 0, 1);
              const foamAmt = foamT * foamT * 0.78;
              color.r = THREE.MathUtils.lerp(color.r, 0.84, foamAmt);
              color.g = THREE.MathUtils.lerp(color.g, 0.93, foamAmt);
              color.b = THREE.MathUtils.lerp(color.b, 0.96, foamAmt);
            }
            splats.pushSplat(center, scales, quat, dominant === "sea" ? 0.58 : 0.68, color);
          }
        }
      }

      for (const well of wells) {
        const count = lod === 0 ? 7 : 3;
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2;
          const rad = i === 0 ? 0 : 0.34;
          center.set(well.lx + Math.cos(ang) * rad, well.y + 0.46, well.lz + Math.sin(ang) * rad);
          // Crisp 2DGS well water disc with subtle edge foam rim.
          scales.set(0.28, 0, 0.28);
          quat.identity();
          if (i > 0) {
            color.setRGB(0.46, 0.72, 0.82);
          } else {
            color.setRGB(0.14, 0.50, 0.68);
          }
          splats.pushSplat(center, scales, quat, 0.78, color);
        }
      }
    },
  });

  mesh.position.set(originX, 0, originZ);
  mesh.objectModifier = createChunkModifier(
    new THREE.Vector2(originX, originZ),
    grassStart,
    foliageStart,
    waterStart
  );
  mesh.updateGenerator();

  return {
    key: `${cx},${cz}`,
    cx,
    cz,
    lod,
    numSplats: mesh.numSplats,
    colliders,
    portals,
    mesh,
  };
}

export class ChunkManager {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.totalChunkSplats = 0;
  }

  _pickLod(distChunks, prevLod) {
    const { lod0In, lod0Out, lod1In, lod1Out } = CONFIG.LOD_THRESHOLDS;
    if (prevLod === 0) {
      if (distChunks <= lod0Out) return 0;
      return distChunks <= lod1Out ? 1 : 2;
    }
    if (prevLod === 1) {
      if (distChunks <= lod0In) return 0;
      if (distChunks <= lod1Out) return 1;
      return 2;
    }
    if (prevLod === 2) {
      if (distChunks <= lod0In) return 0;
      if (distChunks <= lod1In) return 1;
      return 2;
    }
    if (distChunks <= lod0In) return 0;
    if (distChunks <= lod1In) return 1;
    return 2;
  }

  _estimateSplats(lod, cx, cz) {
    const cfg = getEffectiveLodConfig(lod);
    const dom = getBiomeWeights(cx * CONFIG.CHUNK_SIZE, cz * CONFIG.CHUNK_SIZE).dominant;
    const base = cfg.groundGrid * cfg.groundGrid + Math.floor(cfg.waterGrid * cfg.waterGrid * 0.4);
    if (dom === "cave") return base + cfg.ceilingGrid * cfg.ceilingGrid + Math.round(450 * CONFIG.DENSITY_SCALE);
    if (dom === "sea") return base + cfg.waterGrid * cfg.waterGrid + Math.round(450 * CONFIG.DENSITY_SCALE);
    if (dom === "liminal") return base + cfg.ceilingGrid * cfg.ceilingGrid + Math.round(1050 * Math.sqrt(CONFIG.DENSITY_SCALE));
    if (dom === "dreamcore") return base + cfg.dreamGrassCount + cfg.trunkSplats * 2 + cfg.foliageSplats * 2 + 60;
    if (dom === "terrorcore") return base + cfg.terrorAshCount + cfg.trunkSplats * 3 + cfg.speleothemSplats * 3 + 90;
    if (dom === "conifer") return base + cfg.coniferGrassCount + (cfg.pineTrunkSplats + cfg.pineFoliageSplats) * 3 + 50;
    return base + cfg.grassCount + cfg.trunkSplats * 2 + cfg.foliageSplats * 2;
  }

  rebuildAll() {
    for (const chunk of this.chunks.values()) {
      this.scene.remove(chunk.mesh);
      chunk.mesh.dispose();
    }
    this.chunks.clear();
    this.totalChunkSplats = 0;
  }

  update(playerX, playerZ, elapsedSec, skyState, immediate = false, env = {}) {
    const isNumEnv = typeof env === "number";
    const underwaterFactor = isNumEnv ? env : (env?.underwaterFactor ?? 0);
    const sunDir = (!isNumEnv && env?.sunDir) || skyState?.sunDir || null;
    const camPos = !isNumEnv ? env?.camPos : null;
    const flashlightPos = !isNumEnv ? env?.flashlightPos : null;
    const flashlightDir = !isNumEnv ? env?.flashlightDir : null;
    const flashlightOn = !isNumEnv ? (env?.flashlightOn ?? 0) : 0;
    const flashlightColor = !isNumEnv ? env?.flashlightColor : null;
    const horrorFlicker = !isNumEnv ? (env?.horrorFlicker ?? 1.0) : 1.0;

    uTime.value = elapsedSec;
    uWindStrength.value = CONFIG.WIND_STRENGTH;
    uTint.value.set(skyState.splatTint.r, skyState.splatTint.g, skyState.splatTint.b);
    uAmbient.value.set(skyState.splatAmbient.r, skyState.splatAmbient.g, skyState.splatAmbient.b);
    uFogColor.value.set(skyState.fogColor.r, skyState.fogColor.g, skyState.fogColor.b);
    uPlayerXZ.value.set(playerX, playerZ);
    uFogStart.value = skyState.fogStart ?? CONFIG.FOG_START;
    uFogEnd.value = skyState.fogEnd ?? CONFIG.FOG_END;
    uUnderwater.value = underwaterFactor;
    if (sunDir) {
      uSunDir.value.set(sunDir.x, sunDir.y, sunDir.z);
    }
    if (camPos) {
      uCamPos.value.set(camPos.x, camPos.y, camPos.z);
    } else {
      uCamPos.value.set(playerX, CONFIG.EYE_HEIGHT, playerZ);
    }
    if (flashlightPos) {
      uFlashlightPos.value.set(flashlightPos.x, flashlightPos.y, flashlightPos.z);
    }
    if (flashlightDir) {
      uFlashlightDir.value.set(flashlightDir.x, flashlightDir.y, flashlightDir.z);
    }
    uFlashlightOn.value = flashlightOn;
    if (flashlightColor) {
      uFlashlightColor.value.set(
        flashlightColor.x ?? flashlightColor.r ?? 1.0,
        flashlightColor.y ?? flashlightColor.g ?? 0.95,
        flashlightColor.z ?? flashlightColor.b ?? 0.85
      );
    }
    uHorrorFlicker.value = horrorFlicker;

    const size = CONFIG.CHUNK_SIZE;
    const pcx = Math.floor((playerX + size * 0.5) / size);
    const pcz = Math.floor((playerZ + size * 0.5) / size);
    const r = CONFIG.CHUNK_RADIUS;
    const pruneR = CONFIG.CHUNK_PRUNE_RADIUS;

    const desired = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const centerX = cx * size;
        const centerZ = cz * size;
        const distChunks = Math.hypot(centerX - playerX, centerZ - playerZ) / size;
        if (distChunks <= pruneR) {
          const key = `${cx},${cz}`;
          const existing = this.chunks.get(key);
          const targetLod = this._pickLod(distChunks, existing ? existing.lod : undefined);
          desired.push({ key, cx, cz, distChunks, targetLod });
        }
      }
    }
    desired.sort((a, b) => a.distChunks - b.distChunks);

    const maxBudget = Math.max(0, CONFIG.MAX_VISIBLE_SPLATS - 2800);
    const desiredMap = new Map();
    let plannedSplats = 0;
    for (const item of desired) {
      let lod = item.targetLod;
      let cost = this._estimateSplats(lod, item.cx, item.cz);
      while (lod < 2 && plannedSplats + cost > maxBudget) {
        lod++;
        cost = this._estimateSplats(lod, item.cx, item.cz);
      }
      if (plannedSplats + cost <= maxBudget) {
        plannedSplats += cost;
        desiredMap.set(item.key, { ...item, targetLod: lod });
      }
    }

    for (const [key, chunk] of this.chunks.entries()) {
      if (!desiredMap.has(key)) {
        this.scene.remove(chunk.mesh);
        chunk.mesh.dispose();
        this.chunks.delete(key);
      }
    }

    let builtThisFrame = 0;
    const buildCap = immediate ? 999 : CONFIG.CHUNKS_PER_FRAME;
    for (const item of desiredMap.values()) {
      const existing = this.chunks.get(item.key);
      if (!existing || existing.lod !== item.targetLod) {
        if (builtThisFrame >= buildCap) continue;
        if (existing) {
          this.scene.remove(existing.mesh);
          existing.mesh.dispose();
          this.chunks.delete(item.key);
        }
        const built = buildChunkData(item.cx, item.cz, item.targetLod);
        this.chunks.set(item.key, built);
        this.scene.add(built.mesh);
        builtThisFrame++;
      }
    }

    let sum = 0;
    for (const chunk of this.chunks.values()) {
      chunk.mesh.updateVersion();
      sum += chunk.mesh.numSplats || chunk.mesh.packedSplats?.numSplats || 0;
    }
    this.totalChunkSplats = sum;
  }

  getChunkCount() {
    return this.chunks.size;
  }

  getNearbyColliders(worldX, worldZ, radius = 6) {
    const size = CONFIG.CHUNK_SIZE;
    const pcx = Math.floor((worldX + size * 0.5) / size);
    const pcz = Math.floor((worldZ + size * 0.5) / size);
    const results = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.chunks.get(`${pcx + dx},${pcz + dz}`);
        if (!chunk || !chunk.colliders) continue;
        for (const c of chunk.colliders) {
          const cr = c.r ?? Math.hypot(c.halfW || 0, c.halfD || 0);
          if (Math.hypot(c.x - worldX, c.z - worldZ) <= radius + cr) {
            results.push(c);
          }
        }
      }
    }
    return results;
  }

  checkPortal(worldX, worldZ) {
    const size = CONFIG.CHUNK_SIZE;
    const pcx = Math.floor((worldX + size * 0.5) / size);
    const pcz = Math.floor((worldZ + size * 0.5) / size);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.chunks.get(`${pcx + dx},${pcz + dz}`);
        if (!chunk || !chunk.portals) continue;
        for (const p of chunk.portals) {
          if (Math.hypot(p.x - worldX, p.z - worldZ) <= p.radius) {
            return p;
          }
        }
      }
    }
    return null;
  }

  resolveCollisions(worldX, worldZ, footY, playerHeight = CONFIG.EYE_HEIGHT) {
    if (!CONFIG.ENABLE_COLLISIONS) {
      return { dx: 0, dz: 0, supportY: -Infinity, hitCount: 0, hitKind: null };
    }

    const size = CONFIG.CHUNK_SIZE;
    const pcx = Math.floor((worldX + size * 0.5) / size);
    const pcz = Math.floor((worldZ + size * 0.5) / size);
    const nearby = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.chunks.get(`${pcx + dx},${pcz + dz}`);
        if (chunk?.colliders) {
          for (const c of chunk.colliders) nearby.push(c);
        }
      }
    }

    let x = worldX;
    let z = worldZ;
    let supportY = -Infinity;
    let hitCount = 0;
    let hitKind = null;
    const pRad = CONFIG.PLAYER_RADIUS;

    for (let pass = 0; pass < 2; pass++) {
      for (const c of nearby) {
        if (footY + playerHeight < c.minY || footY + 0.28 > c.maxY) continue;

        if (c.halfW !== undefined) {
          const cx = THREE.MathUtils.clamp(x, c.x - c.halfW, c.x + c.halfW);
          const cz = THREE.MathUtils.clamp(z, c.z - c.halfD, c.z + c.halfD);
          const vx = x - cx;
          const vz = z - cz;
          const distSq = vx * vx + vz * vz;
          if (distSq < pRad * pRad) {
            const dist = Math.sqrt(distSq);
            if (dist > 1e-4) {
              const push = pRad - dist;
              x += (vx / dist) * push;
              z += (vz / dist) * push;
            } else {
              x += pRad;
            }
            if (pass === 0) {
              hitCount++;
              hitKind = c.kind;
            }
          }
          continue;
        }

        const vx = x - c.x;
        const vz = z - c.z;
        const distSq = vx * vx + vz * vz;

        if (c.walkable && footY >= c.maxY - 0.32 && footY <= c.maxY + 0.5) {
          const standR = c.r + pRad * 0.45;
          if (distSq <= standR * standR && c.maxY > supportY) {
            supportY = c.maxY;
          }
          continue;
        }

        const minDist = c.r + pRad;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const nx = dist > 1e-4 ? vx / dist : 1;
          const nz = dist > 1e-4 ? vz / dist : 0;
          const push = minDist - dist;
          x += nx * push;
          z += nz * push;
          if (pass === 0) {
            hitCount++;
            hitKind = c.kind;
          }
        }
      }
    }

    return {
      dx: x - worldX,
      dz: z - worldZ,
      supportY,
      hitCount,
      hitKind,
    };
  }
}
