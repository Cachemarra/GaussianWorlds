import * as THREE from "three";
import { CONFIG } from "./config.js";

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uZenithColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uMoonDir;
  uniform float uNightFactor;
  uniform float uOutdoorFactor;
  uniform float uDreamFactor;
  uniform float uTerrorFactor;
  uniform float uTime;

  varying vec3 vWorldDir;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float up = clamp(dir.y, 0.0, 1.0);
    float horizonBlend = pow(1.0 - up, 2.2);

    vec3 sky = mix(uZenithColor, uHorizonColor, horizonBlend);

    if (uOutdoorFactor > 0.01) {
      float cloudBand = smoothstep(0.06, 0.55, dir.y);
      float wisp = sin(dir.x * 7.0 + uTime * 0.04) * cos(dir.z * 6.5 - uTime * 0.03);
      float wispMask = smoothstep(0.35, 0.85, wisp * 0.5 + 0.5) * cloudBand * (1.0 - uNightFactor * 0.85);
      sky = mix(sky, uHorizonColor * 1.12 + vec3(0.06), wispMask * 0.22 * uOutdoorFactor);

      // Sun disc (pastel oversized halo in Dreamcore, crimson eclipse in Terrorcore).
      float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
      float disc = smoothstep(0.9965 - uDreamFactor * 0.004, 0.9992 - uDreamFactor * 0.002, sunDot);
      float sunGlow = pow(sunDot, 10.0) * 0.35 + disc * 1.1;
      sky += uSunColor * sunGlow * (1.0 - uNightFactor * 0.9) * uOutdoorFactor * (1.0 - uTerrorFactor);

      if (uTerrorFactor > 0.05) {
        vec3 eclipseDir = normalize(vec3(-0.35, 0.38, -0.85));
        float ed = dot(dir, eclipseDir);
        float corona = pow(max(ed, 0.0), 16.0) * 0.45;
        float ring = smoothstep(0.986, 0.9925, ed) * (1.0 - smoothstep(0.9925, 0.996, ed));
        float core = smoothstep(0.9928, 0.9955, ed);
        sky += vec3(0.75, 0.06, 0.07) * corona * uTerrorFactor;
        sky = mix(sky, vec3(1.0, 0.14, 0.10), ring * 0.95 * uTerrorFactor);
        sky = mix(sky, vec3(0.015, 0.003, 0.005), core * uTerrorFactor);
      }

      // Moon disc & cool halo at night.
      float moonDot = max(dot(dir, normalize(uMoonDir)), 0.0);
      float moonGlow = pow(moonDot, 22.0) * 0.18 + smoothstep(0.9978, 0.9994, moonDot) * 0.85;
      sky += vec3(0.68, 0.78, 0.96) * moonGlow * uNightFactor * uOutdoorFactor * (1.0 - uTerrorFactor);

      // Crisp twinkling stars above horizon during night.
      if (uNightFactor > 0.05 && dir.y > 0.04 && uTerrorFactor < 0.5) {
        vec3 starCell = floor(dir * 190.0);
        float starRand = hash31(starCell);
        if (starRand > 0.9925) {
          vec3 cellCenter = normalize(starCell + 0.5);
          float d = length(dir - cellCenter) * 190.0;
          float twinkle = 0.65 + 0.35 * sin(uTime * 2.1 + starRand * 62.8);
          float star = smoothstep(0.55, 0.08, d) * twinkle * smoothstep(0.04, 0.25, dir.y);
          sky += vec3(0.82, 0.88, 1.0) * star * uNightFactor * uOutdoorFactor * (1.0 - uTerrorFactor);
        }
      }
    }

    gl_FragColor = vec4(sky, 1.0);
  }
