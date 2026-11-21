import * as THREE from "three";
import { SplatMesh } from "@sparkjsdev/spark";
import { getTerrainHeight } from "./terrain.js";

const UP = new THREE.Vector3(0, 1, 0);

function setMeshRecolor(mesh, r, g, b) {
  if (mesh.recolor && typeof mesh.recolor.setRGB === "function") {
    mesh.recolor.setRGB(r, g, b);
  } else {
    mesh.recolor = new THREE.Color(r, g, b);
  }
}

function pushSegment(
  splats,
  ax,
  ay,
  az,
  bx,
  by,
  bz,
  rStart,
  rEnd,
  count,
  colorFn,
  opacity,
  center,
  scales,
  quat,
  color
) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.max(0.05, Math.hypot(dx, dy, dz));
  const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
  if (dir.y < -0.999) {
    quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  } else {
    quat.setFromUnitVectors(UP, dir);
  }

  const stepLen = len / Math.max(1, count);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    center.set(ax + dx * t, ay + dy * t, az + dz * t);
    const r = THREE.MathUtils.lerp(rStart, rEnd, t);
    scales.set(r, Math.max(r * 0.9, stepLen * 0.85), r);
    colorFn(t, i, color);
    splats.pushSplat(center, scales, quat, opacity, color);
  }
}

function pushRing(
  splats,
  cx,
  cy,
  cz,
  radius,
  count,
  sx,
  sy,
  sz,
  tiltX,
  tiltZ,
  colorFn,
  opacity,
  center,
  scales,
  quat,
  color
) {
  const tiltQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, 0, tiltZ));
  const localPt = new THREE.Vector3();
  const tangQuat = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const ang = t * Math.PI * 2;
    localPt.set(Math.cos(ang) * radius, 0, Math.sin(ang) * radius).applyQuaternion(tiltQuat);
    center.set(cx + localPt.x, cy + localPt.y, cz + localPt.z);
    tangQuat.setFromAxisAngle(UP, -ang);
    quat.copy(tiltQuat).multiply(tangQuat);
    scales.set(sx, sy, sz);
    colorFn(t, i, color);
    splats.pushSplat(center, scales, quat, opacity, color);
  }
}

// 1. Meadow — Monolito Armónico (~104 splats): dark gold-banded hovering obelisk + glowing golden halo ring.
function buildMeadowObelisk() {
  return new SplatMesh({
    maxSplats: 120,
    constructSplats: (splats) => {
      const center = new THREE.Vector3();
      const scales = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const color = new THREE.Color();

      // 4 tapered dark basalt corner edges
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      for (const [cx, cz] of corners) {
        pushSegment(
          splats,
          cx * 0.28, 0.25, cz * 0.28,
          cx * 0.14, 2.35, cz * 0.14,
          0.11, 0.06, 10,
          (t, i, c) => {
            const v = 0.08 + t * 0.06 + (i % 2) * 0.015;
            c.setRGB(v * 0.92, v * 0.95, v * 1.15);
          },
          0.96,
          center, scales, quat, color
        );
      }

      // Obelisk core & pyramidion cap
      pushSegment(
        splats,
        0, 0.22, 0,
        0, 2.68, 0,
        0.24, 0.03, 18,
        (t, _i, c) => {
          if (t > 0.84) c.setRGB(0.95, 0.78, 0.28);
          else c.setRGB(0.09 + t * 0.05, 0.10 + t * 0.05, 0.14 + t * 0.06);
        },
        0.96,
        center, scales, quat, color
      );

      // 2 inlaid gold bands
      for (const bandY of [1.05, 1.82]) {
        const r = THREE.MathUtils.lerp(0.32, 0.20, (bandY - 0.25) / 2.1);
        pushRing(
          splats,
          0, bandY, 0, r, 10,
          0.075, 0.045, 0.075, 0, 0,
          (_t, i, c) => c.setRGB(1.0, 0.82 + (i % 2) * 0.08, 0.28),
          0.98,
          center, scales, quat, color
        );
      }

      // Hovering glowing golden halo ring
      pushRing(
        splats,
        0, 2.15, 0, 0.96, 26,
        0.055, 0.055, 0.14, 0.26, -0.18,
        (t, _i, c) => {
          const glow = 0.88 + 0.12 * Math.sin(t * Math.PI * 6);
          c.setRGB(1.0 * glow, 0.86 * glow, 0.34 * glow);
        },
        0.92,
        center, scales, quat, color
      );
    },
  });
}

