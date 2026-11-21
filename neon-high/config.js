// Tunable configuration for the GaussianWorlds PoC.
// Adjust these constants first when profiling on Meta Quest 3.
export const QUALITY_PRESETS = {
  default: {
    label: "Default",
    maxSplats: 180_000,
    densityScale: 1.0,
    chunkRadius: 3,
    pruneRadius: 3.35,
    splatSizeScale: 1.0,
  },
  high: {
    label: "High (300k)",
    maxSplats: 300_000,
    densityScale: 3.0,
    chunkRadius: 3,
    pruneRadius: 3.35,
    splatSizeScale: 0.84,
  },
  ultrax: {
    label: "ULTRAX (500k)",
    maxSplats: 500_000,
    densityScale: 4.9,
    chunkRadius: 4,
    pruneRadius: 3.85,
    splatSizeScale: 0.75,
  },
};

export const CONFIG = {
  // Active quality preset and splat budget cap (Default ~100k, High <= 300k, ULTRAX <= 500k).
  QUALITY_PRESET: "default",
  MAX_VISIBLE_SPLATS: QUALITY_PRESETS.default.maxSplats,
  DENSITY_SCALE: QUALITY_PRESETS.default.densityScale,
  SPLAT_SIZE_SCALE: QUALITY_PRESETS.default.splatSizeScale,

  // Deterministic world seed.
  WORLD_SEED: 1337,

  // Square chunk dimensions and circular load radius (in chunk units).
  CHUNK_SIZE: 24,
  CHUNK_RADIUS: QUALITY_PRESETS.default.chunkRadius,
  CHUNK_PRUNE_RADIUS: QUALITY_PRESETS.default.pruneRadius,

  // Hysteresis distances (in chunk units) for LOD 0 -> 1 -> 2 transitions.
  LOD_THRESHOLDS: {
    lod0In: 1.35,
    lod0Out: 1.55,
    lod1In: 2.35,
    lod1Out: 2.55,
  },

  // Amortize chunk generation during movement (initial center loads immediately).
  CHUNKS_PER_FRAME: 2,

  // SparkRenderer Gaussian cutoff (sqrt(5) saves fill-rate on mobile/Quest VR).
  SPARK_MAX_STD_DEV: Math.sqrt(5),

  // Wind intensity multiplier for grass, foliage, and kelp.
  WIND_STRENGTH: 1.0,

  // Day/night cycle timing.
  DAY_CYCLE_SECONDS: 180,
  INITIAL_TIME_OF_DAY: 0.42, // Bright morning-to-midday start
  NIGHT_THRESHOLD: 0.65,

  // Global water plane elevation (rivers, lakes, cave puddles, poolrooms, and sea).
  WATER_LEVEL: 0.0,

  // Painterly horizon fog (meters from player).
  FOG_START: 46,
  FOG_END: 76,

  // Locomotion, jumping, diving, and footsteps.
  MOVE_SPEED: 4.5,
  SPRINT_MULT: 1.7,
  EYE_HEIGHT: 1.65,
  SNAP_TURN_DEG: 30,
  GRAVITY: 18.0,
  JUMP_VELOCITY: 7.2,
  SWIM_SPEED: 3.8,
  SWIM_VERTICAL_SPEED: 3.2,
  STEP_STRIDE: 2.1,
  SWIM_STRIDE: 2.8,

  // Continuous world anchors for all 7 biomes (1-7 quick teleport shortcuts).
  BIOME_SPAWNS: {
    meadow: { x: 0, z: 0, yaw: 0 },
    conifer: { x: 160, z: 0, yaw: 0 },
    cave: { x: 0, z: 160, yaw: 0 },
    sea: { x: -118, z: 0, yaw: Math.PI * 0.5 },
    liminal: { x: 0, z: -170, yaw: 0 },
    dreamcore: { x: 150, z: -150, yaw: 0 },
    terrorcore: { x: -150, z: 150, yaw: 0 },
  },

  // Analytical object collisions (trees, rocks, wells, walls, stalagmites, crystals, corals).
  ENABLE_COLLISIONS: true,
  PLAYER_RADIUS: 0.42,

  // Night-only figure event parameters.
  EVENT_MIN_INTERVAL: 25,
  EVENT_MAX_INTERVAL: 70,
  EVENT_COOLDOWN: 12,
  FOOTSTEP_DIST_MIN: 20,
  FOOTSTEP_DIST_MAX: 40,
  FIGURE_DIST_MIN: 25,
  FIGURE_DIST_MAX: 40,
  FIGURE_ANGLE_DEG: 59,
  FIGURE_GAZE_ANGLE_DEG: 32,
  FIGURE_GAZE_HOLD_SEC: 0.20,
  FIGURE_LIFETIME_SEC: 10.0,
  FIGURE_FADE_SEC: 1.6,
};

export function applyQualityPreset(key) {
  const preset = QUALITY_PRESETS[key];
  if (!preset) return false;
  CONFIG.QUALITY_PRESET = key;
  CONFIG.MAX_VISIBLE_SPLATS = preset.maxSplats;
  CONFIG.DENSITY_SCALE = preset.densityScale;
  CONFIG.CHUNK_RADIUS = preset.chunkRadius;
  CONFIG.CHUNK_PRUNE_RADIUS = preset.pruneRadius;
  CONFIG.SPLAT_SIZE_SCALE = preset.splatSizeScale;
  return true;
}
