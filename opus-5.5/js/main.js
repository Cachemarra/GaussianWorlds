import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { SparkRenderer, isOculus } from '@sparkjsdev/spark';
import { CFG } from './config.js';
import { World, U, Buf, bufToMesh, groundInfo, height } from './world.js';
import { AudioSys } from './audio.js';
import { NightEvent } from './figure.js';
import { smooth, mix, noise2 } from './noise.js';

const WY = CFG.WATER_Y;
// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 1200);
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
camera.position.y = CFG.EYE;
const spark = new SparkRenderer(isOculus() ? { renderer, maxStdDev: Math.sqrt(5) } : { renderer });
scene.add(spark);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const world = new World(scene);
const audio = new AudioSys();
const event = new NightEvent(scene, audio);

// ---------- sky: sun, moon + stars (rotating), clouds ----------
const celestial = new THREE.Group(); scene.add(celestial);
const sunB = new Buf(), nightB = new Buf(), cloudB = new Buf(), q0 = new THREE.Quaternion();
for (let i = 0; i < 12; i++) sunB.add((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, -400, 9 - i * 0.5, 9 - i * 0.5, 1, q0, 1, 0.92 - i * 0.02, 0.6, 0.35);
for (let i = 0; i < 6; i++) nightB.add(0, 0, 400, 7 - i, 7 - i, 1, q0, 0.92, 0.93, 1, 0.5);
for (let i = 0; i < 1600; i++) {
  const v = new THREE.Vector3().randomDirection().multiplyScalar(500), s = 0.4 + Math.random() * 0.9;
  nightB.add(v.x, v.y, v.z, s, s, s, q0, 0.9, 0.92, 1, 0.5 + Math.random() * 0.5);
}
for (let c = 0; c < 26; c++) {
  const a = Math.random() * 6.28, r = 60 + Math.random() * 260, x = Math.cos(a) * r, z = Math.sin(a) * r, y = 70 + Math.random() * 30;
  for (let i = 0; i < 22; i++) cloudB.add(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 5, z + (Math.random() - 0.5) * 14, 8, 3, 6, q0, 1, 1, 1, 0.35);
}
const sunMesh = bufToMesh(sunB, null), nightMesh = bufToMesh(nightB, null), clouds = bufToMesh(cloudB, 0);
celestial.add(sunMesh, nightMesh); scene.add(clouds);
const SKY_SPLATS = sunB.n + nightB.n + cloudB.n;

// ---------- player / input ----------
const keys = {};
let yaw = 0, pitch = 0, vy = 0, onGround = false, stepAcc = 0, wasSwim = false, hudOn = true;
let timeOffset = 0.3 * CFG.DAY_LENGTH; // start mid-morning
const env = { night: 0, under: 0, cave: 0, sea: 0, nearWater: 0, wind: 0.5 };

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyF') event.trigger(camPos, camFwd);
  if (e.code === 'KeyN') toggleNight();
  if (e.code === 'KeyH') { hudOn = !hudOn; hud.style.display = hudOn ? '' : 'none'; }
  const b = { Digit1: 'meadow', Digit2: 'forest', Digit3: 'cave', Digit4: 'sea' }[e.code];
  if (b) teleport(b);
});
addEventListener('keyup', (e) => (keys[e.code] = false));
renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock?.());
addEventListener('pointerdown', () => { audio.start(); document.getElementById('start')?.remove(); });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= e.movementX * 0.0022; pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.0022));
});
renderer.xr.addEventListener('sessionstart', () => { audio.start(); document.getElementById('start')?.remove(); });
renderer.xr.addEventListener('sessionend', () => { camera.position.set(0, CFG.EYE, 0); camera.rotation.set(0, 0, 0); });