// 2. Conifer — Cairn Antiguo (~104 splats): stacked mossy stones crowned with a soft emerald rune crystal.
function buildConiferCairn() {
  return new SplatMesh({
    maxSplats: 120,
    constructSplats: (splats) => {
      const center = new THREE.Vector3();
      const scales = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const color = new THREE.Color();

      const layers = [
        { y: 0.22, rx: 0.68, ry: 0.22, n: 18 },
        { y: 0.58, rx: 0.54, ry: 0.19, n: 15 },
        { y: 0.90, rx: 0.42, ry: 0.17, n: 13 },
        { y: 1.19, rx: 0.32, ry: 0.15, n: 11 },
        { y: 1.44, rx: 0.23, ry: 0.13, n: 9 },
      ];

      for (let li = 0; li < layers.length; li++) {
        const L = layers[li];
        for (let i = 0; i < L.n; i++) {
          const ang = (i / L.n) * Math.PI * 2 + li * 0.7;
          const radial = i % 3 === 0 ? 0.35 : 0.78;
          center.set(
            Math.cos(ang) * L.rx * radial,
            L.y + Math.sin(i * 2.1 + li) * L.ry * 0.28,
            Math.sin(ang) * L.rx * radial
          );
          quat.setFromEuler(new THREE.Euler(0.15 * Math.sin(i), ang, 0.12 * Math.cos(i)));
          scales.set(L.rx * 0.42, L.ry * 0.9, L.rx * 0.38);
          const mossy = (i + li) % 3 === 0;
          if (mossy) {
            color.setRGB(0.20, 0.42 + (i % 2) * 0.08, 0.22);
          } else {
            const g = 0.26 + ((i * 7 + li) % 5) * 0.03;
            color.setRGB(g * 0.95, g, g * 0.96);
          }
          splats.pushSplat(center, scales, quat, 0.96, color);
        }
      }

      // Soft emerald rune crystal crown
      pushSegment(
        splats,
        0, 1.66, 0,
        0, 2.52, 0,
        0.16, 0.035, 16,
        (t, _i, c) => c.setRGB(0.18 + t * 0.35, 0.92 + t * 0.08, 0.56 + t * 0.28),
        0.95,
        center, scales, quat, color
      );
      pushSegment(
        splats,
        -0.14, 1.64, 0.06,
        -0.28, 2.12, 0.10,
        0.09, 0.025, 5,
        (t, _i, c) => c.setRGB(0.16 + t * 0.25, 0.85, 0.52 + t * 0.2),
        0.92,
        center, scales, quat, color
      );
      pushSegment(
        splats,
        0.14, 1.64, -0.05,
        0.26, 2.08, -0.09,
        0.09, 0.025, 5,
        (t, _i, c) => c.setRGB(0.16 + t * 0.25, 0.85, 0.52 + t * 0.2),
        0.92,
        center, scales, quat, color
      );

      // Emerald rune motes ring
      pushRing(
        splats,
        0, 2.05, 0, 0.62, 12,
        0.05, 0.05, 0.05, 0.14, 0.22,
        (_t, i, c) => c.setRGB(0.35, 1.0, 0.68 + (i % 2) * 0.15),
        0.88,
        center, scales, quat, color
      );
    },
  });
}

// 3. Cave — Cristal Maestro (~112 splats): tall radiant cyan-violet twin crystal spire pulsing softly.
function buildCaveCrystal() {
  return new SplatMesh({
    maxSplats: 124,
    constructSplats: (splats) => {
      const center = new THREE.Vector3();
      const scales = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const color = new THREE.Color();

      // Dark mineral base cluster
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * Math.PI * 2;
        const rad = 0.22 + (i % 3) * 0.18;
        center.set(Math.cos(ang) * rad, 0.14 + (i % 4) * 0.08, Math.sin(ang) * rad);
        quat.setFromEuler(new THREE.Euler(0.2 * Math.sin(i), ang, 0.2 * Math.cos(i)));
        scales.set(0.24, 0.18, 0.22);
        color.setRGB(0.14, 0.13, 0.24 + (i % 3) * 0.04);
        splats.pushSplat(center, scales, quat, 0.96, color);
      }

      // Main cyan-violet spire
      pushSegment(
        splats,
        -0.08, 0.25, 0.02,
        0.16, 3.05, -0.06,
        0.26, 0.04, 36,
        (t, _i, c) => c.setRGB(
          THREE.MathUtils.lerp(0.45, 0.42, t) + t * 0.35,
          THREE.MathUtils.lerp(0.22, 0.96, t),
          THREE.MathUtils.lerp(0.85, 1.0, t)
        ),
        0.95,
        center, scales, quat, color
      );

      // Twin secondary spire
      pushSegment(
        splats,
        0.14, 0.20, -0.08,
        -0.38, 2.30, 0.22,
        0.21, 0.035, 26,
        (t, _i, c) => c.setRGB(
          THREE.MathUtils.lerp(0.72, 0.48, t),
          THREE.MathUtils.lerp(0.24, 0.88, t),
          THREE.MathUtils.lerp(0.95, 1.0, t)
        ),
        0.94,
        center, scales, quat, color
      );

      // Flanking shards
      pushSegment(
        splats,
        0.25, 0.20, 0.22,
        0.64, 1.32, 0.44,
        0.13, 0.025, 8,
        (t, _i, c) => c.setRGB(0.32 + t * 0.3, 0.72 + t * 0.25, 1.0),
        0.92,
        center, scales, quat, color
      );
      pushSegment(
        splats,
        -0.28, 0.20, -0.22,
        -0.66, 1.24, -0.38,
        0.13, 0.025, 8,
        (t, _i, c) => c.setRGB(0.66, 0.35 + t * 0.45, 0.98),
        0.92,
        center, scales, quat, color
      );

      // Soft pulsing aura ring
      pushRing(
        splats,
        0, 1.75, 0, 0.85, 14,
        0.05, 0.05, 0.09, -0.32, 0.24,
        (t, _i, c) => c.setRGB(0.45 + 0.35 * Math.sin(t * Math.PI * 2), 0.92, 1.0),
        0.86,
        center, scales, quat, color
      );
    },
  });
}

