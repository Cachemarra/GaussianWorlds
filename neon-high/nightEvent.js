import * as THREE from "three";
import { SplatMesh } from "@sparkjsdev/spark";
import { CONFIG } from "./config.js";
import { getTerrainHeight } from "./terrain.js";

const VALID_MODES = ["peripheral", "false_alarm", "stalker"];
const DARK_BIOMES = new Set(["terrorcore", "cave", "liminal"]);

function pushLimbSplats(splats, a, b, radius, count, shadeBase, center, scales, quat, color) {
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(0.05, dir.length());
  dir.normalize();
  quat.setFromUnitVectors(up, dir);

  const stepLen = len / Math.max(1, count);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    center.lerpVectors(a, b, t);
    // Subtle organic jitter so the silhouette looks painterly and ghostly.
    center.x += Math.sin(i * 4.17 + radius * 19) * radius * 0.14;
    center.z += Math.cos(i * 3.11 + radius * 13) * radius * 0.14;

    const taper = 1.0 - 0.18 * Math.abs(t - 0.45);
    scales.set(radius * taper, Math.max(radius * 1.15, stepLen * 1.1), radius * 0.85 * taper);
    const v = shadeBase + (i % 3) * 0.006;
    color.setRGB(v, v * 1.06, v * 1.32);
    splats.pushSplat(center, scales, quat, 0.96, color);
  }
}

// Create an eerie, slender humanoid silhouette (~130 elongated dark Gaussian splats).
// When eerieEyes is true, adds two subtle dim pale or crimson pinhole eyes facing +Z.
function createFigureMesh(eerieEyes = false, crimsonEyes = false) {
  const mesh = new SplatMesh({
    maxSplats: 140,
    constructSplats: (splats) => {
      const center = new THREE.Vector3();
      const scales = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const color = new THREE.Color();

      // Feet / calves / thighs (tall ~2.28m silhouette).
      pushLimbSplats(splats, new THREE.Vector3(-0.16, 0.02, 0), new THREE.Vector3(-0.17, 0.56, 0.02), 0.085, 10, 0.012, center, scales, quat, color);
      pushLimbSplats(splats, new THREE.Vector3(-0.17, 0.56, 0.02), new THREE.Vector3(-0.14, 1.12, 0), 0.105, 10, 0.014, center, scales, quat, color);

      pushLimbSplats(splats, new THREE.Vector3(0.16, 0.02, 0), new THREE.Vector3(0.17, 0.56, -0.01), 0.085, 10, 0.012, center, scales, quat, color);
      pushLimbSplats(splats, new THREE.Vector3(0.17, 0.56, -0.01), new THREE.Vector3(0.14, 1.12, 0), 0.105, 10, 0.014, center, scales, quat, color);

      // Pelvis & elongated torso.
      pushLimbSplats(splats, new THREE.Vector3(0, 1.08, 0), new THREE.Vector3(0, 1.80, 0.03), 0.21, 18, 0.010, center, scales, quat, color);
      // Shoulders.
      pushLimbSplats(splats, new THREE.Vector3(-0.31, 1.74, 0.02), new THREE.Vector3(0.31, 1.74, 0.02), 0.12, 8, 0.013, center, scales, quat, color);

      // Long hanging arms.
      pushLimbSplats(splats, new THREE.Vector3(-0.31, 1.72, 0.02), new THREE.Vector3(-0.36, 1.30, 0.04), 0.075, 9, 0.012, center, scales, quat, color);
      pushLimbSplats(splats, new THREE.Vector3(-0.36, 1.30, 0.04), new THREE.Vector3(-0.33, 0.86, 0.09), 0.062, 9, 0.010, center, scales, quat, color);

      pushLimbSplats(splats, new THREE.Vector3(0.31, 1.72, 0.02), new THREE.Vector3(0.36, 1.30, 0.04), 0.075, 9, 0.012, center, scales, quat, color);
      pushLimbSplats(splats, new THREE.Vector3(0.36, 1.30, 0.04), new THREE.Vector3(0.33, 0.86, 0.09), 0.062, 9, 0.010, center, scales, quat, color);

      // Neck and slightly tilted head.
      pushLimbSplats(splats, new THREE.Vector3(0, 1.80, 0.03), new THREE.Vector3(0, 1.96, 0.05), 0.085, 4, 0.012, center, scales, quat, color);
      pushLimbSplats(splats, new THREE.Vector3(0, 1.96, 0.05), new THREE.Vector3(0.01, 2.26, 0.06), 0.14, 9, 0.008, center, scales, quat, color);

      // Subtle vertical shadow wisps around ankles & cloak edge.
      pushLimbSplats(splats, new THREE.Vector3(-0.09, 0.35, -0.06), new THREE.Vector3(-0.13, 1.62, -0.05), 0.12, 6, 0.009, center, scales, quat, color);
      pushLimbSplats(splats, new THREE.Vector3(0.09, 0.35, -0.06), new THREE.Vector3(0.13, 1.62, -0.05), 0.12, 6, 0.009, center, scales, quat, color);

      // Two subtle dim pale or crimson pinhole eyes on the front of the head.
      if (eerieEyes) {
        quat.identity();
        scales.set(0.017, 0.014, 0.014);
        if (crimsonEyes) {
          color.setRGB(0.68, 0.10, 0.09);
        } else {
          color.setRGB(0.60, 0.66, 0.72);
        }
        center.set(-0.046, 2.13, 0.185);
        splats.pushSplat(center, scales, quat, 0.94, color);
        center.set(0.052, 2.135, 0.185);
        splats.pushSplat(center, scales, quat, 0.94, color);
      }
    },
  });
  return mesh;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function rotateHoriz(dirXZ, angleRad, out = new THREE.Vector3()) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return out.set(dirXZ.x * c - dirXZ.z * s, 0, dirXZ.x * s + dirXZ.z * c).normalize();
}

