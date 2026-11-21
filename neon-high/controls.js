import * as THREE from "three";
import { CONFIG } from "./config.js";
import {
  getBiomeWeights,
  getTerrainHeight,
  getCaveCeilingHeight,
  getLiminalCeilingHeight,
  getSurfaceType,
} from "./terrain.js";

export class InputController {
  constructor(renderer, camera, localFrame, vrButton, callbacks = {}, chunkManager = null) {
    this.renderer = renderer;
    this.camera = camera;
    this.localFrame = localFrame;
    this.vrButton = vrButton;
    this.callbacks = callbacks;
    this.chunkManager = chunkManager;
    this.vrMenu = null;

    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.xrSupported = false;
    this.snapLatch = false;
    this.prevVrB = false;
    this.prevVrY = false;
    this.prevVrA = false;
    this.prevVrLeftGrip = false;
    this.prevVrRightGrip = false;
    this.prevVrTrigger = false;
    this._vrTriggerClicked = false;

    this.verticalVel = 0;
    this.isGrounded = true;
    this.isInWater = false;
    this.isUnderwater = false;
    this.waterDepth = 0;
    this.stepDistAccum = 0;
    this.swimDistAccum = 0;
    this.footstepCount = 0;
    this.collisionHits = 0;
    this.portalCooldown = 0;
    this.portalTriggers = 0;
    this.biome = "meadow";

    this._moveVec = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._worldPos = new THREE.Vector3();
    this._pivotBefore = new THREE.Vector3();
    this._pivotAfter = new THREE.Vector3();

    this._bindDesktopEvents();
    this._initWebXR();
    this._initVrHud();
  }

  setVrMenu(vrMenu) {
    this.vrMenu = vrMenu;
  }

  consumeVrTrigger() {
    const clicked = this._vrTriggerClicked;
    this._vrTriggerClicked = false;
    return clicked;
  }

  _bindDesktopEvents() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener("click", () => {
      this.callbacks.onUnlockAudio?.();
      if (this.callbacks.isDesktopMenuOpen?.()) return;
      if (!this.renderer.xr.isPresenting && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    });

    document.addEventListener("mousemove", (e) => {
      if (this.renderer.xr.isPresenting) return;
      if (document.pointerLockElement !== canvas) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - e.movementY * 0.0022,
        -THREE.MathUtils.degToRad(80),
        THREE.MathUtils.degToRad(80)
      );
      this.localFrame.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
    });