// 4. Sea — Campana Sumergida (~108 splats): eerie golden diving bell with glowing seafoam rings underwater.
function buildSeaDivingBell() {
  return new SplatMesh({
    maxSplats: 124,
    constructSplats: (splats) => {
      const center = new THREE.Vector3();
      const scales = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const color = new THREE.Color();

      // Bell skirt & dome rings centered around local y = 0
      const bellRings = [
        { y: -0.68, r: 0.76, n: 18, sx: 0.14, sy: 0.22, sz: 0.18 },
        { y: -0.22, r: 0.66, n: 16, sx: 0.14, sy: 0.25, sz: 0.18 },
        { y: 0.26, r: 0.56, n: 14, sx: 0.14, sy: 0.25, sz: 0.18 },
        { y: 0.68, r: 0.34, n: 10, sx: 0.15, sy: 0.20, sz: 0.18 },
      ];
      for (const br of bellRings) {
        pushRing(
          splats,
          0, br.y, 0, br.r, br.n,
          br.sx, br.sy, br.sz, 0, 0,
          (_t, i, c) => {
            const patina = i % 4 === 0 ? 0.12 : 0;
            c.setRGB(0.76 - patina, 0.58 + patina * 0.4, 0.20 + patina * 0.9);
          },
          0.95,
          center, scales, quat, color
        );
      }

      // Crown cap & hoist ring
      pushSegment(
        splats,
        0, 0.78, 0,
        0, 1.24, 0,
        0.22, 0.08, 10,
        (_t, _i, c) => c.setRGB(0.84, 0.68, 0.28),
        0.96,
        center, scales, quat, color
      );

      // 4 glowing underwater portholes
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2;
        for (let k = 0; k < 3; k++) {
          center.set(
            Math.cos(ang) * 0.64,
            0.06 + (k - 1) * 0.05,
            Math.sin(ang) * 0.64
          );
          quat.setFromAxisAngle(UP, -ang);
          scales.set(0.08, 0.12, 0.12);
          color.setRGB(0.68, 1.0, 0.88);
          splats.pushSplat(center, scales, quat, 0.96, color);
        }
      }

      // 2 glowing seafoam rings underwater
      pushRing(
        splats,
        0, -0.95, 0, 1.08, 14,
        0.055, 0.055, 0.14, 0.12, -0.1,
        (_t, _i, c) => c.setRGB(0.45, 0.98, 0.86),
        0.86,
        center, scales, quat, color
      );
      pushRing(
        splats,
        0, 0.52, 0, 1.18, 14,
        0.05, 0.05, 0.13, -0.16, 0.14,
        (_t, _i, c) => c.setRGB(0.55, 1.0, 0.90),
        0.84,
        center, scales, quat, color
      );
    },
  });
}

