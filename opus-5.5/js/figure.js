// Night event: distant footsteps, then a dark figure at the edge of view that pops when looked at.
import * as THREE from 'three';
import { CFG } from './config.js';
import { Buf, bufToMesh, height } from './world.js';

const rand = (a, b) => a + Math.random() * (b - a);
const DEG = Math.PI / 180;

function figureMesh() {
  const b = new Buf(), q = new THREE.Quaternion(), c = 0.015;
  const add = (x, y, z, sx, sy, sz, rz = 0) => { q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rz); b.add(x, y, z, sx * 1.3, sy, sz * 1.3, q, c, c, c * 1.2, 1); };
  add(0, 1.88, 0, 0.11, 0.14, 0.11); // head (slightly too tall a figure on purpose: ~2 m)
  add(0, 1.72, 0, 0.05, 0.06, 0.05);
  for (let y = 1.25; y <= 1.6; y += 0.12) add(0, y, 0, 0.2, 0.12, 0.1); // torso
  for (const s of [-1, 1]) {
    for (let y = 0.95; y <= 1.55; y += 0.15) add(s * (0.26 + (1.55 - y) * 0.04), y, 0, 0.04, 0.14, 0.04, s * 0.05); // long arms
    for (let y = 0.1; y <= 1.05; y += 0.16) add(s * 0.09, y, 0, 0.055, 0.15, 0.055); // legs
  }
  return bufToMesh(b, null); // no tint modifier: stays black at night
}

export class NightEvent {
  constructor(scene, audio) {
    this.audio = audio; this.mesh = figureMesh(); this.mesh.visible = false; scene.add(this.mesh);
    this.state = 'idle'; this.timer = rand(CFG.EVENT_MIN, CFG.EVENT_MAX); this.lastSide = 0; this.log = [];
    this.tmp = new THREE.Vector3();
  }
  // camPos/camFwd: camera world position and direction (head = gaze proxy, Quest 3 has no eye tracking)
  update(dt, night, camPos, camFwd, blocked) {
    if (this.state === 'idle') {
      if (night > 0.7 && !blocked) this.timer -= dt;
      if (this.timer <= 0) this.trigger(camPos, camFwd);
      return;
    }
    this.t += dt;
    if (this.state === 'steps') { if (this.t >= this.appearAt) this.appear(camPos, camFwd); return; }
    // visible
    const head = this.tmp.copy(this.mesh.position); head.y += 1.8;
    const ang = camFwd.angleTo(head.sub(camPos)) / DEG;
    this.angle = ang;
    this.lookT = ang < CFG.FIG_LOOK_DEG ? this.lookT + dt : 0;
    this.mesh.lookAt(camPos.x, this.mesh.position.y, camPos.z);
    if (this.lookT > CFG.FIG_LOOK_HOLD) { // seen: vanish in one frame with a dry pop
      this.audio.pop(this.mesh.position.clone().setY(this.mesh.position.y + 1.6));
      this.end('popped');
    } else if (this.t > CFG.FIG_LIFETIME) this.end('faded');
    else if (this.t > CFG.FIG_LIFETIME - 1.5) this.mesh.opacity = (CFG.FIG_LIFETIME - this.t) / 1.5; // silent fade
  }
  trigger(camPos, camFwd) { // also the debug shortcut
    if (this.state !== 'idle') return;
    this.side = this.lastSide === 1 ? -1 : this.lastSide === -1 ? 1 : Math.random() < 0.5 ? -1 : 1; // never same side twice
    this.lastSide = this.side;
    this.state = 'steps'; this.t = 0; this.lookT = 0;
    const yaw = Math.atan2(camFwd.x, camFwd.z), n = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) { // 1-2 steps at 20-40 m, to the side or behind
      const a = yaw - this.side * rand(90, 160) * DEG, r = rand(20, 40);
      const x = camPos.x + Math.sin(a) * r, z = camPos.z + Math.cos(a) * r;
      setTimeout(() => this.audio.footstep('grass', { x, y: height(x, z) + 0.1, z }, 2.2), i * 650);
    }
    this.appearAt = n * 0.65 + 1.2;
    this.log.push(`steps side=${this.side > 0 ? 'R' : 'L'}`);
  }
  appear(camPos, camFwd) {
    const yaw = Math.atan2(camFwd.x, camFwd.z) - this.side * CFG.FIG_SPAWN_DEG * DEG; // +side = right of view
    // pick the highest ground among a few candidates so it reads as a silhouette against the sky
    let best = null;
    for (let i = 0; i < 6; i++) {
      const r = rand(25, 40), a = yaw + rand(-4, 4) * DEG, x = camPos.x + Math.sin(a) * r, z = camPos.z + Math.cos(a) * r, h = height(x, z);
      if (!best || h > best.h) best = { r, x, z, h };
    }
    const { r, x, z } = best;
    this.mesh.position.set(x, Math.max(height(x, z), CFG.WATER_Y), z);
    this.mesh.opacity = 1; this.mesh.visible = true; this.state = 'visible'; this.t = 0; this.lookT = 0;
    this.log.push(`appear r=${r.toFixed(0)}m`);
  }
  end(how) {
    this.mesh.visible = false; this.mesh.opacity = 0; // no trace left in the world
    this.state = 'idle'; this.timer = rand(CFG.EVENT_MIN, CFG.EVENT_MAX);
    this.log.push(how);
  }
}
