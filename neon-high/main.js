import * as THREE from "three";
import { SparkRenderer } from "@sparkjsdev/spark";
import { CONFIG, QUALITY_PRESETS, applyQualityPreset } from "./config.js";
import { getBiomeWeights, getTerrainHeight } from "./terrain.js";
import { createSkySystem } from "./sky.js";
import { ChunkManager } from "./chunks.js";
import { CreatureManager } from "./creatures.js";
import { SpatialAudio } from "./audio.js";
import { NightEventController } from "./nightEvent.js";
import { AnomalyManager, LiminalImpossibleController } from "./anomalies.js";
import { InputController } from "./controls.js";
import { VRMenu } from "./vrMenu.js";

const BIOME_LABELS = {
  meadow: "Meadow",
  conifer: "Conifer Forest",
  cave: "Cave",
  sea: "Sea",
  liminal: "Liminal Space",
  dreamcore: "Dreamcore",
  terrorcore: "Terrorcore",
};

const QUALITY_ORDER = ["default", "high", "ultrax"];

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  300
);
camera.position.set(0, CONFIG.EYE_HEIGHT, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Keep SparkRenderer and camera inside localFrame so float16 splat precision follows the player.
const localFrame = new THREE.Group();
localFrame.position.set(0, getTerrainHeight(0, 0), 0);
scene.add(localFrame);
localFrame.add(camera);

const spark = new SparkRenderer({
  renderer,
  maxStdDev: CONFIG.SPARK_MAX_STD_DEV,
  enable2DGS: true,
});
localFrame.add(spark);

window.addEventListener("resize", () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Sky dome lives in scene (NOT localFrame) so turning never rotates sun, moon, or stars.
const sky = createSkySystem(scene);
const chunkManager = new ChunkManager(scene);
const creatures = new CreatureManager(scene);
const audio = new SpatialAudio();
const nightEvent = new NightEventController(scene, audio, chunkManager);

const hudEl = document.getElementById("hud");
const hudFps = document.getElementById("hud-fps");
const hudSplats = document.getElementById("hud-splats");
const hudChunks = document.getElementById("hud-chunks");
const hudBiome = document.getElementById("hud-biome");
const hudTime = document.getElementById("hud-time");
const hudEvent = document.getElementById("hud-event");
const hudAnomalies = document.getElementById("hud-anomalies");
const hudMenuBtn = document.getElementById("hud-menu-btn");
const toastEl = document.getElementById("toast");
const menuEl = document.getElementById("menu");
const menuCloseBtn = document.getElementById("menu-close");
const btnNight = document.getElementById("btn-night");
const btnPause = document.getElementById("btn-pause");
const btnMute = document.getElementById("btn-mute");
const btnFlashlight = document.getElementById("btn-flashlight");
const btnCollisions = document.getElementById("btn-collisions");
const vrBtn = document.getElementById("vr-btn");

let toastTimer = null;
function showToast(text, durationMs = 3800) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, durationMs);
}

const anomalies = new AnomalyManager(scene, audio, (_biome, found, total, label) => {
  showToast(`Anomalía sintonizada: ${label} (${found}/${total})`);
});
const liminalImpossible = new LiminalImpossibleController(scene);

let timeOfDay = CONFIG.INITIAL_TIME_OF_DAY;
let cyclePaused = false;
let elapsedSec = 0;
let flashlightOn = false;

const camWorldPos = new THREE.Vector3();
const camWorldDir = new THREE.Vector3();
const camWorldUp = new THREE.Vector3();
const camWorldQuat = new THREE.Quaternion();
const flashWorldPos = new THREE.Vector3();
const flashWorldDir = new THREE.Vector3(0, 0, -1);

function getActiveCameraPose() {
  localFrame.updateMatrixWorld(true);
  camera.getWorldPosition(camWorldPos);
  camera.getWorldDirection(camWorldDir);
  camera.getWorldQuaternion(camWorldQuat);
  camWorldUp.set(0, 1, 0).applyQuaternion(camWorldQuat);
}

function isHorrorBiome(biome) {
  return biome === "liminal" || biome === "terrorcore" || biome === "cave";
}