// 5. Liminal — Reloj Detenido (~112 splats): tall dark-wood surreal grandfather clock monolith with pale glowing dial.
function buildLiminalClock() {
  return new SplatMesh({
    maxSplats: 124,
    constructSplats: (splats) => {
      const center = new THREE.Vector3();
      const scales = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const color = new THREE.Color();

      // Dark wood cabinet plinth + waist + hood (62 splats)
      for (let row = 0; row < 14; row++) {
        const y = 0.12 + row * 0.21;
        const halfW = row < 2 ? 0.36 : row < 10 ? 0.28 : 0.34;
        const halfD = row < 2 ? 0.24 : 0.20;
        const pts = [
          [-halfW, -halfD],
          [halfW, -halfD],
          [-halfW, halfD],
          [halfW, halfD],
        ];
        for (let p = 0; p < pts.length; p++) {
          center.set(pts[p][0], y, pts[p][1]);
          quat.identity();
          scales.set(0.16, 0.15, 0.15);
          const shade = 0.11 + ((row + p) % 3) * 0.025;
          color.setRGB(shade * 1.45, shade * 0.95, shade * 0.62);
          splats.pushSplat(center, scales, quat, 0.97, color);
        }
      }
      // Crown pediment & finial (6 + 8 = 14 splats)
      pushSegment(
        splats,
        -0.36, 3.02, 0,
        0.36, 3.02, 0,
        0.14, 0.14, 6,
        (_t, _i, c) => c.setRGB(0.18, 0.11, 0.07),
        0.97,
        center, scales, quat, color
      );
      pushSegment(
        splats,
        0, 3.04, 0,
        0, 3.36, 0,
        0.10, 0.03, 6,
        (t, _i, c) => c.setRGB(0.45 + t * 0.3, 0.35 + t * 0.25, 0.16),
        0.97,
        center, scales, quat, color
      );

      // Pale glowing clock dial on front (+Z) and back (-Z) so it watches from either corridor direction
      for (const faceZ of [0.24, -0.24]) {
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2;
          center.set(Math.cos(ang) * 0.21, 2.48 + Math.sin(ang) * 0.21, faceZ);
          quat.identity();
          scales.set(0.085, 0.085, 0.045);
          color.setRGB(0.95, 0.94, 0.80);
          splats.pushSplat(center, scales, quat, 0.96, color);
        }
        // Center face glow
        center.set(0, 2.48, faceZ);
        scales.set(0.17, 0.17, 0.04);
        color.setRGB(1.0, 0.98, 0.88);
        splats.pushSplat(center, scales, quat, 0.96, color);

        // Frozen hands (stopped at 3:12)
        const handZ = faceZ + Math.sign(faceZ) * 0.035;
        pushSegment(
          splats,
          0, 2.48, handZ,
          0.16, 2.48, handZ,
          0.024, 0.018, 2,
          (_t, _i, c) => c.setRGB(0.04, 0.04, 0.05),
          0.98,
          center, scales, quat, color
        );
        pushSegment(
          splats,
          0, 2.48, handZ,
          0.03, 2.66, handZ,
          0.022, 0.016, 2,
          (_t, _i, c) => c.setRGB(0.04, 0.04, 0.05),
          0.98,
          center, scales, quat, color
        );
      }

      // Golden pendulum inside waist
      pushSegment(
        splats,
        0, 1.85, 0,
        0.04, 0.88, 0,
        0.03, 0.11, 10,
        (t, _i, c) => c.setRGB(0.86 + t * 0.1, 0.72 + t * 0.08, 0.30),
        0.95,
        center, scales, quat, color
      );
    },
  });
}

// 6. Dreamcore — Prisma Onírico (~104 splats): rotating pastel pink-cyan octahedral prism + orbiting stars.
function buildDreamcorePrism() {
  return new SplatMesh({
    maxSplats: 120,
    constructSplats: (splats) => {
      const center = new THREE.Vector3();
      const scales = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const color = new THREE.Color();

      const verts = [
        [0, 1.08, 0], // top
        [0, -1.08, 0], // bottom
        [0.78, 0, 0],
        [0, 0, 0.78],
        [-0.78, 0, 0],
        [0, 0, -0.78],
      ];
      const edges = [
        [0, 2], [0, 3], [0, 4], [0, 5],
        [1, 2], [1, 3], [1, 4], [1, 5],
        [2, 3], [3, 4], [4, 5], [5, 2],
      ];

      // 12 prism edges × 6 splats = 72 splats
      for (let ei = 0; ei < edges.length; ei++) {
        const a = verts[edges[ei][0]];
        const b = verts[edges[ei][1]];
        const isUpper = ei < 4;
        const isLower = ei >= 4 && ei < 8;
        pushSegment(
          splats,
          a[0], a[1], a[2],
          b[0], b[1], b[2],
          0.11, 0.11, 6,
          (t, _i, c) => {
            if (isUpper) {
              c.setRGB(
                THREE.MathUtils.lerp(1.0, 0.64, t),
                THREE.MathUtils.lerp(0.62, 0.88, t),
                THREE.MathUtils.lerp(0.88, 1.0, t)
              );
            } else if (isLower) {
              c.setRGB(
                THREE.MathUtils.lerp(0.55, 0.96, t),
                THREE.MathUtils.lerp(0.92, 0.66, t),
                1.0
              );
            } else {
              c.setRGB(0.85, 0.78 + 0.18 * t, 1.0);
            }
          },
          0.90,
          center, scales, quat, color
        );
      }

      // Luminous pastel inner core (8 splats)
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        center.set(Math.cos(ang) * 0.22, (i % 2 === 0 ? 1 : -1) * 0.18, Math.sin(ang) * 0.22);
        quat.identity();
        scales.set(0.24, 0.24, 0.24);
        color.setRGB(1.0, 0.84, 0.96);
        splats.pushSplat(center, scales, quat, 0.78, color);
      }

      // Orbiting tiny stars on two tilted rings (12 + 12 = 24 splats)
      pushRing(
        splats,
        0, 0.05, 0, 1.28, 12,
        0.055, 0.055, 0.055, 0.42, -0.25,
        (_t, i, c) => {
          if (i % 2 === 0) c.setRGB(1.0, 0.94, 0.68);
          else c.setRGB(0.66, 0.96, 1.0);
        },
        0.95,
        center, scales, quat, color
      );
      pushRing(
        splats,
        0, -0.05, 0, 1.54, 12,
        0.048, 0.048, 0.048, -0.52, 0.36,
        (_t, i, c) => {
          if (i % 2 === 0) c.setRGB(1.0, 0.72, 0.92);
          else c.setRGB(0.96, 0.96, 1.0);
        },
        0.92,
        center, scales, quat, color
      );
    },
  });
}