function dayPhase() { return ((clock.elapsedTime + timeOffset) / CFG.DAY_LENGTH) % 1; }
function toggleNight() { // jump to midnight or noon
  const target = env.night > 0.5 ? 0.25 : 0.75;
  timeOffset += (((target - dayPhase()) % 1) + 1) % 1 * CFG.DAY_LENGTH;
}
function findBiome(b, fx = rig.position.x, fz = rig.position.z) {
  for (let r = 0; r < 4000; r += 12) for (let a = 0; a < 6.28; a += Math.max(0.05, 12 / Math.max(r, 1))) {
    const x = fx + Math.cos(a) * r, z = fz + Math.sin(a) * r, g = groundInfo(x, z);
    const ok = b === 'meadow' ? g.meadow > 0.95 && g.h > 0.8
      : b === 'forest' ? g.forest > 0.95 && g.h > 0.8
      : b === 'cave' ? g.ceil - g.h > 3.5 && g.cave > 0.75
      : g.sea > 0.95 && g.h < -5;
    if (ok) return { x, z };
  }
  return null;
}
function teleport(b) {
  const p = findBiome(b); if (!p) return false;
  rig.position.set(p.x, b === 'sea' ? WY - 1.25 : height(p.x, p.z), p.z); vy = 0;
  return true;
}

// VR controller state
let snapLatch = false, xLatch = false, yLatch = false;
function readXR() {
  const out = { mx: 0, mz: 0, up: false, down: false };
  const s = renderer.xr.getSession(); if (!s) return out;
  for (const src of s.inputSources) {
    const gp = src.gamepad; if (!gp) continue;
    const ax = gp.axes, bt = gp.buttons;
    if (src.handedness === 'left') {
      out.mx = Math.abs(ax[2]) > 0.15 ? ax[2] : 0; out.mz = Math.abs(ax[3]) > 0.15 ? -ax[3] : 0;
      if (bt[4]?.pressed && !xLatch) { toggleNight(); } xLatch = !!bt[4]?.pressed; // X: day/night
      if (bt[5]?.pressed && !yLatch) { event.trigger(camPos, camFwd); } yLatch = !!bt[5]?.pressed; // Y: debug event
    } else if (src.handedness === 'right') {
      const t = ax[2] ?? 0;
      if (Math.abs(t) > 0.7 && !snapLatch) { snapTurn(-Math.sign(t) * Math.PI / 6); snapLatch = true; }
      if (Math.abs(t) < 0.3) snapLatch = false;
      out.up = !!bt[4]?.pressed; out.down = !!bt[5]?.pressed; // A jump / swim up, B swim down
    }
  }
  return out;
}
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
function snapTurn(a) { // rotate around the head, not the rig origin
  camera.getWorldPosition(v1); rig.rotation.y += a; rig.updateMatrixWorld(true); camera.getWorldPosition(v2);
  rig.position.x += v1.x - v2.x; rig.position.z += v1.z - v2.z;
}
const blocked = (x, z) => { const g = groundInfo(x, z); return g.ceil - g.h < 1.9; }; // cave walls