function computeHorrorFlicker(t, biome) {
  if (biome !== "liminal" && biome !== "terrorcore") return 1.0;
  // Irregular subtle fluorescent / abyssal voltage dip without harsh strobing.
  const wave = Math.sin(t * 17.3) * Math.sin(t * 29.7 + 1.1) * Math.cos(t * 7.9);
  if (wave > 0.72) {
    return 0.62 + 0.23 * (0.5 + 0.5 * Math.sin(t * 53.1));
  }
  return 1.0;
}

let vrMenu = null;

function getFlashlightPose() {
  if (vrMenu?.getRightHandRay(flashWorldPos, flashWorldDir)) {
    return;
  }
  flashWorldPos.copy(camWorldPos);
  flashWorldDir.copy(camWorldDir);
}

function buildChunkEnv(env, skySt, t) {
  getFlashlightPose();
  return {
    underwaterFactor: env.underwaterFactor,
    sunDir: skySt.sunDir,
    camPos: camWorldPos,
    flashlightPos: flashWorldPos,
    flashlightDir: flashWorldDir,
    flashlightOn: flashlightOn ? 1 : 0,
    horrorFlicker: computeHorrorFlicker(t, env.bw.dominant),
  };
}

let skyState = sky.update(timeOfDay, 0, { caveFactor: 0, underwaterFactor: 0 }, localFrame.position);
chunkManager.update(0, 0, 0, skyState, true, {
  underwaterFactor: 0,
  sunDir: skyState.sunDir,
  camPos: new THREE.Vector3(0, getTerrainHeight(0, 0) + CONFIG.EYE_HEIGHT, 0),
  flashlightPos: new THREE.Vector3(0, CONFIG.EYE_HEIGHT, 0),
  flashlightDir: new THREE.Vector3(0, 0, -1),
  flashlightOn: 0,
  horrorFlicker: 1.0,
});

function getEnvFactors(x, z, isUnderwater, waterDepth) {
  const bw = getBiomeWeights(x, z);
  const caveFactor = THREE.MathUtils.clamp((bw.cave - 0.15) / 0.5, 0, 1);
  const liminalFactor = THREE.MathUtils.clamp((bw.liminal - 0.15) / 0.5, 0, 1);
  const dreamcoreFactor = THREE.MathUtils.clamp((bw.dreamcore - 0.15) / 0.5, 0, 1);
  const terrorcoreFactor = THREE.MathUtils.clamp((bw.terrorcore - 0.15) / 0.5, 0, 1);
  const underwaterFactor = isUnderwater ? THREE.MathUtils.clamp(0.65 + waterDepth * 0.15, 0.7, 1) : 0;
  return { bw, caveFactor, liminalFactor, dreamcoreFactor, terrorcoreFactor, underwaterFactor };
}

function toggleNight() {
  timeOfDay = skyState.isNight ? CONFIG.INITIAL_TIME_OF_DAY : 0.92;
  getActiveCameraPose();
  const env = getEnvFactors(camWorldPos.x, camWorldPos.z, input.isUnderwater, input.waterDepth);
  skyState = sky.update(timeOfDay, elapsedSec, env, camWorldPos);
  syncDesktopMenuLabels();
}

function triggerNightEventDebug(forcedMode = null) {
  audio.unlock();
  getActiveCameraPose();
  const env = getEnvFactors(camWorldPos.x, camWorldPos.z, input.isUnderwater, input.waterDepth);
  if (!skyState.isNight && !isHorrorBiome(env.bw.dominant)) {
    timeOfDay = 0.92;
  }
  skyState = sky.update(timeOfDay, elapsedSec, env, camWorldPos);
  nightEvent.biome = env.bw.dominant;
  nightEvent.triggerNow(camWorldPos, camWorldDir, typeof forcedMode === "string" ? forcedMode : null);
  syncDesktopMenuLabels();
}