// 7. Terrorcore — Altar que Observa (~114 splats): jagged obsidian altar crowned by a giant glowing crimson eye.
function buildTerrorcoreAltar() {
  return new SplatMesh({
    maxSplats: 124,
    constructSplats: (splats) => {
      const center = new THREE.Vector3();
      const scales = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const color = new THREE.Color();

      // Central jagged obsidian pedestal (20 splats)
      pushSegment(
        splats,
        0, 0.05, 0,
        0, 1.58, 0,
        0.52, 0.32, 20,
        (t, i, c) => {
          const ember = i % 5 === 0 ? 0.14 : 0;
          c.setRGB(0.07 + ember, 0.05 + t * 0.02, 0.07 + t * 0.03);
        },
        0.98,
        center, scales, quat, color
      );

      // 4 jagged obsidian claw-horns cradling the eye (4 × 8 = 32 splats)
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
        const bx = Math.cos(ang) * 0.56;
        const bz = Math.sin(ang) * 0.56;
        const tx = Math.cos(ang) * 0.82;
        const tz = Math.sin(ang) * 0.82;
        pushSegment(
          splats,
          bx, 0.20, bz,
          tx, 2.02, tz,
          0.16, 0.04, 8,
          (t, _k, c) => c.setRGB(0.09 + t * 0.18, 0.04, 0.06),
          0.97,
          center, scales, quat, color
        );
      }

      // Giant floating glowing crimson eye at y = 2.32 (62 splats total)
      const eyeY = 2.32;
      // Outer fiery crimson halo/lid ring (26 splats)
      pushRing(
        splats,
        0, eyeY, 0, 0.56, 26,
        0.09, 0.09, 0.12, Math.PI * 0.5, 0,
        (t, _i, c) => c.setRGB(0.95, 0.10 + 0.08 * Math.sin(t * Math.PI * 4), 0.14),
        0.94,
        center, scales, quat, color
      );
      // Inner sclera & glowing crimson iris sphere (18 + 12 = 30 splats)
      for (let i = 0; i < 18; i++) {
        const phi = Math.acos(1 - (2 * (i + 0.5)) / 18);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        center.set(
          Math.sin(phi) * Math.cos(theta) * 0.34,
          eyeY + Math.cos(phi) * 0.34,
          Math.sin(phi) * Math.sin(theta) * 0.34
        );
        quat.identity();
        scales.set(0.14, 0.14, 0.14);
        color.setRGB(0.92, 0.72, 0.70);
        splats.pushSplat(center, scales, quat, 0.96, color);
      }
      // Glowing crimson iris + vertical slit pupil on both +Z and -Z faces
      for (const side of [1, -1]) {
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          center.set(Math.cos(ang) * 0.14, eyeY + Math.sin(ang) * 0.14, side * 0.36);
          quat.identity();
          scales.set(0.10, 0.10, 0.06);
          color.setRGB(1.0, 0.08, 0.12);
          splats.pushSplat(center, scales, quat, 0.98, color);
        }
        // Vertical dark slit pupil (3 splats per side)
        pushSegment(
          splats,
          0, eyeY - 0.15, side * 0.42,
          0, eyeY + 0.15, side * 0.42,
          0.045, 0.045, 3,
          (_t, _i, c) => c.setRGB(0.02, 0.01, 0.02),
          0.99,
          center, scales, quat, color
        );
      }
    },
  });
}