    window.addEventListener("keydown", (e) => {
      this.callbacks.onUnlockAudio?.();
      if (e.code === "Tab") {
        e.preventDefault();
        if (!e.repeat) {
          if (document.pointerLockElement === canvas) document.exitPointerLock?.();
          this.callbacks.onToggleDesktopMenu?.();
        }
        return;
      }
      this.keys.add(e.code);
      if (e.code === "Space") e.preventDefault();
      if (e.repeat) return;

      if (e.code === "Space") this.triggerJump();
      if (e.code === "KeyN") this.callbacks.onToggleNight?.();
      if (e.code === "KeyF") this.callbacks.onTriggerEvent?.();
      if (e.code === "KeyT") this.callbacks.onTogglePause?.();
      if (e.code === "KeyH") this.callbacks.onToggleHud?.();
      if (e.code === "KeyM") this.callbacks.onToggleMute?.();
      if (e.code === "KeyQ") this.callbacks.onCycleQuality?.();
      if (e.code === "KeyL") this.callbacks.onToggleFlashlight?.();
      if (e.code === "Digit1") this.callbacks.onTeleportBiome?.("meadow");
      if (e.code === "Digit2") this.callbacks.onTeleportBiome?.("conifer");
      if (e.code === "Digit3") this.callbacks.onTeleportBiome?.("cave");
      if (e.code === "Digit4") this.callbacks.onTeleportBiome?.("sea");
      if (e.code === "Digit5") this.callbacks.onTeleportBiome?.("liminal");
      if (e.code === "Digit6") this.callbacks.onTeleportBiome?.("dreamcore");
      if (e.code === "Digit7") this.callbacks.onTeleportBiome?.("terrorcore");
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });
  }

  async _initWebXR() {
    if (!navigator.xr) return;
    try {
      const supported = await navigator.xr.isSessionSupported("immersive-vr");
      if (!supported) return;
      this.xrSupported = true;
      this.renderer.xr.enabled = true;
      this.renderer.xr.setReferenceSpaceType("local-floor");

      if (this.vrButton) {
        this.vrButton.hidden = false;
        this.vrButton.addEventListener("click", () => this._enterVR());
      }
    } catch {
      this.xrSupported = false;
    }
  }

  async _enterVR() {
    this.callbacks.onUnlockAudio?.();
    if (!navigator.xr) return;

    const current = this.renderer.xr.getSession();
    if (current) {
      await current.end();
      return;
    }

    try {
      const session = await navigator.xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "bounded-floor"],
      });

      const onEnd = () => {
        session.removeEventListener("end", onEnd);
        this.camera.position.set(0, CONFIG.EYE_HEIGHT, 0);
        this.camera.rotation.set(this.pitch, 0, 0);
        this.vrMenu?.close();
        if (this.vrButton) this.vrButton.textContent = "Enter VR";
        if (this.vrHudMesh) this.vrHudMesh.visible = false;
      };
      session.addEventListener("end", onEnd);

      this.camera.position.set(0, 0, 0);
      this.camera.rotation.set(0, 0, 0);
      await this.renderer.xr.setSession(session);
      if (this.vrButton) this.vrButton.textContent = "Exit VR";
    } catch (err) {
      console.warn("Failed to start WebXR session:", err);
    }
  }

  _initVrHud() {
    const canvas = document.createElement("canvas");
    canvas.width = 450;
    canvas.height = 225;
    const ctx = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.39, 0.195), material);
    mesh.position.set(-0.32, -0.22, -1.1);
    mesh.rotation.y = 0.22;
    mesh.renderOrder = 999;
    mesh.visible = false;
    this.camera.add(mesh);

    this.vrHudCanvas = canvas;
    this.vrHudCtx = ctx;
    this.vrHudTex = texture;
    this.vrHudMesh = mesh;
  }

  updateVrHud(fps, activeSplats, qualityLabel, biomeLabel, phaseLabel, eventText) {
    if (!this.vrHudMesh) return;
    const presenting = this.renderer.xr.isPresenting;
    this.vrHudMesh.visible = presenting;
    if (!presenting) return;

    const ctx = this.vrHudCtx;
    ctx.clearRect(0, 0, this.vrHudCanvas.width, this.vrHudCanvas.height);
    ctx.fillStyle = "rgba(8, 12, 22, 0.78)";
    ctx.fillRect(0, 0, 450, 225);
    ctx.strokeStyle = "rgba(155, 195, 255, 0.55)";
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 446, 221);

    ctx.fillStyle = "#e8f1ff";
    ctx.font = "bold 24px monospace";
    ctx.fillText(`FPS: ${fps.toFixed(1)}`, 18, 34);
    ctx.fillText(`Splats: ${activeSplats.toLocaleString()} [${qualityLabel}]`, 18, 66);

    ctx.fillStyle = "#a8c7f0";
    ctx.font = "19px monospace";
    ctx.fillText(`Biome: ${biomeLabel}`, 18, 102);
    ctx.fillText(`Phase: ${phaseLabel}`, 18, 134);
    ctx.fillText(`Event: ${eventText}`, 18, 166);

    ctx.fillStyle = "#7be4ff";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("Grip Izq: Menú · Grip Der: Linterna", 18, 204);
    this.vrHudTex.needsUpdate = true;
  }

  setYawPitch(yawRad, pitchRad = 0) {
    this.yaw = yawRad;
    this.pitch = THREE.MathUtils.clamp(
      pitchRad,
      -THREE.MathUtils.degToRad(80),
      THREE.MathUtils.degToRad(80)
    );
    this.localFrame.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.localFrame.updateMatrixWorld(true);
  }

  teleportTo(x, z, yawRad = 0) {
    const gy = getTerrainHeight(x, z);
    this.localFrame.position.set(x, gy, z);
    this.verticalVel = 0;
    this.isGrounded = true;
    this.stepDistAccum = 0;
    this.swimDistAccum = 0;
    this.setYawPitch(yawRad, 0);
    this._syncEnvironmentFlags(x, z);
  }

  movePlayer(dx, dz) {
    this.localFrame.position.x += dx;
    this.localFrame.position.z += dz;
    const x = this.localFrame.position.x;
    const z = this.localFrame.position.z;
    const gy = getTerrainHeight(x, z);
    if (this.isGrounded && !this.isInWater) {
      this.localFrame.position.y = gy;
    }
    this._syncEnvironmentFlags(x, z);
  }

  diveTo(depthMeters = 3.0) {
    const x = this.localFrame.position.x;
    const z = this.localFrame.position.z;
    const gy = getTerrainHeight(x, z);
    const targetEyeY = Math.max(gy + 1.1, CONFIG.WATER_LEVEL - depthMeters);
    const eyeOffset = this.renderer.xr.isPresenting ? this.camera.position.y : CONFIG.EYE_HEIGHT;
    this.localFrame.position.y = targetEyeY - eyeOffset;
    this.verticalVel = 0;
    this.isGrounded = false;
    this._syncEnvironmentFlags(x, z);
  }

  triggerJump() {
    if (this.isInWater) return false;
    if (this.isGrounded) {
      this.verticalVel = CONFIG.JUMP_VELOCITY;
      this.isGrounded = false;
      const surface = getSurfaceType(
        this.localFrame.position.x,
        this.localFrame.position.z,
        this.localFrame.position.y
      );
      this.callbacks.onJump?.(surface);
      return true;
    }
    return false;
  }

  // Executes the exact VR snap-turn pivot + head-direction forward locomotion math for verification.
  simulateXrSnapAndForward(snapTurns, localHeadYawRad, dt = 0.25) {
    this.camera.rotation.set(0, localHeadYawRad, 0);
    for (let i = 0; i < snapTurns; i++) {
      this._applyHeadPivotSnapTurn(-THREE.MathUtils.degToRad(CONFIG.SNAP_TURN_DEG));
    }
    this.localFrame.updateMatrixWorld(true);
    this.camera.getWorldDirection(this._camDir).normalize();
    this._fwd.set(this._camDir.x, 0, this._camDir.z).normalize();

    const startX = this.localFrame.position.x;
    const startZ = this.localFrame.position.z;
    this.localFrame.position.addScaledVector(this._fwd, CONFIG.MOVE_SPEED * dt);
    this.localFrame.updateMatrixWorld(true);

    return {
      camForward: { x: this._fwd.x, z: this._fwd.z },
      deltaPos: {
        x: this.localFrame.position.x - startX,
        z: this.localFrame.position.z - startZ,
      },
    };
  }

  _applyHeadPivotSnapTurn(stepRad) {
    this.localFrame.updateMatrixWorld(true);
    this.camera.getWorldPosition(this._pivotBefore);
    this.localFrame.rotation.y += stepRad;
    this.yaw = this.localFrame.rotation.y;
    this.localFrame.updateMatrixWorld(true);
    this.camera.getWorldPosition(this._pivotAfter);
    this.localFrame.position.x += this._pivotBefore.x - this._pivotAfter.x;
    this.localFrame.position.z += this._pivotBefore.z - this._pivotAfter.z;
    this.localFrame.updateMatrixWorld(true);
  }

  _syncEnvironmentFlags(x, z) {
    const groundY = getTerrainHeight(x, z);
    const eyeHeight = this.renderer.xr.isPresenting ? Math.max(0.4, this.camera.position.y) : CONFIG.EYE_HEIGHT;
    const eyeY = this.localFrame.position.y + eyeHeight;

    this.biome = getBiomeWeights(x, z).dominant;
    this.isInWater = groundY < CONFIG.WATER_LEVEL - 0.65 && this.localFrame.position.y <= CONFIG.WATER_LEVEL - 0.35;
    this.waterDepth = Math.max(0, CONFIG.WATER_LEVEL - eyeY);
    this.isUnderwater = eyeY < CONFIG.WATER_LEVEL - 0.05 && groundY < CONFIG.WATER_LEVEL - 0.25;
  }

  update(dt) {
    // IMPORTANT: Never call renderer.xr.getCamera().updateMatrixWorld(true) because it is
    // an unparented ArrayCamera whose world matrix overwrites localFrame's snap-turn yaw.
    this.localFrame.updateMatrixWorld(true);
    this.camera.getWorldPosition(this._worldPos);

    const prevX = this.localFrame.position.x;
    const prevZ = this.localFrame.position.z;

    this._syncEnvironmentFlags(this._worldPos.x, this._worldPos.z);

    let swimUp = false;
    let swimDown = false;
    if (this.renderer.xr.isPresenting) {
      const xrState = this._updateXR(dt);
      swimUp = xrState.swimUp;
      swimDown = xrState.swimDown;
    } else {
      const deskState = this._updateDesktop(dt);
      swimUp = deskState.swimUp;
      swimDown = deskState.swimDown;
    }

    // Resolve horizontal object collisions around the player's world head XZ.
    this.localFrame.updateMatrixWorld(true);
    this.camera.getWorldPosition(this._worldPos);
    const col = this.chunkManager?.resolveCollisions(
      this._worldPos.x,
      this._worldPos.z,
      this.localFrame.position.y,
      CONFIG.EYE_HEIGHT
    );
    if (col) {
      this.localFrame.position.x += col.dx;
      this.localFrame.position.z += col.dz;
      this.collisionHits += col.hitCount;
    }

    this.localFrame.updateMatrixWorld(true);
    this.camera.getWorldPosition(this._worldPos);

    const bwCheck = getBiomeWeights(this._worldPos.x, this._worldPos.z);
    if (this.portalCooldown > 0) this.portalCooldown = Math.max(0, this.portalCooldown - dt);
    if (this.portalCooldown <= 0 && bwCheck.liminal > 0.35) {
      const portal = this.chunkManager?.checkPortal(this._worldPos.x, this._worldPos.z);
      if (portal) {
        this.localFrame.position.x += portal.shiftX;
        this.localFrame.position.z += portal.shiftZ;
        this.portalCooldown = 1.6;
        this.portalTriggers++;
        this.callbacks.onPortalWarp?.(portal);
        this.localFrame.updateMatrixWorld(true);
        this.camera.getWorldPosition(this._worldPos);
      }
    }

    const px = this._worldPos.x;
    const pz = this._worldPos.z;
    const rawGroundY = getTerrainHeight(px, pz);
    const groundY = Math.max(rawGroundY, col?.supportY ?? -Infinity);
    const horizDist = Math.hypot(this.localFrame.position.x - prevX, this.localFrame.position.z - prevZ);

    if (this.isInWater) {
      this.isGrounded = false;
      this.verticalVel *= Math.exp(-6 * dt);
      if (swimUp) {
        if (this.localFrame.position.y >= CONFIG.WATER_LEVEL - 0.55 && rawGroundY > CONFIG.WATER_LEVEL - 1.35) {
          this.verticalVel = CONFIG.JUMP_VELOCITY * 0.72;
        } else {
          this.localFrame.position.y += CONFIG.SWIM_VERTICAL_SPEED * dt;
        }
      }
      if (swimDown) {
        this.localFrame.position.y -= CONFIG.SWIM_VERTICAL_SPEED * dt;
      }
      this.localFrame.position.y += this.verticalVel * dt;

      const minY = rawGroundY + 0.15;
      const maxY = CONFIG.WATER_LEVEL - 0.42;
      if (this.localFrame.position.y < minY) this.localFrame.position.y = minY;
      if (this.localFrame.position.y > maxY && this.verticalVel <= 0.1) {
        this.localFrame.position.y = maxY;
      }

      if (horizDist > 0.001) {
        this.swimDistAccum += horizDist;
        if (this.swimDistAccum >= CONFIG.SWIM_STRIDE) {
          this.swimDistAccum -= CONFIG.SWIM_STRIDE;
          this.callbacks.onSwimStroke?.();
        }
      }
    } else {
      const prevVel = this.verticalVel;
      const wasGrounded = this.isGrounded;

      if (!this.isGrounded || this.localFrame.position.y > groundY + 0.02) {
        this.verticalVel -= CONFIG.GRAVITY * dt;
        this.localFrame.position.y += this.verticalVel * dt;
      }

      if (this.localFrame.position.y <= groundY) {
        this.localFrame.position.y = groundY;
        this.verticalVel = 0;
        this.isGrounded = true;
        if (!wasGrounded && prevVel < -2.0) {
          const surface = getSurfaceType(px, pz, this.localFrame.position.y);
          this.footstepCount++;
          this.callbacks.onFootstep?.(surface, 1.35);
        }
      } else {
        this.isGrounded = false;
      }

      const bw = getBiomeWeights(px, pz);
      if (bw.cave > 0.35) {
        const maxFootY = getCaveCeilingHeight(px, pz) - CONFIG.EYE_HEIGHT - 0.55;
        if (this.localFrame.position.y > maxFootY) {
          this.localFrame.position.y = maxFootY;
          if (this.verticalVel > 0) this.verticalVel = 0;
        }
      } else if (bw.liminal > 0.35) {
        const maxFootY = getLiminalCeilingHeight(px, pz) - CONFIG.EYE_HEIGHT - 0.35;
        if (this.localFrame.position.y > maxFootY) {
          this.localFrame.position.y = maxFootY;
          if (this.verticalVel > 0) this.verticalVel = 0;
        }
      }

      if (this.isGrounded && horizDist > 0.001) {
        this.stepDistAccum += horizDist;
        if (this.stepDistAccum >= CONFIG.STEP_STRIDE) {
          this.stepDistAccum %= CONFIG.STEP_STRIDE;
          const surface = getSurfaceType(px, pz, this.localFrame.position.y);
          this.footstepCount++;
          this.callbacks.onFootstep?.(surface, 1.0);
        }
      }
    }

    this._syncEnvironmentFlags(px, pz);
  }

  _updateDesktop(dt) {
    let moveFwd = 0;
    let moveRight = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) moveFwd += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) moveFwd -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) moveRight += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) moveRight -= 1;

    const swimUp = this.keys.has("Space");
    const swimDown = this.keys.has("KeyC") || this.keys.has("ControlLeft");

    if (moveFwd !== 0 || moveRight !== 0) {
      const sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? CONFIG.SPRINT_MULT : 1;
      const baseSpeed = this.isInWater ? CONFIG.SWIM_SPEED : CONFIG.MOVE_SPEED;
      const speed = baseSpeed * sprint;

      if (this.isInWater) {
        this.camera.getWorldDirection(this._camDir).normalize();
        this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        this._moveVec
          .set(0, 0, 0)
          .addScaledVector(this._camDir, moveFwd)
          .addScaledVector(this._right, moveRight)
          .normalize()
          .multiplyScalar(speed * dt);
        this.localFrame.position.add(this._moveVec);
      } else {
        this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        this._moveVec
          .set(0, 0, 0)
          .addScaledVector(this._fwd, moveFwd)
          .addScaledVector(this._right, moveRight)
          .normalize()
          .multiplyScalar(speed * dt);
        this.localFrame.position.x += this._moveVec.x;
        this.localFrame.position.z += this._moveVec.z;
      }
    }

    return { swimUp, swimDown };
  }

  _updateXR(dt) {
    const session = this.renderer.xr.getSession();
    if (!session) return { swimUp: false, swimDown: false };

    let leftStickX = 0;
    let leftStickY = 0;
    let hasLeftStick = false;
    let swimUp = false;
    let swimDown = false;
    let anyTrigger = false;

    // 1. Read buttons and apply right-stick snap turn FIRST so left-stick uses updated heading.
    for (const source of session.inputSources) {
      const gp = source.gamepad;
      if (!gp) continue;

      if (gp.buttons?.[0]?.pressed) anyTrigger = true;

      const axX = gp.axes && gp.axes.length >= 4 ? gp.axes[2] : gp.axes?.[0] ?? 0;
      const axY = gp.axes && gp.axes.length >= 4 ? gp.axes[3] : gp.axes?.[1] ?? 0;

      if (source.handedness === "left") {
        leftStickX = axX;
        leftStickY = axY;
        hasLeftStick = true;

        const gripPressed = Boolean(gp.buttons?.[1]?.pressed);
        if (gripPressed && !this.prevVrLeftGrip) {
          this.callbacks.onToggleVrMenu?.();
        }
        this.prevVrLeftGrip = gripPressed;

        swimDown = Boolean(gp.buttons?.[4]?.pressed); // Left X
        const yPressed = Boolean(gp.buttons?.[5]?.pressed);
        if (yPressed && !this.prevVrY) this.callbacks.onToggleNight?.();
        this.prevVrY = yPressed;
      } else if (source.handedness === "right") {
        if (!this.snapLatch && Math.abs(axX) > 0.65) {
          const step = THREE.MathUtils.degToRad(CONFIG.SNAP_TURN_DEG) * (axX > 0 ? -1 : 1);
          this._applyHeadPivotSnapTurn(step);
          this.snapLatch = true;
        } else if (this.snapLatch && Math.abs(axX) < 0.3) {
          this.snapLatch = false;
        }

        const rightGripPressed = Boolean(gp.buttons?.[1]?.pressed);
        if (rightGripPressed && !this.prevVrRightGrip) {
          this.callbacks.onToggleFlashlight?.();
        }
        this.prevVrRightGrip = rightGripPressed;

        const aPressed = Boolean(gp.buttons?.[4]?.pressed);
        if (aPressed && !this.prevVrA && !this.isInWater) this.triggerJump();
        swimUp = aPressed;
        this.prevVrA = aPressed;

        const bPressed = Boolean(gp.buttons?.[5]?.pressed);
        if (bPressed && !this.prevVrB) this.callbacks.onTriggerEvent?.();
        this.prevVrB = bPressed;
      }
    }

    if (anyTrigger && !this.prevVrTrigger && this.vrMenu?.isOpen) {
      this._vrTriggerClicked = true;
    }
    this.prevVrTrigger = anyTrigger;

    // 2. Apply left-stick movement along live world camera forward (after snap-turn + head look).
    if (hasLeftStick) {
      const mag = Math.hypot(leftStickX, leftStickY);
      if (mag > 0.18) {
        this.localFrame.updateMatrixWorld(true);
        this.camera.getWorldDirection(this._camDir).normalize();
        this._fwd.set(this._camDir.x, 0, this._camDir.z);
        if (this._fwd.lengthSq() < 1e-4) this._fwd.set(0, 0, -1);
        this._fwd.normalize();
        this._right.set(-this._fwd.z, 0, this._fwd.x);

        const speed = this.isInWater ? CONFIG.SWIM_SPEED : CONFIG.MOVE_SPEED;
        const fwdVec = this.isInWater ? this._camDir : this._fwd;
        this._moveVec
          .set(0, 0, 0)
          .addScaledVector(fwdVec, -leftStickY)
          .addScaledVector(this._right, leftStickX)
          .multiplyScalar(speed * dt);
        this.localFrame.position.add(this._moveVec);
      }
    }

    return { swimUp, swimDown };
  }
}