`;

const SKY_STOPS = [
  {
    t: 0.0,
    zenith: new THREE.Color(0x070c1e),
    horizon: new THREE.Color(0x182546),
    fog: new THREE.Color(0x121d38),
    tint: new THREE.Color(0.24, 0.30, 0.46),
    ambient: new THREE.Color(0.012, 0.018, 0.032),
    sun: new THREE.Color(0x28355a),
  },
  {
    t: 0.20,
    zenith: new THREE.Color(0x0a1126),
    horizon: new THREE.Color(0x1b2a4f),
    fog: new THREE.Color(0x14203d),
    tint: new THREE.Color(0.28, 0.34, 0.50),
    ambient: new THREE.Color(0.014, 0.020, 0.035),
    sun: new THREE.Color(0x4a5b88),
  },
  {
    t: 0.28,
    zenith: new THREE.Color(0x3a64a3),
    horizon: new THREE.Color(0xe69f73),
    fog: new THREE.Color(0xc78f74),
    tint: new THREE.Color(1.02, 0.82, 0.72),
    ambient: new THREE.Color(0.05, 0.035, 0.03),
    sun: new THREE.Color(0xffb578),
  },
  {
    t: 0.38,
    zenith: new THREE.Color(0x3785d4),
    horizon: new THREE.Color(0xbce0f4),
    fog: new THREE.Color(0xafd7ee),
    tint: new THREE.Color(1.05, 1.03, 0.96),
    ambient: new THREE.Color(0.06, 0.07, 0.065),
    sun: new THREE.Color(0xfff1c9),
  },
  {
    t: 0.56,
    zenith: new THREE.Color(0x347ec9),
    horizon: new THREE.Color(0xb8def2),
    fog: new THREE.Color(0xaed3e8),
    tint: new THREE.Color(1.04, 1.02, 0.95),
    ambient: new THREE.Color(0.055, 0.065, 0.06),
    sun: new THREE.Color(0xffeeb8),
  },
  {
    t: 0.68,
    zenith: new THREE.Color(0x2c427d),
    horizon: new THREE.Color(0xd97d68),
    fog: new THREE.Color(0x9a646e),
    tint: new THREE.Color(0.92, 0.70, 0.66),
    ambient: new THREE.Color(0.04, 0.028, 0.035),
    sun: new THREE.Color(0xff8e5e),
  },
  {
    t: 0.78,
    zenith: new THREE.Color(0x091026),
    horizon: new THREE.Color(0x19274a),
    fog: new THREE.Color(0x131e3a),
    tint: new THREE.Color(0.28, 0.34, 0.50),
    ambient: new THREE.Color(0.014, 0.02, 0.034),
    sun: new THREE.Color(0x3b4a76),
  },
  {
    t: 1.0,
    zenith: new THREE.Color(0x070c1e),
    horizon: new THREE.Color(0x182546),
    fog: new THREE.Color(0x121d38),
    tint: new THREE.Color(0.24, 0.30, 0.46),
    ambient: new THREE.Color(0.012, 0.018, 0.032),
    sun: new THREE.Color(0x28355a),
  },
];

const CAVE_ZENITH = new THREE.Color(0x05070e);
const CAVE_HORIZON = new THREE.Color(0x0b101c);
const CAVE_FOG = new THREE.Color(0x090e18);
const CAVE_TINT = new THREE.Color(0.40, 0.46, 0.60);
const CAVE_AMBIENT = new THREE.Color(0.025, 0.032, 0.052);

const LIMINAL_ZENITH = new THREE.Color(0x2a2516);
const LIMINAL_HORIZON = new THREE.Color(0x403822);
const LIMINAL_FOG = new THREE.Color(0x3b3420);
const LIMINAL_TINT = new THREE.Color(0.82, 0.78, 0.64);
const LIMINAL_AMBIENT = new THREE.Color(0.06, 0.055, 0.038);

const DREAM_ZENITH = new THREE.Color(0x7c86e8);
const DREAM_HORIZON = new THREE.Color(0xf0a6cf);
const DREAM_FOG = new THREE.Color(0xd9a8e2);
const DREAM_TINT = new THREE.Color(0.86, 0.80, 0.90);
const DREAM_AMBIENT = new THREE.Color(0.038, 0.032, 0.052);

const TERROR_ZENITH = new THREE.Color(0x050103);
const TERROR_HORIZON = new THREE.Color(0x5c080e);
const TERROR_FOG = new THREE.Color(0x1e0306);
const TERROR_TINT = new THREE.Color(0.52, 0.20, 0.22);
const TERROR_AMBIENT = new THREE.Color(0.022, 0.006, 0.008);

const ECLIPSE_DIR = new THREE.Vector3(-0.35, 0.38, -0.85).normalize();

const UW_DAY_ZENITH = new THREE.Color(0x23a6cf);
const UW_DAY_HORIZON = new THREE.Color(0x0b5276);
const UW_DAY_FOG = new THREE.Color(0x0a4869);
const UW_DAY_TINT = new THREE.Color(0.52, 0.90, 1.02);
const UW_DAY_AMBIENT = new THREE.Color(0.03, 0.09, 0.13);

const UW_NIGHT_ZENITH = new THREE.Color(0x0a324d);
const UW_NIGHT_HORIZON = new THREE.Color(0x051b2c);
const UW_NIGHT_FOG = new THREE.Color(0x051828);
const UW_NIGHT_TINT = new THREE.Color(0.18, 0.36, 0.50);
const UW_NIGHT_AMBIENT = new THREE.Color(0.01, 0.03, 0.05);

function samplePalette(t, out) {
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const a = SKY_STOPS[i];
    const b = SKY_STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const u = (t - a.t) / Math.max(1e-5, b.t - a.t);
      const s = u * u * (3 - 2 * u);
      out.zenith.lerpColors(a.zenith, b.zenith, s);
      out.horizon.lerpColors(a.horizon, b.horizon, s);
      out.fog.lerpColors(a.fog, b.fog, s);
      out.tint.lerpColors(a.tint, b.tint, s);
      out.ambient.lerpColors(a.ambient, b.ambient, s);
      out.sun.lerpColors(a.sun, b.sun, s);
      return;
    }
  }
}

// Attach sky dome directly to scene (never localFrame!) so turning never rotates the sun, moon, or stars.
export function createSkySystem(scene) {
  const uniforms = {
    uZenithColor: { value: new THREE.Color(0x3785d4) },
    uHorizonColor: { value: new THREE.Color(0xbce0f4) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, -0.4).normalize() },
    uSunColor: { value: new THREE.Color(0xfff1c9) },
    uMoonDir: { value: new THREE.Vector3(-0.4, 0.6, -0.5).normalize() },
    uNightFactor: { value: 0 },
    uOutdoorFactor: { value: 1 },
    uDreamFactor: { value: 0 },
    uTerrorFactor: { value: 0 },
    uTime: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });

  const dome = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 16), material);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);

  const palette = {
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    fog: new THREE.Color(),
    tint: new THREE.Color(),
    ambient: new THREE.Color(),
    sun: new THREE.Color(),
  };

  const uwZenith = new THREE.Color();
  const uwHorizon = new THREE.Color();
  const uwFog = new THREE.Color();
  const uwTint = new THREE.Color();
  const uwAmbient = new THREE.Color();
  const primaryLightDir = new THREE.Vector3(0.4, 0.8, -0.4).normalize();

  function update(timeOfDay, elapsedSec, env = {}, camWorldPos = null) {
    if (camWorldPos) {
      dome.position.copy(camWorldPos);
    }

    const t = ((timeOfDay % 1) + 1) % 1;
    samplePalette(t, palette);

    const sunAngle = (t - 0.25) * Math.PI * 2;
    const sunY = Math.sin(sunAngle);
    const sunHoriz = Math.cos(sunAngle);
    uniforms.uSunDir.value.set(sunHoriz * 0.78, sunY, -0.62).normalize();
    uniforms.uMoonDir.value.set(-sunHoriz * 0.72, Math.max(0.28, -sunY * 0.8 + 0.22), -0.55).normalize();

    const nightFactor = THREE.MathUtils.clamp((-sunY + 0.14) / 0.34, 0, 1);
    const isNight = nightFactor >= CONFIG.NIGHT_THRESHOLD;

    const caveFactor = THREE.MathUtils.clamp(env.caveFactor ?? 0, 0, 1);
    const liminalFactor = THREE.MathUtils.clamp(env.liminalFactor ?? 0, 0, 1);
    const dreamcoreFactor = THREE.MathUtils.clamp(env.dreamcoreFactor ?? 0, 0, 1);
    const terrorcoreFactor = THREE.MathUtils.clamp(env.terrorcoreFactor ?? 0, 0, 1);
    const underwaterFactor = THREE.MathUtils.clamp(env.underwaterFactor ?? 0, 0, 1);

    if (dreamcoreFactor > 0.001) {
      const d = dreamcoreFactor * (1 - nightFactor * 0.45);
      palette.zenith.lerp(DREAM_ZENITH, d);
      palette.horizon.lerp(DREAM_HORIZON, d);
      palette.fog.lerp(DREAM_FOG, d);
      palette.tint.lerp(DREAM_TINT, d);
      palette.ambient.lerp(DREAM_AMBIENT, d);
    }

    if (terrorcoreFactor > 0.001) {
      palette.zenith.lerp(TERROR_ZENITH, terrorcoreFactor);
      palette.horizon.lerp(TERROR_HORIZON, terrorcoreFactor);
      palette.fog.lerp(TERROR_FOG, terrorcoreFactor);
      palette.tint.lerp(TERROR_TINT, terrorcoreFactor);
      palette.ambient.lerp(TERROR_AMBIENT, terrorcoreFactor);
    }

    if (caveFactor > 0.001) {
      palette.zenith.lerp(CAVE_ZENITH, caveFactor);
      palette.horizon.lerp(CAVE_HORIZON, caveFactor);
      palette.fog.lerp(CAVE_FOG, caveFactor);
      palette.tint.lerp(CAVE_TINT, caveFactor);
      palette.ambient.lerp(CAVE_AMBIENT, caveFactor);
    }

    if (liminalFactor > 0.001) {
      palette.zenith.lerp(LIMINAL_ZENITH, liminalFactor);
      palette.horizon.lerp(LIMINAL_HORIZON, liminalFactor);
      palette.fog.lerp(LIMINAL_FOG, liminalFactor);
      palette.tint.lerp(LIMINAL_TINT, liminalFactor);
      palette.ambient.lerp(LIMINAL_AMBIENT, liminalFactor);
    }

    if (underwaterFactor > 0.001) {
      uwZenith.lerpColors(UW_DAY_ZENITH, UW_NIGHT_ZENITH, nightFactor);
      uwHorizon.lerpColors(UW_DAY_HORIZON, UW_NIGHT_HORIZON, nightFactor);
      uwFog.lerpColors(UW_DAY_FOG, UW_NIGHT_FOG, nightFactor);
      uwTint.lerpColors(UW_DAY_TINT, UW_NIGHT_TINT, nightFactor);
      uwAmbient.lerpColors(UW_DAY_AMBIENT, UW_NIGHT_AMBIENT, nightFactor);

      palette.zenith.lerp(uwZenith, underwaterFactor);
      palette.horizon.lerp(uwHorizon, underwaterFactor);
      palette.fog.lerp(uwFog, underwaterFactor);
      palette.tint.lerp(uwTint, underwaterFactor);
      palette.ambient.lerp(uwAmbient, underwaterFactor);
    }

    let fogStart = CONFIG.FOG_START;
    let fogEnd = CONFIG.FOG_END;
    if (caveFactor > 0.01) {
      fogStart = THREE.MathUtils.lerp(fogStart, 12, caveFactor);
      fogEnd = THREE.MathUtils.lerp(fogEnd, 42, caveFactor);
    }
    if (liminalFactor > 0.01) {
      fogStart = THREE.MathUtils.lerp(fogStart, 10, liminalFactor);
      fogEnd = THREE.MathUtils.lerp(fogEnd, 38, liminalFactor);
    }
    if (terrorcoreFactor > 0.01) {
      fogStart = THREE.MathUtils.lerp(fogStart, 8, terrorcoreFactor);
      fogEnd = THREE.MathUtils.lerp(fogEnd, 34, terrorcoreFactor);
    }
    if (underwaterFactor > 0.01) {
      fogStart = THREE.MathUtils.lerp(fogStart, 5, underwaterFactor);
      fogEnd = THREE.MathUtils.lerp(fogEnd, 36, underwaterFactor);
    }

    // Normalized primary light direction: sun by day, moon by night, crimson eclipse in Terrorcore.
    primaryLightDir.copy(uniforms.uSunDir.value);
    if (primaryLightDir.y < 0.08) {
      primaryLightDir.y = 0.08;
      primaryLightDir.normalize();
    }
    if (nightFactor > 0.001) {
      primaryLightDir.lerp(uniforms.uMoonDir.value, nightFactor).normalize();
    }
    if (terrorcoreFactor > 0.001) {
      primaryLightDir.lerp(ECLIPSE_DIR, terrorcoreFactor).normalize();
    }

    uniforms.uZenithColor.value.copy(palette.zenith);
    uniforms.uHorizonColor.value.copy(palette.horizon);
    uniforms.uSunColor.value.copy(palette.sun);
    uniforms.uNightFactor.value = nightFactor;
    uniforms.uOutdoorFactor.value = Math.max(0, 1 - Math.max(caveFactor, liminalFactor, underwaterFactor));
    uniforms.uDreamFactor.value = dreamcoreFactor;
    uniforms.uTerrorFactor.value = terrorcoreFactor;
    uniforms.uTime.value = elapsedSec;

    let label = "Day";
    if (isNight) label = "Night";
    else if (t < 0.34 && t >= 0.21) label = "Dawn";
    else if (t >= 0.62 && t < 0.78) label = "Dusk";

    return {
      timeOfDay: t,
      nightFactor,
      isNight,
      sunDir: primaryLightDir,
      splatTint: palette.tint,
      splatAmbient: palette.ambient,
      fogColor: palette.fog,
      fogStart,
      fogEnd,
      label,
    };
  }

  return { dome, update };
}