const camPos = new THREE.Vector3(), camFwd = new THREE.Vector3(), camUp = new THREE.Vector3(), flat = new THREE.Vector3(), right = new THREE.Vector3(), vel = new THREE.Vector3();
function physics(dt) {
  const xr = renderer.xr.isPresenting, p = rig.position;
  if (!xr) { rig.rotation.y = yaw; camera.rotation.set(pitch, 0, 0); }
  const xin = readXR();
  const mx = xr ? xin.mx : (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const mz = xr ? xin.mz : (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const up = xr ? xin.up : keys.Space, down = xr ? xin.down : keys.KeyC || keys.ControlLeft;
  camera.getWorldDirection(camFwd);
  flat.set(camFwd.x, 0, camFwd.z).normalize(); right.crossVectors(flat, THREE.Object3D.DEFAULT_UP);
  const g = groundInfo(p.x, p.z);
  const swim = g.h < WY - 1.3 && p.y < WY - 1.0;
  if (swim && !wasSwim) audio.splash();
  wasSwim = swim;
  if (swim) {
    const tgt = v1.copy(camFwd).multiplyScalar(mz * CFG.SWIM).addScaledVector(right, mx * CFG.SWIM);
    tgt.y += (up ? 1.6 : 0) - (down ? 1.6 : 0) + 0.25; // slight buoyancy
    vel.lerp(tgt, Math.min(1, dt * 3));
    p.addScaledVector(vel, dt);
    p.y = Math.min(p.y, WY - 1.25); vy = 0; onGround = false;
    stepAcc += Math.hypot(vel.x, vel.z) * dt;
    if (stepAcc > 1.4 && p.y > WY - 1.5) { stepAcc = 0; audio.footstep('water', null, 0.6); }
  } else {
    const sp = (keys.ShiftLeft ? CFG.RUN : CFG.WALK) * (g.h < WY ? 0.6 : 1);
    vel.copy(flat).multiplyScalar(mz * sp).addScaledVector(right, mx * sp);
    const nx = p.x + vel.x * dt, nz = p.z + vel.z * dt;
    if (!blocked(nx, p.z)) p.x = nx;
    if (!blocked(p.x, nz)) p.z = nz;
    if (up && onGround) { vy = CFG.JUMP_V; onGround = false; }
    vy -= CFG.GRAVITY * dt; p.y += vy * dt;
    const h = height(p.x, p.z);
    if (p.y <= h) { if (!onGround && vy < -4) audio.land(); p.y = h; vy = 0; onGround = true; }
    if (onGround && vel.lengthSq() > 0.2) {
      stepAcc += vel.length() * dt;
      if (stepAcc > (keys.ShiftLeft ? 0.95 : 0.7)) { stepAcc = 0; audio.footstep(h < WY ? 'water' : g.cave > 0.5 && g.ceil < Infinity ? 'stone' : 'grass'); }
    }
  }
  p.y = Math.max(p.y, height(p.x, p.z));
}

// ---------- HUD (DOM for desktop, canvas plane for VR) ----------
const hud = document.getElementById('hud');
const hc = document.createElement('canvas'); hc.width = 512; hc.height = 200;
const htex = new THREE.CanvasTexture(hc);
const hplane = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.125), new THREE.MeshBasicMaterial({ map: htex, transparent: true, depthTest: false }));
hplane.position.set(-0.12, -0.16, -0.5); hplane.renderOrder = 999; hplane.visible = false; camera.add(hplane);
const fpsHist = []; let frames = 0, fpsT = 0, fps = 0, logT = 0;
function stats() {
  const recent = fpsHist.slice(-20);
  return {
    fps: Math.round(fps), fpsAvg10s: Math.round(recent.reduce((a, b) => a + b, 0) / (recent.length || 1)), fpsMin10s: Math.round(Math.min(...recent, 999)),
    splats: world.total + SKY_SPLATS, budget: CFG.SPLAT_BUDGET, density: +world.densityScale.toFixed(2), chunks: world.chunks.size,
    biome: env.under > 0.5 ? 'underwater' : env.cave > 0.5 ? 'cave' : env.sea > 0.5 ? 'sea' : biomeName, phase: +dayPhase().toFixed(2),
    night: +env.night.toFixed(2), event: event.state, xr: renderer.xr.isPresenting,
  };
}
let biomeName = 'meadow';
function updateHud(dt) {
  frames++; fpsT += dt;
  if (fpsT < 0.5) return;
  fps = frames / fpsT; frames = 0; fpsT = 0; fpsHist.push(fps); if (fpsHist.length > 200) fpsHist.shift();
  const s = stats();
  const lines = [`FPS ${s.fps}  (avg10s ${s.fpsAvg10s} / min ${s.fpsMin10s})`, `splats ${s.splats.toLocaleString()} / ${s.budget.toLocaleString()}  dens ${s.density}`,
    `chunks ${s.chunks}  ${s.biome}  ${s.night > 0.5 ? 'noche' : 'día'} ${s.phase}`, `evento: ${s.event}${event.state === 'visible' ? ` ${event.angle?.toFixed(0)}°` : ''}`];
  hud.textContent = lines.join('\n');
  if (renderer.xr.isPresenting && hudOn) {
    const c = hc.getContext('2d'); c.clearRect(0, 0, 512, 200); c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, 512, 200);
    c.fillStyle = '#fff'; c.font = '26px monospace'; lines.forEach((l, i) => c.fillText(l, 12, 40 + i * 44)); htex.needsUpdate = true;
  }
  hplane.visible = renderer.xr.isPresenting && hudOn;
  if ((logT += 0.5) >= 10) { logT = 0; console.log('[stats]', JSON.stringify(s)); }
}