function teleportToBiome(name) {
  const spawn = CONFIG.BIOME_SPAWNS[name];
  if (!spawn) return false;
  input.teleportTo(spawn.x, spawn.z, spawn.yaw);
  getActiveCameraPose();
  const env = getEnvFactors(camWorldPos.x, camWorldPos.z, input.isUnderwater, input.waterDepth);
  skyState = sky.update(timeOfDay, elapsedSec, env, camWorldPos);
  chunkManager.update(camWorldPos.x, camWorldPos.z, elapsedSec, skyState, true, buildChunkEnv(env, skyState, elapsedSec));
  creatures.update(0.016, elapsedSec, camWorldPos, env.bw.dominant, skyState.isNight);
  syncDesktopMenuLabels();
  return true;
}

function setQuality(key) {
  if (!applyQualityPreset(key)) return false;
  getActiveCameraPose();
  const env = getEnvFactors(camWorldPos.x, camWorldPos.z, input.isUnderwater, input.waterDepth);
  skyState = sky.update(timeOfDay, elapsedSec, env, camWorldPos);
  chunkManager.rebuildAll();
  chunkManager.update(camWorldPos.x, camWorldPos.z, elapsedSec, skyState, true, buildChunkEnv(env, skyState, elapsedSec));
  syncDesktopMenuLabels();
  return true;
}

function setFlashlight(on) {
  flashlightOn = Boolean(on);
  audio.playFlashlightClick?.(flashlightOn);
  syncDesktopMenuLabels();
  return flashlightOn;
}

function toggleFlashlight() {
  return setFlashlight(!flashlightOn);
}

function cycleQuality() {
  const idx = QUALITY_ORDER.indexOf(CONFIG.QUALITY_PRESET);
  const next = QUALITY_ORDER[(idx + 1) % QUALITY_ORDER.length];
  setQuality(next);
}

function getMenuState() {
  return {
    biome: input.biome,
    quality: CONFIG.QUALITY_PRESET,
    isNight: skyState.isNight,
    cyclePaused,
    muted: audio.muted,
    flashlightOn,
    collisionsEnabled: CONFIG.ENABLE_COLLISIONS,
    anomaliesFound: anomalies.getState().discoveredCount,
  };
}

function syncDesktopMenuLabels() {
  if (!menuEl) return;
  for (const b of menuEl.querySelectorAll("[data-action^='biome:']")) {
    b.classList.toggle("active", b.dataset.action === `biome:${input.biome}`);
  }
  for (const b of menuEl.querySelectorAll("[data-action^='quality:']")) {
    b.classList.toggle("active", b.dataset.action === `quality:${CONFIG.QUALITY_PRESET}`);
  }
  if (btnNight) {
    btnNight.textContent = skyState.isNight ? "Modo: Noche [N]" : "Modo: Día [N]";
    btnNight.classList.toggle("active", skyState.isNight);
  }
  if (btnPause) {
    btnPause.textContent = cyclePaused ? "Ciclo: Pausado [T]" : "Ciclo: Activo [T]";
    btnPause.classList.toggle("active", cyclePaused);
  }
  if (btnMute) {
    btnMute.textContent = audio.muted ? "Audio: MUTE [M]" : "Audio: ON [M]";
    btnMute.classList.toggle("active", !audio.muted);
  }
  if (btnFlashlight) {
    btnFlashlight.textContent = `Linterna: ${flashlightOn ? "ON" : "OFF"} [L]`;
    btnFlashlight.classList.toggle("active", flashlightOn);
  }
  if (btnCollisions) {
    btnCollisions.textContent = `Colisiones Objetos: ${CONFIG.ENABLE_COLLISIONS ? "ON" : "OFF"}`;
    btnCollisions.classList.toggle("active", CONFIG.ENABLE_COLLISIONS);
  }
}

function setDesktopMenuOpen(open) {
  if (!menuEl) return;
  menuEl.hidden = !open;
  if (open) syncDesktopMenuLabels();
}

function toggleDesktopMenu() {
  if (!menuEl) return false;
  setDesktopMenuOpen(menuEl.hidden);
  return !menuEl.hidden;
}