const ANOMALY_SPECS = [
  {
    biome: "meadow",
    label: "Monolito Armónico",
    x: 18,
    z: -10,
    fixedY: null,
    meshOffsetY: 0.35,
    centerOffsetY: 1.45,
    bobAmp: 0.18,
    spinSpeed: 0.32,
    discoveredTint: [1.34, 1.28, 1.08],
    build: buildMeadowObelisk,
  },
  {
    biome: "conifer",
    label: "Cairn Antiguo",
    x: 176,
    z: -12,
    fixedY: null,
    meshOffsetY: 0.0,
    centerOffsetY: 1.35,
    bobAmp: 0.05,
    spinSpeed: 0.14,
    discoveredTint: [1.14, 1.38, 1.22],
    build: buildConiferCairn,
  },
  {
    biome: "cave",
    label: "Cristal Maestro",
    x: 8,
    z: 174,
    fixedY: null,
    meshOffsetY: 0.0,
    centerOffsetY: 1.55,
    bobAmp: 0.06,
    spinSpeed: 0.22,
    discoveredTint: [1.18, 1.34, 1.42],
    build: buildCaveCrystal,
  },
  {
    biome: "sea",
    label: "Campana Sumergida",
    x: -168,
    z: 8,
    fixedY: -3.4,
    meshOffsetY: 0.0,
    centerOffsetY: 0.0,
    bobAmp: 0.16,
    spinSpeed: 0.18,
    discoveredTint: [1.32, 1.36, 1.24],
    build: buildSeaDivingBell,
  },
  {
    biome: "liminal",
    label: "Reloj Detenido",
    x: 12,
    z: -182,
    fixedY: 1.0,
    meshOffsetY: 0.0,
    centerOffsetY: 1.4,
    bobAmp: 0.03,
    spinSpeed: 0.08,
    discoveredTint: [1.32, 1.30, 1.16],
    build: buildLiminalClock,
  },
  {
    biome: "dreamcore",
    label: "Prisma Onírico",
    x: 162,
    z: -162,
    fixedY: null,
    meshOffsetY: 1.85,
    centerOffsetY: 1.85,
    bobAmp: 0.22,
    spinSpeed: 0.48,
    discoveredTint: [1.34, 1.24, 1.38],
    build: buildDreamcorePrism,
  },
  {
    biome: "terrorcore",
    label: "Altar que Observa",
    x: -162,
    z: 162,
    fixedY: null,
    meshOffsetY: 0.0,
    centerOffsetY: 1.65,
    bobAmp: 0.05,
    spinSpeed: 0.20,
    discoveredTint: [1.40, 1.12, 1.14],
    build: buildTerrorcoreAltar,
  },
];

export class AnomalyManager {
  constructor(scene, audio, onDiscover = null) {
    this.scene = scene;
    this.audio = audio;
    this.onDiscover = onDiscover;
    this.discovered = new Set();
    this.anomalies = [];
    this._byBiome = new Map();

    for (let i = 0; i < ANOMALY_SPECS.length; i++) {
      const spec = ANOMALY_SPECS[i];
      const groundY = spec.fixedY !== null ? spec.fixedY : getTerrainHeight(spec.x, spec.z);
      const meshBaseY = groundY + spec.meshOffsetY;
      const centerY = groundY + spec.centerOffsetY;

      const mesh = spec.build();
      mesh.position.set(spec.x, meshBaseY, spec.z);
      setMeshRecolor(mesh, 1, 1, 1);
      this.scene.add(mesh);

      const entry = {
        index: i,
        biome: spec.biome,
        label: spec.label,
        x: spec.x,
        y: centerY,
        z: spec.z,
        meshBaseY,
        bobAmp: spec.bobAmp,
        spinSpeed: spec.spinSpeed,
        discoveredTint: spec.discoveredTint,
        phase: i * 1.17,
        mesh,
      };
      this.anomalies.push(entry);
      this._byBiome.set(spec.biome, entry);
    }

    this._nearest = {
      biome: this.anomalies[0].biome,
      label: this.anomalies[0].label,
      distance: 0,
      discovered: false,
    };
  }

  update(dt, elapsedSec, playerPos) {
    let bestEntry = null;
    let bestDist = Infinity;

    for (const a of this.anomalies) {
      const bob = Math.sin(elapsedSec * 1.35 + a.phase) * a.bobAmp;
      a.mesh.position.y = a.meshBaseY + bob;
      a.mesh.rotation.y += a.spinSpeed * dt;

      const isDisc = this.discovered.has(a.biome);
      if (isDisc) {
        const pulse = 1.0 + 0.06 * Math.sin(elapsedSec * 3.1 + a.phase);
        setMeshRecolor(
          a.mesh,
          a.discoveredTint[0] * pulse,
          a.discoveredTint[1] * pulse,
          a.discoveredTint[2] * pulse
        );
      }

      if (playerPos) {
        const dx = playerPos.x - a.x;
        const dy = playerPos.y - a.y;
        const dz = playerPos.z - a.z;
        const dist = Math.hypot(dx, dy, dz);

        if (dist < bestDist) {
          bestDist = dist;
          bestEntry = a;
        }

        if (dist < 4.5 && !isDisc) {
          this.discovered.add(a.biome);
          this.audio?.playAnomalyChime?.(a.index);
          setMeshRecolor(
            a.mesh,
            a.discoveredTint[0],
            a.discoveredTint[1],
            a.discoveredTint[2]
          );
          this.onDiscover?.(a.biome, this.discovered.size, this.anomalies.length, a.label);
        }
      }
    }

    if (bestEntry) {
      this._nearest = {
        biome: bestEntry.biome,
        label: bestEntry.label,
        distance: Number(bestDist.toFixed(2)),
        discovered: this.discovered.has(bestEntry.biome),
      };
    }
  }

  getState() {
    return {
      discoveredCount: this.discovered.size,
      total: this.anomalies.length,
      discovered: [...this.discovered],
      nearest: { ...this._nearest },
    };
  }