export class NightEventController {
  constructor(scene, audio, chunkManager = null) {
    this.scene = scene;
    this.audio = audio;
    this.chunkManager = chunkManager;

    this.state = "idle"; // "idle" | "footsteps" | "active" | "cooldown"
    this.mode = "none"; // "none" | "peripheral" | "false_alarm" | "stalker"
    this.lastMode = "none";
    this.lastSide = 0; // -1 left, +1 right
    this.side = 0;
    this.nextTimer = randomRange(CONFIG.EVENT_MIN_INTERVAL, CONFIG.EVENT_MAX_INTERVAL);
    this.cooldownTimer = 0;
    this.stepDelayTimer = 0;

    this.mesh = null;
    this.figurePos = new THREE.Vector3();
    this.distance = 0;
    this.angleDeg = 180;
    this.gazeHold = 0;
    this.lifeTimer = 0;
    this.stalkerFrozen = false;
    this.lastOutcome = "none";
    this.biome = "meadow";

    this._cueQueue = [];
    this._stalkerStepTimer = 0;
    this._pendingHorizFwd = new THREE.Vector3();
    this._toFigure = new THREE.Vector3();
    this._tmpDir = new THREE.Vector3();
    this._tmpPos = new THREE.Vector3();
  }

  _clearMesh() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = null;
    }
  }

  _clearEncounter() {
    this._clearMesh();
    this._cueQueue.length = 0;
    this.gazeHold = 0;
    this.lifeTimer = 0;
    this.stalkerFrozen = false;
    this._stalkerStepTimer = 0;
  }

  _getHorizForward(camForward, out = new THREE.Vector3()) {
    out.set(camForward.x, 0, camForward.z);
    if (out.lengthSq() < 1e-4) out.set(0, 0, -1);
    return out.normalize();
  }

  _pickMode(forcedMode) {
    if (forcedMode && VALID_MODES.includes(forcedMode)) {
      return forcedMode;
    }

    let weights;
    if (this.biome === "liminal" || this.biome === "terrorcore") {
      weights = { peripheral: 0.18, false_alarm: 0.36, stalker: 0.46 };
    } else if (this.biome === "cave") {
      weights = { peripheral: 0.28, false_alarm: 0.32, stalker: 0.40 };
    } else {
      weights = { peripheral: 0.45, false_alarm: 0.27, stalker: 0.28 };
    }

    // Never repeat the same mode twice in a row unless forcedMode was passed.
    const candidates = VALID_MODES.filter((m) => m !== this.lastMode);
    let total = 0;
    for (const m of candidates) total += weights[m];

    let r = Math.random() * total;
    for (const m of candidates) {
      r -= weights[m];
      if (r <= 0) return m;
    }
    return candidates[candidates.length - 1];
  }

  _computeRelativePos(camPos, horizFwd, angleDeg, dist, groundOffset = 0.15, useCamY = false, out = new THREE.Vector3()) {
    const dir = rotateHoriz(horizFwd, THREE.MathUtils.degToRad(angleDeg), this._tmpDir);
    const x = camPos.x + dir.x * dist;
    const z = camPos.z + dir.z * dist;
    const y = useCamY ? camPos.y + groundOffset : getTerrainHeight(x, z) + groundOffset;
    return out.set(x, y, z);
  }

  _fireCue(cue, camPos, camForward) {
    const horizFwd = this._getHorizForward(camForward, this._pendingHorizFwd);
    let pos;
    if (cue.worldPos) {
      pos = cue.worldPos;
    } else {
      pos = this._computeRelativePos(
        camPos,
        horizFwd,
        cue.angleDeg,
        cue.dist,
        cue.yOffset ?? 0.15,
        Boolean(cue.useCamY),
        this._tmpPos
      );
    }

    if (cue.dist != null) {
      this.distance = cue.dist;
    }

    if (cue.type === "whisper") {
      this.audio.playWhisperBehind?.(pos);
    } else {
      const pitch = randomRange(cue.pitchMin ?? 0.9, cue.pitchMax ?? 1.06);
      this.audio.playFootstep(pos, pitch, cue.volume ?? 1.0);
    }
  }

  triggerNow(camPos, camForward, forcedMode = null) {
    this._clearEncounter();

    // Never repeat the same side twice in a row.
    const side = this.lastSide === 0 ? (Math.random() < 0.5 ? -1 : 1) : -this.lastSide;
    this.lastSide = side;
    this.side = side;

    const mode = this._pickMode(forcedMode);
    this.mode = mode;
    this.lastMode = mode;

    const horizFwd = this._getHorizForward(camForward, this._pendingHorizFwd);

    if (mode === "false_alarm") {
      // 3-4 circling spatial footsteps moving closer behind the player, then a shoulder whisper.
      const fourSteps = Math.random() < 0.5;
      const pos1 = this._computeRelativePos(camPos, horizFwd, side * 125, 24, 0.15, false, this._tmpPos);
      this.audio.playFootstep(pos1, randomRange(0.92, 1.04), 0.95);
      this.distance = 24;
      this.angleDeg = 180;

      if (fourSteps) {
        this._cueQueue.push(
          { timer: 0.62, type: "footstep", angleDeg: side * 155, dist: 18, pitchMin: 0.90, pitchMax: 1.03, volume: 0.98 },
          { timer: 1.28, type: "footstep", angleDeg: side * 176, dist: 13.5, pitchMin: 0.88, pitchMax: 1.02, volume: 1.02 },
          { timer: 1.92, type: "footstep", angleDeg: -side * 145, dist: 10.5, pitchMin: 0.86, pitchMax: 1.0, volume: 1.05 },
          { timer: 2.32, type: "whisper", angleDeg: -side * 162, dist: 7.0, yOffset: -0.08, useCamY: true }
        );
        this.stepDelayTimer = 2.75;
      } else {
        this._cueQueue.push(
          { timer: 0.74, type: "footstep", angleDeg: side * 165, dist: 16, pitchMin: 0.90, pitchMax: 1.03, volume: 1.0 },
          { timer: 1.50, type: "footstep", angleDeg: -side * 145, dist: 11, pitchMin: 0.87, pitchMax: 1.01, volume: 1.05 },
          { timer: 2.18, type: "whisper", angleDeg: -side * 164, dist: 7.0, yOffset: -0.08, useCamY: true }
        );
        this.stepDelayTimer = 2.60;
      }

      this.state = "footsteps";
      return;
    }

    if (mode === "stalker") {
      // Distant eerie step + faint whisper before spawning the weeping-angel figure.
      const stepAngleDeg = randomRange(85, 130) * side;
      const stepDist = randomRange(26, 36);
      const pos1 = this._computeRelativePos(camPos, horizFwd, stepAngleDeg, stepDist, 0.15, false, this._tmpPos);
      this.audio.playFootstep(pos1, randomRange(0.80, 0.92), 0.9);
      this.distance = stepDist;
      this.angleDeg = Math.abs(stepAngleDeg);

      this._cueQueue.push({
        timer: 0.30,
        type: "whisper",
        angleDeg: randomRange(70, 110) * side,
        dist: 18,
        yOffset: 0.2,
        useCamY: true,
      });

      this.state = "footsteps";
      this.stepDelayTimer = 0.44;
      return;
    }

    // Classic enhanced "peripheral" mode: 1-2 spatial footsteps at 20-40m to the side/behind.
    const stepAngleDeg = randomRange(75, 138) * side;
    const stepDist = randomRange(CONFIG.FOOTSTEP_DIST_MIN, CONFIG.FOOTSTEP_DIST_MAX);
    const stepDir = rotateHoriz(horizFwd, THREE.MathUtils.degToRad(stepAngleDeg), this._tmpDir);
    const sx = camPos.x + stepDir.x * stepDist;
    const sz = camPos.z + stepDir.z * stepDist;
    const stepPos1 = this._tmpPos.set(sx, getTerrainHeight(sx, sz) + 0.15, sz);
    this.audio.playFootstep(stepPos1, randomRange(0.92, 1.08), 1.0);
    this.distance = stepDist;
    this.angleDeg = Math.abs(stepAngleDeg);

    if (Math.random() < 0.65) {
      const sx2 = sx - stepDir.x * 0.8 + (Math.random() - 0.5) * 0.4;
      const sz2 = sz - stepDir.z * 0.8 + (Math.random() - 0.5) * 0.4;
      this._cueQueue.push({
        timer: 0.44,
        type: "footstep",
        worldPos: new THREE.Vector3(sx2, getTerrainHeight(sx2, sz2) + 0.15, sz2),
        pitchMin: 0.9,
        pitchMax: 1.06,
        volume: 1.0,
      });
    }

    // Spawn figure shortly after the first footstep so audio cues the gaze.
    this.state = "footsteps";
    this.stepDelayTimer = 0.22;
  }

  _spawnFigure(camPos, camForward, distMin, distMax, eerieEyes, crimsonEyes) {
    // Always evaluate live head gaze at spawn time so turning during footsteps
    // never drops the figure in front of the player's central vision.
    const horizFwd = this._getHorizForward(camForward, this._pendingHorizFwd);
    const baseAngleDeg = randomRange(CONFIG.FIGURE_ANGLE_DEG - 2, CONFIG.FIGURE_ANGLE_DEG + 2);
    let dist = randomRange(distMin, distMax);
    let fx = camPos.x;
    let fz = camPos.z;

    for (const angleOffset of [0, 4, -4, 7, -7]) {
      const spawnAngleDeg = (baseAngleDeg + angleOffset) * this.side;
      const spawnDir = rotateHoriz(horizFwd, THREE.MathUtils.degToRad(spawnAngleDeg), this._tmpDir);
      const candX = camPos.x + spawnDir.x * dist;
      const candZ = camPos.z + spawnDir.z * dist;
      const blocked = this.chunkManager
        ?.getNearbyColliders(candX, candZ, 1.5)
        .some((c) => Math.hypot(c.x - candX, c.z - candZ) < c.r + 0.8);
      if (!blocked) {
        fx = candX;
        fz = candZ;
        break;
      }
      if (angleOffset === -7) {
        dist = Math.min(distMax, dist + 2.0);
        fx = camPos.x + spawnDir.x * dist;
        fz = camPos.z + spawnDir.z * dist;
      }
    }

    const fy = getTerrainHeight(fx, fz);
    this.figurePos.set(fx, fy, fz);
    this.distance = dist;

    this.mesh = createFigureMesh(eerieEyes, crimsonEyes);
    this.mesh.position.copy(this.figurePos);
    this.mesh.rotation.y = Math.atan2(camPos.x - fx, camPos.z - fz);
    this.mesh.opacity = 1.0;
    this.scene.add(this.mesh);

    this.state = "active";
    this.gazeHold = 0;
    this.lifeTimer = 0;
    this.stalkerFrozen = false;
    this._stalkerStepTimer = randomRange(0.85, 1.15);
    this._measureFigureGaze(camPos, camForward);
  }

  _measureFigureGaze(camPos, camForward) {
    this._toFigure.set(
      this.figurePos.x - camPos.x,
      this.figurePos.y + 1.35 - camPos.y,
      this.figurePos.z - camPos.z
    );
    this.distance = this._toFigure.length();
    if (this.distance > 1e-4) {
      this._toFigure.divideScalar(this.distance);
      const dot = THREE.MathUtils.clamp(camForward.dot(this._toFigure), -1, 1);
      this.angleDeg = THREE.MathUtils.radToDeg(Math.acos(dot));
    } else {
      this.angleDeg = 0;
    }
  }

  update(dt, horrorActive, camPos, camForward, options = {}) {
    if (options && options.biome) {
      this.biome = options.biome;
    }

    if (!horrorActive) {
      if (this.state !== "idle" || this._cueQueue.length > 0 || this.mesh) {
        this._clearEncounter();
        this.state = "idle";
      }
      return;
    }

    // Fire any scheduled spatial audio cues (second footsteps, circling steps, whispers).
    for (let i = this._cueQueue.length - 1; i >= 0; i--) {
      const cue = this._cueQueue[i];
      cue.timer -= dt;
      if (cue.timer <= 0) {
        this._cueQueue.splice(i, 1);
        this._fireCue(cue, camPos, camForward);
      }
    }

    if (this.state === "idle") {
      this.nextTimer -= dt;
      if (this.nextTimer <= 0) {
        this.triggerNow(camPos, camForward);
      }
      return;
    }

    if (this.state === "footsteps") {
      this.stepDelayTimer -= dt;
      if (this.stepDelayTimer <= 0) {
        if (this.mode === "false_alarm") {
          // Zero mesh spawned — player turns around to emptiness.
          this._cueQueue.length = 0;
          this.state = "cooldown";
          this.cooldownTimer = CONFIG.EVENT_COOLDOWN;
          this.lastOutcome = "false_alarm";
          this.stalkerFrozen = false;
        } else if (this.mode === "stalker") {
          this._spawnFigure(camPos, camForward, 26, 38, true, this.biome === "terrorcore");
        } else {
          const eerieEyes = DARK_BIOMES.has(this.biome);
          this._spawnFigure(
            camPos,
            camForward,
            CONFIG.FIGURE_DIST_MIN,
            CONFIG.FIGURE_DIST_MAX,
            eerieEyes,
            this.biome === "terrorcore"
          );
        }
      }
      return;
    }

    if (this.state === "cooldown") {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        this.state = "idle";
        this.nextTimer = randomRange(CONFIG.EVENT_MIN_INTERVAL, CONFIG.EVENT_MAX_INTERVAL);
      }
      return;
    }

    if (this.state === "active" && this.mesh) {
      this.lifeTimer += dt;
      this._measureFigureGaze(camPos, camForward);

      if (this.mode === "stalker") {
        // Weeping-Angel creeper: freezes dead still when viewed, creeps closer when unseen.
        if (this.angleDeg <= 42) {
          this.stalkerFrozen = true;
        } else {
          this.stalkerFrozen = false;
          const dx = camPos.x - this.figurePos.x;
          const dz = camPos.z - this.figurePos.z;
          const horizDist = Math.hypot(dx, dz);
          if (horizDist > 0.25) {
            const step = Math.min(3.4 * dt, horizDist - 0.25);
            const fx = this.figurePos.x + (dx / horizDist) * step;
            const fz = this.figurePos.z + (dz / horizDist) * step;
            const fy = getTerrainHeight(fx, fz);
            this.figurePos.set(fx, fy, fz);
            this.mesh.position.copy(this.figurePos);
            this.mesh.rotation.y = Math.atan2(camPos.x - fx, camPos.z - fz);
            this._measureFigureGaze(camPos, camForward);
          }

          this._stalkerStepTimer -= dt;
          if (this._stalkerStepTimer <= 0) {
            this._tmpPos.set(this.figurePos.x, this.figurePos.y + 0.12, this.figurePos.z);
            this.audio.playFootstep(this._tmpPos, randomRange(0.78, 0.90), 0.45);
            this._stalkerStepTimer = randomRange(0.95, 1.25);
          }
        }

        if (this.angleDeg < 22 && this.distance < 18) {
          this.gazeHold += dt;
        } else {
          this.gazeHold = 0;
        }

        // Instant 1-frame vanish on close approach, close stare, or 18s expiry.
        if (this.distance <= 9.5 || this.gazeHold > 0.55) {
          const popPos = this.figurePos.clone().setY(this.figurePos.y + 1.35);
          this._clearEncounter();
          if (this.audio.playStalkerPop) {
            this.audio.playStalkerPop(popPos);
          } else {
            this.audio.playPop(popPos);
          }
          this.state = "cooldown";
          this.cooldownTimer = CONFIG.EVENT_COOLDOWN;
          this.lastOutcome = "stalker_popped";
          return;
        }

        if (this.lifeTimer >= 18.0) {
          const popPos = this.figurePos.clone().setY(this.figurePos.y + 1.35);
          this._clearEncounter();
          if (this.audio.playStalkerPop) {
            this.audio.playStalkerPop(popPos);
          } else {
            this.audio.playPop(popPos);
          }
          this.state = "cooldown";
          this.cooldownTimer = CONFIG.EVENT_COOLDOWN;
          this.lastOutcome = "faded";
          return;
        }
        return;
      }

      // Classic enhanced "peripheral" mode.
      if (this.angleDeg < CONFIG.FIGURE_GAZE_ANGLE_DEG) {
        this.gazeHold += dt;
        if (this.gazeHold > CONFIG.FIGURE_GAZE_HOLD_SEC) {
          // Instant 1-frame vanish with dry spatial pop and zero residue.
          const popPos = this.figurePos.clone().setY(this.figurePos.y + 1.35);
          this._clearEncounter();
          this.audio.playPop(popPos);
          this.state = "cooldown";
          this.cooldownTimer = CONFIG.EVENT_COOLDOWN;
          this.lastOutcome = "popped";
          return;
        }
      } else {
        this.gazeHold = 0;
      }

      // Silent fade-out if nobody looks for ~10s.
      const fadeStart = CONFIG.FIGURE_LIFETIME_SEC - CONFIG.FIGURE_FADE_SEC;
      if (this.lifeTimer >= CONFIG.FIGURE_LIFETIME_SEC) {
        this._clearEncounter();
        this.state = "cooldown";
        this.cooldownTimer = CONFIG.EVENT_COOLDOWN;
        this.lastOutcome = "faded";
      } else if (this.lifeTimer > fadeStart) {
        const remain = 1.0 - (this.lifeTimer - fadeStart) / CONFIG.FIGURE_FADE_SEC;
        this.mesh.opacity = THREE.MathUtils.clamp(remain, 0, 1);
      }
    }
  }

  getDebugState() {
    return {
      state: this.state,
      mode: this.mode,
      lastMode: this.lastMode,
      side: this.side,
      lastSide: this.lastSide,
      distance: Number(this.distance.toFixed(2)),
      angleDeg: Number(this.angleDeg.toFixed(2)),
      gazeHold: Number(this.gazeHold.toFixed(3)),
      lifeTimer: Number(this.lifeTimer.toFixed(2)),
      nextTimer: Number(this.nextTimer.toFixed(1)),
      stalkerFrozen: this.stalkerFrozen,
      figureVisible: Boolean(this.mesh),
      figurePos: this.mesh
        ? { x: this.figurePos.x, y: this.figurePos.y, z: this.figurePos.z }
        : null,
      lastOutcome: this.lastOutcome,
    };
  }
}