const input = new InputController(
  renderer,
  camera,
  localFrame,
  vrBtn,
  {
    onUnlockAudio: () => audio.unlock(),
    onToggleNight: toggleNight,
    onTriggerEvent: () => triggerNightEventDebug(),
    onTogglePause: () => {
      cyclePaused = !cyclePaused;
      syncDesktopMenuLabels();
    },
    onToggleHud: () => {
      if (hudEl) hudEl.style.display = hudEl.style.display === "none" ? "block" : "none";
    },
    onToggleMute: () => {
      audio.unlock();
      audio.toggleMute();
      syncDesktopMenuLabels();
    },
    onToggleFlashlight: toggleFlashlight,
    onToggleCollisions: () => {
      CONFIG.ENABLE_COLLISIONS = !CONFIG.ENABLE_COLLISIONS;
      syncDesktopMenuLabels();
    },
    onCycleQuality: cycleQuality,
    onTeleportBiome: teleportToBiome,
    onFootstep: (surface, intensity) => audio.playPlayerFootstep(surface, intensity),
    onJump: (surface) => audio.playJump(surface),
    onSwimStroke: () => audio.playSwimStroke(),
    onPortalWarp: () => audio.playPortalWhoosh(),
    onToggleDesktopMenu: toggleDesktopMenu,
    isDesktopMenuOpen: () => Boolean(menuEl && !menuEl.hidden),
    onToggleVrMenu: () => {
      getActiveCameraPose();
      vrMenu.toggle(camWorldPos, camWorldDir, getMenuState());
    },
  },
  chunkManager
);

vrMenu = new VRMenu(renderer, localFrame, scene, {
  onUiClick: () => audio.playUiClick(),
  onTeleportBiome: teleportToBiome,
  onSetQuality: setQuality,
  onToggleNight: toggleNight,
  onTogglePause: () => {
    cyclePaused = !cyclePaused;
    syncDesktopMenuLabels();
  },
  onTriggerEvent: () => triggerNightEventDebug(),
  onToggleMute: () => {
    audio.unlock();
    audio.toggleMute();
    syncDesktopMenuLabels();
  },
  onToggleFlashlight: toggleFlashlight,
  onToggleCollisions: () => {
    CONFIG.ENABLE_COLLISIONS = !CONFIG.ENABLE_COLLISIONS;
    syncDesktopMenuLabels();
  },
  getMenuState,
});
input.setVrMenu(vrMenu);

hudMenuBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  audio.unlock();
  toggleDesktopMenu();
});
menuCloseBtn?.addEventListener("click", () => setDesktopMenuOpen(false));
menuEl?.addEventListener("click", (e) => {
  if (e.target === menuEl) {
    setDesktopMenuOpen(false);
    return;
  }
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  audio.unlock();
  audio.playUiClick();
  const action = btn.dataset.action;
  if (action.startsWith("biome:")) {
    teleportToBiome(action.slice(6));
    setDesktopMenuOpen(false);
  } else if (action.startsWith("quality:")) {
    setQuality(action.slice(8));
  } else if (action === "toggleNight") toggleNight();
  else if (action === "togglePause") {
    cyclePaused = !cyclePaused;
    syncDesktopMenuLabels();
  } else if (action === "triggerEvent") {
    triggerNightEventDebug();
    setDesktopMenuOpen(false);
  } else if (action === "toggleMute") {
    audio.toggleMute();
    syncDesktopMenuLabels();
  } else if (action === "toggleFlashlight") {
    toggleFlashlight();
  } else if (action === "toggleCollisions") {
    CONFIG.ENABLE_COLLISIONS = !CONFIG.ENABLE_COLLISIONS;
    syncDesktopMenuLabels();
  } else if (action === "toggleHud") {
    if (hudEl) hudEl.style.display = hudEl.style.display === "none" ? "block" : "none";
  }
});

let lastTimeMs = performance.now();
let smoothFps = 60;
let hudAccumSec = 0;