  getPosition(biome) {
    const a = this._byBiome.get(biome);
    if (!a) return null;
    return { x: a.x, y: a.y, z: a.z };
  }

  dispose() {
    for (const a of this.anomalies) {
      this.scene.remove(a.mesh);
      a.mesh.dispose();
    }
    this.anomalies.length = 0;
    this._byBiome.clear();
  }
}

// Standalone closed dark oak door in a yellow-wallpaper Backrooms frame (~114 splats).
function buildPhantomDoorwayMesh() {
  return new SplatMesh({
    maxSplats: 128,
    constructSplats: (splats) => {
      const center = new THREE.Vector3();
      const scales = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const color = new THREE.Color();

      // Left and right yellow-wallpaper wall piers (20 + 20 = 40 splats)
      for (const side of [-1, 1]) {
        for (let row = 0; row < 10; row++) {
          const y = 0.17 + row * 0.34;
          for (let col = 0; col < 2; col++) {
            const x = side * (0.76 + col * 0.34);
            center.set(x, y, 0);
            quat.identity();
            scales.set(0.22, 0.21, 0.14);
            if (row === 0) {
              // Dark damp wooden baseboard
              color.setRGB(0.32, 0.26, 0.16);
            } else {
              const stain = ((row * 3 + col) % 4) * 0.025;
              color.setRGB(0.76 - stain, 0.68 - stain, 0.34 - stain * 0.5);
            }
            splats.pushSplat(center, scales, quat, 0.97, color);
          }
        }
      }

      // Top yellow-wallpaper header above doorway (16 splats)
      for (let col = 0; col < 8; col++) {
        const x = -1.05 + col * 0.30;
        for (let row = 0; row < 2; row++) {
          center.set(x, 2.74 + row * 0.38, 0);
          quat.identity();
          scales.set(0.21, 0.22, 0.14);
          const stain = ((col + row) % 3) * 0.02;
          color.setRGB(0.75 - stain, 0.67 - stain, 0.33);
          splats.pushSplat(center, scales, quat, 0.97, color);
        }
      }

      // Dark wood door jamb & lintel frame (14 splats)
      for (let i = 0; i < 5; i++) {
        const y = 0.26 + i * 0.52;
        for (const side of [-1, 1]) {
          center.set(side * 0.56, y, 0.03);
          quat.identity();
          scales.set(0.065, 0.28, 0.15);
          color.setRGB(0.18, 0.11, 0.07);
          splats.pushSplat(center, scales, quat, 0.98, color);
        }
      }
      for (let i = 0; i < 4; i++) {
        center.set(-0.42 + i * 0.28, 2.48, 0.03);
        quat.identity();
        scales.set(0.17, 0.07, 0.15);
        color.setRGB(0.18, 0.11, 0.07);
        splats.pushSplat(center, scales, quat, 0.98, color);
      }

      // Closed dark oak door panel (32 splats: 4 cols × 8 rows)
      for (let row = 0; row < 8; row++) {
        const y = 0.24 + row * 0.29;
        for (let col = 0; col < 4; col++) {
          const x = -0.375 + col * 0.25;
          center.set(x, y, -0.01);
          quat.identity();
          scales.set(0.15, 0.17, 0.075);
          const grain = ((row * 5 + col * 3) % 4) * 0.016;
          color.setRGB(0.23 - grain, 0.14 - grain * 0.7, 0.08 - grain * 0.4);
          splats.pushSplat(center, scales, quat, 0.98, color);
        }
      }

      // Brass doorknob on both sides of door (2 splats)
      for (const side of [1, -1]) {
        center.set(0.38, 1.06, side * 0.09);
        quat.identity();
        scales.set(0.055, 0.055, 0.055);
        color.setRGB(0.88, 0.72, 0.30);
        splats.pushSplat(center, scales, quat, 0.99, color);
      }

      // Dim eerie light slit underneath the closed door (10 splats)
      for (let i = 0; i < 10; i++) {
        const x = -0.45 + (i / 9) * 0.90;
        center.set(x, 0.03, 0.06 * (i % 2 === 0 ? 1 : -1));
        quat.identity();
        scales.set(0.12, 0.032, 0.18);
        color.setRGB(1.0, 0.95, 0.72);
        splats.pushSplat(center, scales, quat, 0.88, color);
      }
    },
  });
}

export class LiminalImpossibleController {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.phantomVisible = false;
    this.gazeShifts = 0;
    this.phantomPos = new THREE.Vector3(0, 1.0, -170);

    this.mesh = buildPhantomDoorwayMesh();
    this.mesh.visible = false;
    this.scene.add(this.mesh);

    this._hasAnchor = false;
    this._anchorPos = new THREE.Vector3();
    this._approachDir = new THREE.Vector3(0, 0, -1);
    this._readyForGazeTurn = false;
    this._approachedDoor = false;
    this._shiftCooldown = 0;