// ---------- environment: day/night, tint, sky ----------
const bgNight = new THREE.Color(0.07, 0.09, 0.21), bgDay = new THREE.Color(0.55, 0.74, 0.93), bgDusk = new THREE.Color(0.9, 0.52, 0.35), bgWater = new THREE.Color(0.04, 0.22, 0.28);
function environment(dt, t) {
  const phase = dayPhase(), ang = phase * Math.PI * 2, elev = Math.sin(ang);
  const day = smooth(-0.12, 0.2, elev), dusk = Math.max(0, 1 - Math.abs(elev) / 0.3) * 0.85;
  const p = rig.position, g = groundInfo(camPos.x, camPos.z);
  biomeName = g.forest > 0.5 ? 'forest' : g.meadow > 0.5 ? 'meadow' : g.sea > 0.5 ? 'sea' : 'cave';
  const k = Math.min(1, dt * 2);
  env.night = 1 - day;
  env.under = camPos.y < WY ? 1 : 0;
  env.cave = mix(env.cave, g.ceil < Infinity && camPos.y < g.ceil ? 1 : 0, k);
  env.sea = mix(env.sea, g.sea, k);
  let wet = 0; for (let i = 0; i < 8; i++) if (height(p.x + Math.cos(i) * 7, p.z + Math.sin(i) * 7) < WY) wet++;
  env.nearWater = mix(env.nearWater, wet / 8, k);
  env.wind = 0.5 + 0.5 * noise2(t * 0.03, 0, 99);
  U.wind.value = 0.05 + env.wind * 0.16;
  U.time.value = t;
  const tint = U.tint.value.set(mix(0.3, 1, day), mix(0.36, 1, day), mix(0.62, 1, day));
  tint.multiply(v1.set(1, 1 - dusk * 0.25, 1 - dusk * 0.45));
  tint.multiplyScalar(1 - env.cave * 0.45);
  if (env.under) tint.multiply(v1.set(0.45, 0.75, 0.85));
  scene.background.copy(bgNight).lerp(bgDay, day).lerp(bgDusk, dusk * 0.7);
  if (env.under) scene.background.copy(bgWater).multiplyScalar(0.4 + day * 0.6);
  celestial.position.copy(camPos); celestial.rotation.x = ang;
  sunMesh.opacity = 1 - env.under; nightMesh.opacity = smooth(0.4, 0.9, env.night) * (1 - env.under);
  clouds.position.set(camPos.x + ((t * 1.5) % 200) - 100, 0, camPos.z);
  for (const m of [sunMesh, nightMesh, clouds]) m.updateVersion();
}

// ---------- main loop ----------
const clock = new THREE.Clock();
const spawn = findBiome('meadow', 0, 0) ?? { x: 0, z: 0 };
rig.position.set(spawn.x, height(spawn.x, spawn.z), spawn.z);
function loop() {
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  physics(dt);
  camera.updateMatrixWorld(true);
  camera.getWorldPosition(camPos); camera.getWorldDirection(camFwd); camUp.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
  environment(dt, t);
  world.update(camPos.x, camPos.z);
  world.animate();
  event.update(dt, env.night, camPos, camFwd, env.under > 0.5);
  audio.update(dt, camPos, camFwd, camUp, env);
  updateHud(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(loop);

// test / debug hooks (used by the headless check)
window.__poc = {
  stats, teleport, toggleNight, trigger: () => event.trigger(camPos, camFwd), event,
  look: (y, p) => { yaw = y; pitch = p; }, lookAtFigure: () => { const d = v2.copy(event.mesh.position).setY(event.mesh.position.y + 1.8).sub(camPos); yaw = Math.atan2(-d.x, -d.z); pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); },
  setPhase: (ph) => { timeOffset += (((ph - dayPhase()) % 1) + 1) % 1 * CFG.DAY_LENGTH; }, pos: () => rig.position.clone(),
};