function formatEventText(ev, horrorActive = skyState.isNight) {
  if (ev.state === "active") {
    const m = (ev.mode || "periph").toUpperCase();
    const frozen = ev.mode === "stalker" && ev.stalkerFrozen ? ", FROZEN" : "";
    return `${m} (${ev.distance.toFixed(0)}m, ${ev.angleDeg.toFixed(0)}deg${frozen})`;
  }
  if (ev.state === "footsteps") return `${(ev.mode || "steps").toUpperCase()}...`;
  if (ev.state === "cooldown") return `COOL (${ev.lastOutcome})`;
  return horrorActive ? `ARMED (${ev.nextTimer.toFixed(0)}s)` : `CALM (${ev.lastOutcome})`;
}

renderer.setAnimationLoop((nowMs) => {
  const dt = Math.min(0.1, Math.max(0.001, (nowMs - lastTimeMs) / 1000));
  lastTimeMs = nowMs;
  elapsedSec += dt;

  const instFps = 1 / dt;
  smoothFps = smoothFps * 0.9 + instFps * 0.1;

  if (!cyclePaused) {
    timeOfDay = (timeOfDay + dt / CONFIG.DAY_CYCLE_SECONDS) % 1;
  }

  input.update(dt);
  getActiveCameraPose();
  audio.updateListener(camWorldPos, camWorldDir, camWorldUp);

  const env = getEnvFactors(camWorldPos.x, camWorldPos.z, input.isUnderwater, input.waterDepth);
  skyState = sky.update(timeOfDay, elapsedSec, env, camWorldPos);
  chunkManager.update(camWorldPos.x, camWorldPos.z, elapsedSec, skyState, false, buildChunkEnv(env, skyState, elapsedSec));
  creatures.update(dt, elapsedSec, camWorldPos, env.bw.dominant, skyState.isNight);
  anomalies.update(dt, elapsedSec, camWorldPos);
  liminalImpossible.update(dt, env.bw.dominant, camWorldPos, camWorldDir, (dx, dz) => {
    localFrame.position.x += dx;
    localFrame.position.z += dz;
    audio.playPortalWhoosh();
  });

  const horrorActive = !input.isUnderwater && (skyState.isNight || isHorrorBiome(env.bw.dominant));
  nightEvent.update(
    dt,
    horrorActive || nightEvent.state === "active" || nightEvent.state === "footsteps",
    camWorldPos,
    camWorldDir,
    { biome: env.bw.dominant }
  );

  vrMenu.update(getMenuState(), input.consumeVrTrigger(), camWorldPos, camWorldDir);

  audio.updateAmbient(dt, {
    isNight: skyState.isNight,
    biome: env.bw.dominant,
    isUnderwater: input.isUnderwater,
    playerPos: camWorldPos,
    suppressMusic: nightEvent.state === "active" || nightEvent.state === "footsteps",
  });

  renderer.render(scene, camera);

  hudAccumSec += dt;
  if (hudAccumSec >= 0.2) {
    hudAccumSec = 0;
    const activeSplats = spark.activeSplats || chunkManager.totalChunkSplats;
    const qualityLabel = QUALITY_PRESETS[CONFIG.QUALITY_PRESET]?.label || "Default";
    const ev = nightEvent.getDebugState();
    const evText = formatEventText(ev, horrorActive);
    const anomState = anomalies.getState();
    const biomeLabel = input.isUnderwater
      ? `${BIOME_LABELS[env.bw.dominant]} (Diving ${input.waterDepth.toFixed(1)}m)`
      : BIOME_LABELS[env.bw.dominant];

    hudFps.textContent = smoothFps.toFixed(1);
    hudSplats.textContent = `${activeSplats.toLocaleString()} / ${CONFIG.MAX_VISIBLE_SPLATS.toLocaleString()} [${qualityLabel}]`;
    hudChunks.textContent = `${chunkManager.getChunkCount()}`;
    hudBiome.textContent = biomeLabel;
    hudTime.textContent = `${skyState.label}${cyclePaused ? " [Paused]" : ""} (${timeOfDay.toFixed(2)})`;
    hudEvent.textContent = evText;
    if (hudAnomalies) {
      hudAnomalies.textContent = `${anomState.discoveredCount} / ${anomState.total}`;
    }

    input.updateVrHud(smoothFps, activeSplats, qualityLabel, biomeLabel, skyState.label, evText);
  }
});

