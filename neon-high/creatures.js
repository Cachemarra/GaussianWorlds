import * as THREE from "three";
import { SplatMesh } from "@sparkjsdev/spark";
import { CONFIG } from "./config.js";
import { getTerrainHeight, getCaveCeilingHeight, getLiminalCeilingHeight } from "./terrain.js";

const MAX_CREATURE_SPLATS = 2600;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export class CreatureManager {
  constructor(scene) {
    this.scene = scene;
    this.creatures = [];
    this.activeBiome = "meadow";
    this.activeSplats = 0;

    this.mesh = new SplatMesh({
      maxSplats: MAX_CREATURE_SPLATS,
      constructSplats: (splats) => {
        // Pre-allocate at least 1 hidden splat so PackedSplats buffer initializes cleanly.
        splats.pushSplat(
          new THREE.Vector3(0, -50, 0),
          new THREE.Vector3(0, 0, 0),
          new THREE.Quaternion(),
          0,
          new THREE.Color(0, 0, 0)
        );
      },
    });
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this._center = new THREE.Vector3();
    this._scales = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._color = new THREE.Color();
    this._euler = new THREE.Euler();
    this._zeroScale = new THREE.Vector3(0, 0, 0);
  }

  _spawnCreature(biome, playerPos) {
    const ang = Math.random() * Math.PI * 2;
    const dist = biome === "liminal" ? rand(14, 28) : rand(4.5, 24);
    const x = playerPos.x + Math.cos(ang) * dist;
    const z = playerPos.z + Math.sin(ang) * dist;
    const gy = getTerrainHeight(x, z);

    let kind = "butterfly";
    let y = gy + 1.1;

    if (biome === "meadow") {
      const r = Math.random();
      if (r < 0.42) kind = "butterfly";
      else if (r < 0.72) {
        kind = "rabbit";
        y = Math.max(gy, CONFIG.WATER_LEVEL + 0.1);
      } else {
        kind = "bird";
        y = gy + rand(3.5, 8.5);
      }
    } else if (biome === "conifer") {
      if (Math.random() < 0.48) {
        kind = "deer";
        y = Math.max(gy, CONFIG.WATER_LEVEL + 0.1);
      } else {
        kind = "bird";
        y = gy + rand(4.0, 9.5);
      }
    } else if (biome === "sea") {
      if (gy < CONFIG.WATER_LEVEL - 1.2 && Math.random() < 0.85) {
        kind = Math.random() < 0.72 ? "fish" : "jellyfish";
        y = rand(gy + 0.6, CONFIG.WATER_LEVEL - 0.5);
      } else {
        kind = "bird";
        y = CONFIG.WATER_LEVEL + rand(4.5, 11.0);
      }
    } else if (biome === "cave") {
      if (Math.random() < 0.62) {
        kind = "bat";
        y = Math.min(getCaveCeilingHeight(x, z) - 0.9, gy + rand(2.5, 5.5));
      } else {
        kind = "wisp";
        y = gy + rand(1.0, 3.8);
      }
    } else if (biome === "liminal") {
      if (this.creatures.filter((c) => c.kind === "shadow_walker").length < 2) {
        kind = "shadow_walker";
        y = 1.0;
      } else {
        kind = "mote";
        y = rand(1.4, getLiminalCeilingHeight() - 0.7);
      }
    } else if (biome === "dreamcore") {
      kind = Math.random() < 0.52 ? "winged_eye" : "dream_orb";
      y = gy + rand(2.2, 6.5);
    } else if (biome === "terrorcore") {
      kind = Math.random() < 0.55 ? "terror_wisp" : "crawler";
      y = kind === "crawler" ? gy + 0.18 : gy + rand(1.8, 4.5);
    }

    const colorPick = Math.random();
    return {
      biome,
      kind,
      x,
      y,
      z,
      baseY: y,
      vx: 0,
      vz: 0,
      heading: rand(0, Math.PI * 2),
      speed:
        kind === "bird" || kind === "bat"
          ? rand(2.4, 4.0)
          : kind === "fish"
            ? rand(1.4, 2.5)
            : kind === "deer" || kind === "rabbit"
              ? rand(0.9, 1.8)
              : rand(0.4, 1.1),
      phase: rand(0, Math.PI * 2),
      turnTimer: rand(1.5, 4.5),
      colorPick,
    };
  }

  _push(idx, ox, oy, oz, sx, sy, sz, rx, ry, rz, opacity, r, g, b) {
    if (idx >= MAX_CREATURE_SPLATS) return idx;
    this._center.set(ox, oy, oz);
    this._scales.set(sx, sy, sz);
    this._euler.set(rx, ry, rz);
    this._quat.setFromEuler(this._euler);
    this._color.setRGB(r, g, b);
    this.mesh.packedSplats.setSplat(idx, this._center, this._scales, this._quat, opacity, this._color);
    return idx + 1;
  }

  update(dt, elapsedSec, playerPos, biome, isNight) {
    this.activeBiome = biome;

    // Anchor pooled SplatMesh near player for maximum float16 positional precision.
    const anchorX = Math.round(playerPos.x);
    const anchorZ = Math.round(playerPos.z);
    this.mesh.position.set(anchorX, 0, anchorZ);

    const targetCount = biome === "liminal" ? 14 : 24;

    // Prune distant or stale-biome creatures.
    this.creatures = this.creatures.filter((c) => {
      if (c.biome !== biome) return false;
      const d = Math.hypot(c.x - playerPos.x, c.z - playerPos.z);
      return d <= 36;
    });

    while (this.creatures.length < targetCount) {
      this.creatures.push(this._spawnCreature(biome, playerPos));
    }

    let idx = 0;

    for (const c of this.creatures) {
      c.turnTimer -= dt;
      if (c.turnTimer <= 0) {
        c.heading += rand(-1.4, 1.4);
        c.turnTimer = rand(1.5, 4.5);
      }

      const distToPlayer = Math.hypot(c.x - playerPos.x, c.z - playerPos.z);

      // Reactive avoidance for shy animals & uncanny watchers.
      if (
        (c.kind === "rabbit" || c.kind === "deer" || c.kind === "shadow_walker" || c.kind === "terror_wisp") &&
        distToPlayer < 7.5
      ) {
        c.heading = Math.atan2(c.x - playerPos.x, c.z - playerPos.z);
      }

      const mult = (c.kind === "rabbit" || c.kind === "deer") && distToPlayer < 7.5 ? 2.1 : 1.0;
      c.x += Math.sin(c.heading) * c.speed * mult * dt;
      c.z += Math.cos(c.heading) * c.speed * mult * dt;

      const gy = getTerrainHeight(c.x, c.z);
      const lx = c.x - anchorX;
      const lz = c.z - anchorZ;
      const t = elapsedSec + c.phase;

      if (c.kind === "butterfly") {
        const y = Math.max(gy, CONFIG.WATER_LEVEL) + 0.75 + Math.sin(t * 2.8) * 0.35;
        c.y = y;
        if (isNight) {
          // Firefly glow at night
          const pulse = 0.55 + 0.45 * Math.sin(t * 5.0);
          idx = this._push(idx, lx, y, lz, 0.045, 0.045, 0.045, 0, 0, 0, pulse, 0.95, 1.0, 0.45);
        } else {
          const flap = Math.sin(t * 16.0) * 0.75;
          const col = c.colorPick < 0.4 ? [0.98, 0.58, 0.16] : c.colorPick < 0.75 ? [0.98, 0.92, 0.34] : [0.46, 0.80, 1.0];
          idx = this._push(idx, lx, y, lz, 0.03, 0.03, 0.08, 0, c.heading, 0, 0.95, 0.12, 0.1, 0.1);
          idx = this._push(idx, lx - 0.06, y + 0.02, lz, 0.09, 0.015, 0.08, 0, c.heading, flap, 0.92, col[0], col[1], col[2]);
          idx = this._push(idx, lx + 0.06, y + 0.02, lz, 0.09, 0.015, 0.08, 0, c.heading, -flap, 0.92, col[0], col[1], col[2]);
        }
      } else if (c.kind === "rabbit") {
        const hop = Math.abs(Math.sin(t * 4.2)) * 0.26;
        const y = Math.max(gy, CONFIG.WATER_LEVEL + 0.1) + 0.14 + hop;
        c.y = y;
        const fz = Math.cos(c.heading) * 0.14;
        const fx = Math.sin(c.heading) * 0.14;
        idx = this._push(idx, lx, y, lz, 0.12, 0.10, 0.16, 0, c.heading, 0, 0.96, 0.76, 0.68, 0.58);
        idx = this._push(idx, lx + fx, y + 0.08, lz + fz, 0.08, 0.08, 0.09, 0, c.heading, 0, 0.96, 0.82, 0.74, 0.65);
        idx = this._push(idx, lx + fx - 0.03, y + 0.21, lz + fz, 0.025, 0.08, 0.025, 0.1, 0, 0.15, 0.96, 0.85, 0.74, 0.68);
        idx = this._push(idx, lx + fx + 0.03, y + 0.21, lz + fz, 0.025, 0.08, 0.025, 0.1, 0, -0.15, 0.96, 0.85, 0.74, 0.68);
      } else if (c.kind === "deer") {
        const y = Math.max(gy, CONFIG.WATER_LEVEL + 0.1) + 0.65 + Math.abs(Math.sin(t * 3.0)) * 0.05;
        c.y = y;
        const fx = Math.sin(c.heading) * 0.35;
        const fz = Math.cos(c.heading) * 0.35;
        idx = this._push(idx, lx, y, lz, 0.20, 0.22, 0.44, 0, c.heading, 0, 0.97, 0.62, 0.42, 0.24);
        idx = this._push(idx, lx + fx, y + 0.38, lz + fz, 0.10, 0.24, 0.14, 0.25, c.heading, 0, 0.97, 0.66, 0.45, 0.27);
        idx = this._push(idx, lx + fx * 1.15, y + 0.58, lz + fz * 1.15, 0.11, 0.10, 0.16, 0, c.heading, 0, 0.97, 0.70, 0.48, 0.30);
        idx = this._push(idx, lx - fx * 0.65, y - 0.35, lz - fz * 0.65, 0.05, 0.28, 0.05, 0, 0, 0, 0.97, 0.54, 0.36, 0.20);
        idx = this._push(idx, lx + fx * 0.55, y - 0.35, lz + fz * 0.55, 0.05, 0.28, 0.05, 0, 0, 0, 0.97, 0.54, 0.36, 0.20);
      } else if (c.kind === "bird" || c.kind === "bat") {
        const y = c.baseY + Math.sin(t * 1.6) * 0.55;
        c.y = y;
        const flap = Math.sin(t * (c.kind === "bat" ? 13.0 : 9.0)) * 0.55;
        const isDark = c.kind === "bat" || isNight;
        const col = isDark ? [0.16, 0.14, 0.20] : [0.92, 0.90, 0.88];
        idx = this._push(idx, lx, y, lz, 0.06, 0.05, 0.16, 0, c.heading, 0, 0.95, col[0], col[1], col[2]);
        idx = this._push(idx, lx - 0.16, y + 0.02, lz, 0.18, 0.02, 0.09, 0, c.heading, flap, 0.94, col[0], col[1], col[2]);
        idx = this._push(idx, lx + 0.16, y + 0.02, lz, 0.18, 0.02, 0.09, 0, c.heading, -flap, 0.94, col[0], col[1], col[2]);
      } else if (c.kind === "fish") {
        const y = THREE.MathUtils.clamp(c.baseY + Math.sin(t * 2.2) * 0.35, gy + 0.35, CONFIG.WATER_LEVEL - 0.35);
        c.y = y;
        const tail = Math.sin(t * 10.0) * 0.25;
        const col = c.colorPick < 0.35 ? [0.98, 0.56, 0.20] : c.colorPick < 0.7 ? [0.30, 0.88, 0.96] : [0.96, 0.86, 0.26];
        idx = this._push(idx, lx, y, lz, 0.07, 0.09, 0.18, 0, c.heading, 0, 0.96, col[0], col[1], col[2]);
        idx = this._push(idx, lx - Math.sin(c.heading) * 0.16, y, lz - Math.cos(c.heading) * 0.16, 0.02, 0.09, 0.09, 0, c.heading + tail, 0, 0.92, col[0], col[1], col[2]);
      } else if (c.kind === "jellyfish") {
        const y = THREE.MathUtils.clamp(c.baseY + Math.sin(t * 1.4) * 0.45, gy + 0.7, CONFIG.WATER_LEVEL - 0.45);
        c.y = y;
        const pulse = 1.0 + Math.sin(t * 3.5) * 0.16;
        idx = this._push(idx, lx, y, lz, 0.22 * pulse, 0.13, 0.22 * pulse, 0, 0, 0, 0.72, 0.88, 0.58, 1.0);
        idx = this._push(idx, lx - 0.06, y - 0.24, lz, 0.03, 0.22, 0.03, 0, 0, Math.sin(t * 2) * 0.2, 0.65, 0.96, 0.72, 1.0);
        idx = this._push(idx, lx + 0.06, y - 0.24, lz, 0.03, 0.22, 0.03, 0, 0, -Math.sin(t * 2) * 0.2, 0.65, 0.96, 0.72, 1.0);
      } else if (c.kind === "winged_eye") {
        const y = gy + 3.2 + Math.sin(t * 1.8) * 0.6;
        c.y = y;
        const flap = Math.sin(t * 6.5) * 0.45;
        idx = this._push(idx, lx, y, lz, 0.22, 0.22, 0.22, 0, 0, 0, 0.96, 0.98, 0.95, 0.99);
        idx = this._push(idx, lx, y, lz + 0.18, 0.11, 0.11, 0.06, 0, 0, 0, 0.98, 0.55, 0.80, 1.0);
        idx = this._push(idx, lx - 0.34, y + 0.05, lz, 0.28, 0.04, 0.16, 0, c.heading, flap, 0.90, 1.0, 0.80, 0.94);
        idx = this._push(idx, lx + 0.34, y + 0.05, lz, 0.28, 0.04, 0.16, 0, c.heading, -flap, 0.90, 0.76, 0.96, 0.92);
      } else if (c.kind === "dream_orb") {
        const y = gy + 1.8 + Math.sin(t * 1.5) * 0.5;
        c.y = y;
        idx = this._push(idx, lx, y, lz, 0.24, 0.24, 0.24, 0, 0, 0, 0.68, 0.96, 0.78, 0.98);
      } else if (c.kind === "shadow_walker") {
        const y = 1.0;
        c.y = y;
        const alpha = THREE.MathUtils.clamp((distToPlayer - 5.0) / 8.0, 0.15, 0.85);
        idx = this._push(idx, lx, y + 1.0, lz, 0.16, 0.95, 0.14, 0, c.heading, 0, alpha, 0.04, 0.04, 0.05);
        idx = this._push(idx, lx, y + 2.05, lz, 0.13, 0.15, 0.13, 0, 0, 0, alpha, 0.03, 0.03, 0.04);
      } else if (c.kind === "terror_wisp") {
        const y = gy + 2.1 + Math.sin(t * 2.1) * 0.4;
        c.y = y;
        idx = this._push(idx, lx, y, lz, 0.20, 0.36, 0.20, 0, 0, 0, 0.85, 0.04, 0.02, 0.03);
        idx = this._push(idx, lx - 0.07, y + 0.12, lz + 0.12, 0.04, 0.03, 0.04, 0, 0, 0, 0.98, 1.0, 0.12, 0.10);
        idx = this._push(idx, lx + 0.07, y + 0.12, lz + 0.12, 0.04, 0.03, 0.04, 0, 0, 0, 0.98, 1.0, 0.12, 0.10);
      } else if (c.kind === "crawler") {
        const y = gy + 0.16;
        c.y = y;
        idx = this._push(idx, lx, y, lz, 0.14, 0.07, 0.22, 0, c.heading, 0, 0.94, 0.10, 0.05, 0.06);
        idx = this._push(idx, lx, y + 0.04, lz, 0.05, 0.05, 0.05, 0, 0, 0, 0.95, 0.95, 0.14, 0.10);
      } else {
        // Crystal wisps & liminal motes
        const y = c.baseY + Math.sin(t * 1.9) * 0.35;
        c.y = y;
        const col = c.kind === "wisp" ? [0.42, 0.96, 1.0] : [0.98, 0.95, 0.78];
        idx = this._push(idx, lx, y, lz, 0.05, 0.05, 0.05, 0, 0, 0, 0.72, col[0], col[1], col[2]);
      }
    }

    // Zero out trailing unused slots only up to previous active splat count.
    const prevCount = this.activeSplats;
    const emptyPos = this._center.set(0, -50, 0);
    const emptyCol = this._color.setRGB(0, 0, 0);
    for (let j = idx; j < prevCount; j++) {
      this.mesh.packedSplats.setSplat(j, emptyPos, this._zeroScale, this._quat.identity(), 0, emptyCol);
    }

    this.activeSplats = idx;
    this.mesh.packedSplats.numSplats = Math.max(1, idx);
    this.mesh.packedSplats.needsUpdate = true;
    this.mesh.numSplats = Math.max(1, idx);
    this.mesh.updateVersion();
  }

  getDebugState() {
    const first = this.creatures[0];
    return {
      count: this.creatures.length,
      splats: this.activeSplats,
      biome: this.activeBiome,
      samplePos: first ? { x: Number(first.x.toFixed(2)), y: Number(first.y.toFixed(2)), z: Number(first.z.toFixed(2)) } : null,
    };
  }
}