    this._horizDir = new THREE.Vector3();
    this._walkVec = new THREE.Vector3();
    this._toDoor = new THREE.Vector3();
  }

  _hidePhantom() {
    this.mesh.visible = false;
    this.phantomVisible = false;
    this._approachedDoor = false;
  }

  update(dt, biome, camWorldPos, camWorldDir, onImpossibleShift = null) {
    if (this._shiftCooldown > 0) {
      this._shiftCooldown = Math.max(0, this._shiftCooldown - dt);
    }

    if (biome !== "liminal" || !camWorldPos || !camWorldDir) {
      this.active = false;
      if (this.phantomVisible) this._hidePhantom();
      this._hasAnchor = false;
      this._readyForGazeTurn = false;
      return;
    }

    this.active = true;

    this._horizDir.set(camWorldDir.x, 0, camWorldDir.z);
    if (this._horizDir.lengthSq() < 1e-4) this._horizDir.set(0, 0, -1);
    this._horizDir.normalize();

    if (!this._hasAnchor) {
      this._anchorPos.set(camWorldPos.x, 1.0, camWorldPos.z);
      this._hasAnchor = true;
      this._readyForGazeTurn = false;
      return;
    }

    // Check interaction with an already materialized phantom doorway.
    if (this.phantomVisible) {
      const dx = this.phantomPos.x - camWorldPos.x;
      const dz = this.phantomPos.z - camWorldPos.z;
      const distToDoor = Math.hypot(dx, dz);

      let angleToDoorDeg = 180;
      if (distToDoor > 1e-4) {
        this._toDoor.set(dx / distToDoor, 0, dz / distToDoor);
        const dotDoor = THREE.MathUtils.clamp(this._horizDir.dot(this._toDoor), -1, 1);
        angleToDoorDeg = THREE.MathUtils.radToDeg(Math.acos(dotDoor));
      }

      if (distToDoor < 1.8) {
        this._approachedDoor = true;
      }

      const steppedIntoDoor = distToDoor < 1.15;
      const lookedAwayNearDoor = this._approachedDoor && distToDoor < 2.4 && angleToDoorDeg > 108;
      if ((steppedIntoDoor || lookedAwayNearDoor) && this._shiftCooldown <= 0) {
        this._shiftCooldown = 4.0;
        this.gazeShifts += 1;
        this._hidePhantom();
        this._hasAnchor = false;
        this._readyForGazeTurn = false;
        onImpossibleShift?.(24, 0);
        return;
      }
    }

    // Track walk distance (> 6 m) from last anchor.
    this._walkVec.set(camWorldPos.x - this._anchorPos.x, 0, camWorldPos.z - this._anchorPos.z);
    const walkDist = this._walkVec.length();
    if (walkDist > 6.0) {
      this._approachDir.copy(this._walkVec).divideScalar(walkDist);
      this._readyForGazeTurn = true;
    }

    // Once player walks > 6m and turns > 115° horizontally from their approach direction,
    // silently materialize/reposition the phantom doorway ~7.5m behind their current FOV.
    if (this._readyForGazeTurn) {
      const dotApproach = THREE.MathUtils.clamp(this._horizDir.dot(this._approachDir), -1, 1);
      const turnDeg = THREE.MathUtils.radToDeg(Math.acos(dotApproach));
      if (turnDeg > 115) {
        let canReposition = !this.phantomVisible;
        if (!canReposition) {
          const ex = this.phantomPos.x - camWorldPos.x;
          const ez = this.phantomPos.z - camWorldPos.z;
          const eDist = Math.hypot(ex, ez);
          if (eDist > 1e-4) {
            this._toDoor.set(ex / eDist, 0, ez / eDist);
            const eDot = THREE.MathUtils.clamp(this._horizDir.dot(this._toDoor), -1, 1);
            canReposition = THREE.MathUtils.radToDeg(Math.acos(eDot)) > 105;
          } else {
            canReposition = true;
          }
        }

        if (canReposition) {
          const doorX = camWorldPos.x - this._horizDir.x * 7.5;
          const doorZ = camWorldPos.z - this._horizDir.z * 7.5;
          this.phantomPos.set(doorX, 1.0, doorZ);
          this.mesh.position.copy(this.phantomPos);
          this.mesh.rotation.y = Math.atan2(camWorldPos.x - doorX, camWorldPos.z - doorZ);
          this.mesh.visible = true;
          this.phantomVisible = true;
          this._approachedDoor = false;
          this._anchorPos.set(camWorldPos.x, 1.0, camWorldPos.z);
          this._readyForGazeTurn = false;
        }
      }
    }
  }

  getDebugState() {
    return {
      active: this.active,
      phantomVisible: this.phantomVisible,
      gazeShifts: this.gazeShifts,
      phantomPos: this.phantomVisible
        ? {
            x: Number(this.phantomPos.x.toFixed(2)),
            y: Number(this.phantomPos.y.toFixed(2)),
            z: Number(this.phantomPos.z.toFixed(2)),
          }
        : null,
    };
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = null;
    }
  }
}