// Inspection hook for Playwright verification and debugging.
window.__GW = {
  getState: () => {
    getActiveCameraPose();
    return {
      fps: Number(smoothFps.toFixed(1)),
      activeSplats: spark.activeSplats,
      totalChunkSplats: chunkManager.totalChunkSplats,
      maxVisibleSplats: CONFIG.MAX_VISIBLE_SPLATS,
      quality: CONFIG.QUALITY_PRESET,
      chunks: chunkManager.getChunkCount(),
      biome: input.biome,
      isGrounded: input.isGrounded,
      isInWater: input.isInWater,
      isUnderwater: input.isUnderwater,
      waterDepth: Number(input.waterDepth.toFixed(2)),
      footstepCount: input.footstepCount,
      portalTriggers: input.portalTriggers,
      collisionsEnabled: CONFIG.ENABLE_COLLISIONS,
      collisionHits: input.collisionHits,
      vrMenuOpen: vrMenu.isOpen,
      desktopMenuOpen: Boolean(menuEl && !menuEl.hidden),
      flashlightOn,
      anomalies: anomalies.getState(),
      liminalImpossible: liminalImpossible.getDebugState(),
      creatures: creatures.getDebugState(),
      music: audio.getMusicState(),
      camForward: {
        x: Number(camWorldDir.x.toFixed(4)),
        y: Number(camWorldDir.y.toFixed(4)),
        z: Number(camWorldDir.z.toFixed(4)),
      },
      timeOfDay: Number(timeOfDay.toFixed(3)),
      phase: skyState.label,
      isNight: skyState.isNight,
      playerPos: {
        x: Number(camWorldPos.x.toFixed(2)),
        y: Number(camWorldPos.y.toFixed(2)),
        z: Number(camWorldPos.z.toFixed(2)),
      },
      yawRad: Number(input.yaw.toFixed(4)),
      pitchRad: Number(input.pitch.toFixed(4)),
      event: nightEvent.getDebugState(),
    };
  },
  getSkyDebug: () => ({
    skyDomeParentIsScene: sky.dome.parent === scene,
    skyDomeRotationY: sky.dome.rotation.y,
    skyDomePosition: {
      x: Number(sky.dome.position.x.toFixed(2)),
      y: Number(sky.dome.position.y.toFixed(2)),
      z: Number(sky.dome.position.z.toFixed(2)),
    },
  }),
  getNearbyColliders: (radius = 20) => {
    getActiveCameraPose();
    return chunkManager.getNearbyColliders(camWorldPos.x, camWorldPos.z, radius);
  },
  setQuality,
  setFlashlight,
  toggleFlashlight,
  getAnomalyPosition: (biome) => anomalies.getPosition(biome),
  setCollisionsEnabled: (v) => {
    CONFIG.ENABLE_COLLISIONS = Boolean(v);
    syncDesktopMenuLabels();
  },
  toggleDesktopMenu,
  setVrMenuPreview: (open) => {
    getActiveCameraPose();
    if (open) vrMenu.open(camWorldPos, camWorldDir, getMenuState());
    else vrMenu.close();
  },
  simulateXrSnapAndForward: (snapTurns, localHeadYawRad, dt) =>
    input.simulateXrSnapAndForward(snapTurns, localHeadYawRad, dt),
  setTimeOfDay: (t) => {
    timeOfDay = ((t % 1) + 1) % 1;
    getActiveCameraPose();
    const env = getEnvFactors(camWorldPos.x, camWorldPos.z, input.isUnderwater, input.waterDepth);
    skyState = sky.update(timeOfDay, elapsedSec, env, camWorldPos);
  },
  setPaused: (v) => {
    cyclePaused = Boolean(v);
  },
  teleportToBiome,
  jump: () => input.triggerJump(),
  diveTo: (depth) => input.diveTo(depth),
  triggerNightEvent: (forcedMode = null) => triggerNightEventDebug(forcedMode),
  setYawPitch: (yaw, pitch = 0) => input.setYawPitch(yaw, pitch),
  movePlayer: (dx, dz) => input.movePlayer(dx, dz),
};
