import * as THREE from "three";

const MENU_W = 920;
const MENU_H = 780;

// Stylized low-poly VR hand/glove + interactive 3D menu for Quest 3.
export class VRMenu {
  constructor(renderer, localFrame, scene, callbacks = {}) {
    this.renderer = renderer;
    this.localFrame = localFrame;
    this.scene = scene;
    this.callbacks = callbacks;

    this.isOpen = false;
    this.hoveredId = null;
    this._lastDrawSig = "";

    this.grips = [];
    this.controllers = [];
    this.lasers = [];
    this.flashlightMesh = null;

    this._raycaster = new THREE.Raycaster();
    this._rayOrigin = new THREE.Vector3();
    this._rayDir = new THREE.Vector3();
    this._rayQuat = new THREE.Quaternion();
    this._horizFwd = new THREE.Vector3();

    this._setupHandsAndLasers();
    this._setupMenuPanel();
  }

  _buildStylizedHand(handednessSign = 1) {
    const hand = new THREE.Group();

    const gloveMat = new THREE.MeshLambertMaterial({ color: 0x22324d });
    const cuffMat = new THREE.MeshLambertMaterial({ color: 0x152033 });
    const accentMat = new THREE.MeshBasicMaterial({ color: 0x6cd4ff });

    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.032, 0.06), cuffMat);
    cuff.position.set(0, -0.01, 0.065);
    hand.add(cuff);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.028, 0.08), gloveMat);
    palm.position.set(0, 0, 0.01);
    hand.add(palm);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.006, 0.012), accentMat);
    stripe.position.set(0, 0.016, -0.022);
    hand.add(stripe);

    const fingerGeo = new THREE.BoxGeometry(0.013, 0.014, 0.056);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(fingerGeo, gloveMat);
      const xOff = (-0.025 + i * 0.0165) * handednessSign;
      f.position.set(xOff, -0.004, -0.048);
      f.rotation.x = 0.28;
      hand.add(f);
    }

    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), accentMat);
    tip.position.set(-0.025 * handednessSign, -0.012, -0.076);
    hand.add(tip);

    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.045), gloveMat);
    thumb.position.set(-0.044 * handednessSign, -0.002, -0.006);
    thumb.rotation.y = 0.55 * handednessSign;
    thumb.rotation.x = 0.18;
    hand.add(thumb);

    return hand;
  }

  _buildFlashlightProp() {
    const group = new THREE.Group();
    group.position.set(0, -0.015, -0.02);

    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1c2430 });
    const headMat = new THREE.MeshLambertMaterial({ color: 0x2c3748 });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe4a8 });
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xfff6dc });
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff2cc,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.021, 0.16, 12), bodyMat);
    tube.rotation.x = Math.PI * 0.5;
    tube.position.set(0, 0, -0.04);
    group.add(tube);

    const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.019, 0.042, 12), headMat);
    bezel.rotation.x = Math.PI * 0.5;
    bezel.position.set(0, 0, -0.135);
    group.add(bezel);

    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0205, 0.0205, 0.012, 12), ringMat);
    ring.rotation.x = Math.PI * 0.5;
    ring.position.set(0, 0, -0.09);
    group.add(ring);

    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 12), lensMat);
    lens.rotation.y = Math.PI;
    lens.position.set(0, 0, -0.157);
    group.add(lens);

    // Volumetric beam cone: apex at lens (z = -0.155), open wide mouth extending forward along -Z.
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 12, 1, true), beamMat);
    beam.rotation.x = Math.PI * 0.5;
    beam.position.set(0, 0, -0.605);
    beam.renderOrder = 996;
    group.add(beam);

    group.visible = false;
    return group;
  }

  _setupHandsAndLasers() {
    const handLight = new THREE.HemisphereLight(0xd8ecff, 0x263547, 1.35);
    this.localFrame.add(handLight);

    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -2.5),
    ]);
    const laserMat = new THREE.LineBasicMaterial({
      color: 0x7be4ff,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });

    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      const grip = this.renderer.xr.getControllerGrip(i);

      const handMesh = this._buildStylizedHand(i === 0 ? -1 : 1);
      grip.add(handMesh);

      if (i === 1) {
        this.flashlightMesh = this._buildFlashlightProp();
        controller.add(this.flashlightMesh);
      }

      const laser = new THREE.Line(laserGeo.clone(), laserMat);
      laser.renderOrder = 997;
      laser.visible = false;
      controller.add(laser);

      this.localFrame.add(controller);
      this.localFrame.add(grip);

      this.controllers.push(controller);
      this.grips.push(grip);
      this.lasers.push(laser);
    }
  }

  _hasControllerPose(ctrl) {
    if (!ctrl) return false;
    return (
      ctrl.position.lengthSq() > 1e-6 ||
      Math.abs(ctrl.quaternion.x) > 1e-5 ||
      Math.abs(ctrl.quaternion.y) > 1e-5 ||
      Math.abs(ctrl.quaternion.z) > 1e-5
    );
  }

  getRightHandRay(outPos, outDir) {
    if (!this.renderer.xr.isPresenting) return false;
    const ctrl = this._hasControllerPose(this.controllers[1])
      ? this.controllers[1]
      : this._hasControllerPose(this.controllers[0])
        ? this.controllers[0]
        : null;
    if (!ctrl) return false;
    ctrl.getWorldPosition(outPos);
    ctrl.getWorldQuaternion(this._rayQuat);
    outDir.set(0, 0, -1).applyQuaternion(this._rayQuat).normalize();
    return true;
  }

  _setupMenuPanel() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = MENU_W;
    this.canvas.height = MENU_H;
    this.ctx = this.canvas.getContext("2d");
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;

    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.78), mat);
    this.panelMesh.renderOrder = 998;
    this.panelMesh.visible = false;
    this.scene.add(this.panelMesh);

    this.buttons = [
      // Biomes row 1
      { id: "biome:meadow", label: "Pradera", x: 34, y: 114, w: 205, h: 46 },
      { id: "biome:conifer", label: "Coníferas", x: 250, y: 114, w: 205, h: 46 },
      { id: "biome:cave", label: "Cueva", x: 466, y: 114, w: 205, h: 46 },
      { id: "biome:sea", label: "Mar", x: 682, y: 114, w: 204, h: 46 },
      // Biomes row 2
      { id: "biome:liminal", label: "Liminal", x: 34, y: 168, w: 276, h: 46 },
      { id: "biome:dreamcore", label: "Dreamcore", x: 322, y: 168, w: 276, h: 46 },
      { id: "biome:terrorcore", label: "Terrorcore", x: 610, y: 168, w: 276, h: 46 },
      // Quality presets row 3
      { id: "quality:default", label: "Default", x: 34, y: 246, w: 276, h: 46 },
      { id: "quality:high", label: "High (300k)", x: 322, y: 246, w: 276, h: 46 },
      { id: "quality:ultrax", label: "ULTRAX (500k)", x: 610, y: 246, w: 276, h: 46 },
      // Actions row 4
      { id: "toggleNight", label: "Día / Noche", x: 34, y: 324, w: 205, h: 46 },
      { id: "togglePause", label: "Pausar Ciclo", x: 250, y: 324, w: 205, h: 46 },
      { id: "triggerEvent", label: "Lanzar Evento", x: 466, y: 324, w: 205, h: 46 },
      { id: "toggleMute", label: "Audio", x: 682, y: 324, w: 204, h: 46 },
      // Actions row 5
      { id: "toggleFlashlight", label: "Linterna", x: 34, y: 378, w: 276, h: 46 },
      { id: "toggleCollisions", label: "Colisiones", x: 322, y: 378, w: 276, h: 46 },
      { id: "close", label: "Cerrar Menú", x: 610, y: 378, w: 276, h: 46 },
    ];
  }

  _draw(state) {
    const anomaliesFound = state.anomaliesFound ?? 0;
    const sig = JSON.stringify([
      this.hoveredId,
      state.biome,
      state.quality,
      state.isNight,
      state.cyclePaused,
      state.muted,
      state.collisionsEnabled,
      Boolean(state.flashlightOn),
      anomaliesFound,
    ]);
    if (sig === this._lastDrawSig) return;
    this._lastDrawSig = sig;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, MENU_W, MENU_H);

    ctx.fillStyle = "rgba(8, 14, 28, 0.93)";
    ctx.beginPath();
    ctx.roundRect(4, 4, MENU_W - 8, MENU_H - 8, 22);
    ctx.fill();
    ctx.strokeStyle = "rgba(120, 200, 255, 0.72)";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "#8cd3ff";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText("GaussianWorlds — Menú VR", 34, 44);

    ctx.fillStyle = "#c7daf5";
    ctx.font = "18px monospace";
    const statusLine = `Bioma: ${state.biome} · Calidad: ${state.quality} · ${state.isNight ? "Noche" : "Día"}`;
    ctx.fillText(statusLine, 34, 74);

    ctx.textAlign = "right";
    ctx.fillStyle = anomaliesFound > 0 ? "#ffd97d" : "#c7daf5";
    ctx.font = "bold 18px monospace";
    ctx.fillText(`Anomalías: ${anomaliesFound} / 7`, MENU_W - 34, 74);
    ctx.textAlign = "left";

    ctx.fillStyle = "#8aa5cc";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("ENTORNO / BIOMAS", 34, 104);
    ctx.fillText("CALIDAD DE SPLATS (LOD)", 34, 236);
    ctx.fillText("AJUSTES Y EVENTO", 34, 314);

    for (const b of this.buttons) {
      const hovered = this.hoveredId === b.id;
      const isActiveBiome = b.id === `biome:${state.biome}`;
      const isActiveQuality = b.id === `quality:${state.quality}`;
      const isActiveFlag =
        (b.id === "toggleNight" && state.isNight) ||
        (b.id === "togglePause" && state.cyclePaused) ||
        (b.id === "toggleMute" && !state.muted) ||
        (b.id === "toggleFlashlight" && Boolean(state.flashlightOn)) ||
        (b.id === "toggleCollisions" && state.collisionsEnabled);

      let label = b.label;
      if (b.id === "toggleNight") label = state.isNight ? "Modo: Noche" : "Modo: Día";
      if (b.id === "togglePause") label = state.cyclePaused ? "Ciclo: Pausado" : "Ciclo: Activo";
      if (b.id === "toggleMute") label = state.muted ? "Audio: MUTE" : "Audio: ON";
      if (b.id === "toggleFlashlight") {
        label = state.flashlightOn ? "Linterna: ON" : "Linterna: OFF";
      }
      if (b.id === "toggleCollisions") {
        label = `Colisiones: ${state.collisionsEnabled ? "ON" : "OFF"}`;
      }

      if (hovered) ctx.fillStyle = "rgba(65, 148, 235, 0.94)";
      else if (isActiveBiome || isActiveQuality || isActiveFlag) ctx.fillStyle = "rgba(28, 84, 148, 0.88)";
      else ctx.fillStyle = "rgba(22, 34, 58, 0.88)";

      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 10);
      ctx.fill();
      ctx.strokeStyle = hovered
        ? "#ffffff"
        : isActiveBiome || isActiveQuality || isActiveFlag
          ? "#7be4ff"
          : "rgba(150, 190, 240, 0.35)";
      ctx.lineWidth = hovered ? 3 : 2;
      ctx.stroke();

      ctx.fillStyle = "#f4f8ff";
      ctx.font = "bold 19px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(14, 24, 44, 0.88)";
    ctx.beginPath();
    ctx.roundRect(34, 442, MENU_W - 68, 304, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(130, 185, 245, 0.32)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#8cd3ff";
    ctx.font = "bold 19px sans-serif";
    ctx.fillText("CONTROLES META QUEST 3", 54, 474);

    const lines = [
      ["Stick Izquierdo", "Caminar / Nadar 3D (hacia donde miras)"],
      ["Stick Derecho (Izq/Der)", "Giro rápido por pasos (30°)"],
      ["Botón A (Mando Der)", "Brincar en tierra / Subir en el agua"],
      ["Botón X (Mando Izq)", "Bucear hacia abajo en el agua"],
      ["Grip Lateral Izquierdo", "Abrir / Cerrar este menú"],
      ["Grip Lateral Der", "Encender / Apagar Linterna"],
      ["Gatillo (Trigger)", "Pulsar botón del menú"],
      ["Botón Y (Izq) / B (Der)", "Alternar Día-Noche / Disparar Evento"],
    ];

    let y = 506;
    for (const [k, v] of lines) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px monospace";
      ctx.fillText(k, 54, y);
      ctx.fillStyle = "#b8d0f2";
      ctx.font = "18px sans-serif";
      ctx.fillText(v, 365, y);
      y += 30;
    }

    this.texture.needsUpdate = true;
  }

  _positionInFront(camWorldPos, camWorldDir) {
    this._horizFwd.set(camWorldDir.x, 0, camWorldDir.z);
    if (this._horizFwd.lengthSq() < 1e-4) this._horizFwd.set(0, 0, -1);
    this._horizFwd.normalize();

    this.panelMesh.position
      .copy(camWorldPos)
      .addScaledVector(this._horizFwd, 1.15);
    this.panelMesh.position.y = camWorldPos.y - 0.06;
    this.panelMesh.lookAt(camWorldPos.x, this.panelMesh.position.y, camWorldPos.z);
  }

  open(camWorldPos, camWorldDir, state) {
    this.isOpen = true;
    this.hoveredId = null;
    this._lastDrawSig = "";
    this._positionInFront(camWorldPos, camWorldDir);
    this._draw(state);
    this.panelMesh.visible = true;
    for (const l of this.lasers) l.visible = true;
  }

  close() {
    this.isOpen = false;
    this.hoveredId = null;
    this.panelMesh.visible = false;
    for (const l of this.lasers) l.visible = false;
  }

  toggle(camWorldPos, camWorldDir, state) {
    if (this.isOpen) this.close();
    else this.open(camWorldPos, camWorldDir, state);
    return this.isOpen;
  }

  _invokeAction(id, camWorldPos, camWorldDir, state) {
    this.callbacks.onUiClick?.();
    if (id.startsWith("biome:")) {
      this.callbacks.onTeleportBiome?.(id.slice(6));
      this.close();
      return;
    }
    if (id.startsWith("quality:")) {
      this.callbacks.onSetQuality?.(id.slice(8));
      this._draw(this.callbacks.getMenuState?.() ?? state);
      return;
    }
    if (id === "toggleNight") this.callbacks.onToggleNight?.();
    else if (id === "togglePause") this.callbacks.onTogglePause?.();
    else if (id === "triggerEvent") {
      this.callbacks.onTriggerEvent?.();
      this.close();
      return;
    } else if (id === "toggleMute") this.callbacks.onToggleMute?.();
    else if (id === "toggleFlashlight") this.callbacks.onToggleFlashlight?.();
    else if (id === "toggleCollisions") this.callbacks.onToggleCollisions?.();
    else if (id === "close") {
      this.close();
      return;
    }
    this._draw(this.callbacks.getMenuState?.() ?? state);
  }

  update(state, triggerClicked = false, camWorldPos = null, camWorldDir = null) {
    const inXr = this.renderer.xr.isPresenting;
    for (const g of this.grips) g.visible = inXr;
    if (this.flashlightMesh) {
      this.flashlightMesh.visible = Boolean(inXr && state?.flashlightOn);
    }

    if (!this.isOpen) {
      for (const l of this.lasers) l.visible = false;
      return;
    }

    let nextHover = null;
    for (let i = 0; i < this.controllers.length; i++) {
      const ctrl = this.controllers[i];
      const laser = this.lasers[i];
      laser.visible = inXr;

      ctrl.getWorldPosition(this._rayOrigin);
      ctrl.getWorldQuaternion(this._rayQuat);
      this._rayDir.set(0, 0, -1).applyQuaternion(this._rayQuat).normalize();
      this._raycaster.set(this._rayOrigin, this._rayDir);

      const hits = this._raycaster.intersectObject(this.panelMesh, false);
      if (hits.length > 0 && hits[0].uv) {
        const uv = hits[0].uv;
        const px = uv.x * MENU_W;
        const py = (1 - uv.y) * MENU_H;

        const posAttr = laser.geometry.getAttribute("position");
        posAttr.setXYZ(1, 0, 0, -hits[0].distance);
        posAttr.needsUpdate = true;

        for (const b of this.buttons) {
          if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
            nextHover = b.id;
            break;
          }
        }
      } else {
        const posAttr = laser.geometry.getAttribute("position");
        posAttr.setXYZ(1, 0, 0, -2.5);
        posAttr.needsUpdate = true;
      }
    }

    this.hoveredId = nextHover;
    this._draw(state);

    if (triggerClicked && this.hoveredId) {
      this._invokeAction(this.hoveredId, camWorldPos, camWorldDir, state);
    }
  }
}
