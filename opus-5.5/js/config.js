// All tunables in one place. URL params override: ?budget=200000&seed=7&day=120&radius=2
const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);

export const CFG = {
  SEED: num('seed', 1337),
  SPLAT_BUDGET: num('budget', 300000), // max splats loaded at once
  CHUNK: 24, // meters per chunk side
  RADIUS: num('radius', 3), // chunk rings loaded around player
  LOD_DENSITY: [1, 0.35, 0.12], // by ring distance: <=1, 2, >=3
  BUILDS_PER_FRAME: 1,
  DAY_LENGTH: num('day', 240), // seconds per full day/night cycle
  WATER_Y: 0,
  EYE: 1.6,
  WALK: 3.5,
  RUN: 7,
  JUMP_V: 5.2,
  GRAVITY: 14,
  SWIM: 2.5,
  // night event
  EVENT_MIN: 25,
  EVENT_MAX: 70,
  FIG_LOOK_DEG: 30,
  FIG_LOOK_HOLD: 0.25,
  FIG_LIFETIME: 10,
  FIG_SPAWN_DEG: 50,
};
