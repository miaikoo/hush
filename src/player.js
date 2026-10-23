import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EYE_HEIGHT, PLAYER_RADIUS, TUNING } from './config.js';

// First-person player. Scene graph:
//   head (Object3D, rotated by PointerLockControls: yaw + pitch)
//   └── camera (local offsets for head bob, sway, shake)
//       ├── flashlight (SpotLight) + its target
//       └── handModel (vintage flashlight, visible once picked up)

export class Player {
  constructor(camera, domElement, colliders) {
    this.camera = camera;
    this.colliders = colliders;

    this.head = new THREE.Object3D();
    this.head.name = 'player-head';
    this.head.add(camera);
    this.controls = new PointerLockControls(this.head, domElement);
    this.controls.pointerSpeed = 0.8;

    this.velocity = new THREE.Vector2();
    this.keys = new Set();
    this.canMove = true;
    this.bobPhase = 0;
    this.moving = 0;
    this.shake = 0;
    this.sway = 0; // fear-driven
    this.breathing = false;
    this.breathTime = 0;

    // Flashlight. Offset down/right of the eye so shadows are visible
    // from the player's point of view (a light exactly at the eye hides its own shadows).
    const spot = new THREE.SpotLight(0xffe2b8, 0, 16, 0.42, 0.45, 2);
    // at the lens tip, in front of the hand model; aimed to cross the view center ~2.5 m ahead
    spot.position.set(0.2, -0.2, -0.62);
    spot.target.position.set(0, 0, -2.5);
    spot.castShadow = true;
    spot.shadow.mapSize.set(512, 512); // re-rendered every frame (the light moves), so kept small
    spot.shadow.camera.near = 0.1;
    spot.shadow.camera.far = 16;
    spot.shadow.bias = -0.0006;
    spot.shadow.normalBias = 0.015;
    spot.shadow.radius = 2;
    camera.add(spot, spot.target);
    this.flashlight = spot;
    this.flashBase = 15;
    this.hasFlashlight = false;
    this.flashOn = false;
    this.battery = TUNING.battery.start;
    this.flashFlicker = 1;

    // Chrome on Windows occasionally reports a huge bogus mouse jump under pointer lock,
    // which snaps the camera. Drop impossible single-event jumps before the controls see them.
    window.addEventListener(
      'mousemove',
      (e) => {
        if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) e.stopImmediatePropagation();
      },
      { capture: true }
    );

    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  attachHandModel(model) {
    // The flashlight held in the right hand, as a child of the camera.
    this.hand = model;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    model.scale.setScalar(0.6);
    model.position.set(0.26, -0.3, -0.42);
    model.rotation.set(0.05, Math.PI - 0.1, 0); // the lens is at the model's +Z: turn it to face forward
    model.visible = false;
    this.camera.add(model);
  }

  // Raw (unaccelerated) mouse input avoids the Windows jump bug; fall back if unsupported.
  lock() {
    const el = this.controls.domElement;
    try {
      const p = el.requestPointerLock({ unadjustedMovement: true });
      if (p?.catch) p.catch(() => el.requestPointerLock()?.catch?.(() => {}));
    } catch {
      el.requestPointerLock();
    }
  }

  get position() {
    return this.head.position;
  }

  setPose(x, z, yaw, pitch = 0) {
    this.head.position.set(x, EYE_HEIGHT, z);
    this.head.rotation.set(pitch, yaw, 0, 'YXZ');
    this.velocity.set(0, 0);
  }

  get yaw() {
    return new THREE.Euler().setFromQuaternion(this.head.quaternion, 'YXZ').y;
  }

  forward(out = new THREE.Vector3()) {
    return this.camera.getWorldDirection(out);
  }

  resolveCollisions(p) {
    const r = PLAYER_RADIUS;
    for (let iter = 0; iter < 3; iter++) {
      for (const c of this.colliders) {
        if (!c.enabled) continue;
        const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
        const dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            p.x += (dx / d) * (r - d);
            p.z += (dz / d) * (r - d);
          } else {
            // center is inside the box: push out along the shallowest axis
            const pushes = [c.minX - r - p.x, c.maxX + r - p.x, c.minZ - r - p.z, c.maxZ + r - p.z];
            const i = pushes.reduce((best, v, j) => (Math.abs(v) < Math.abs(pushes[best]) ? j : best), 0);
            if (i < 2) p.x += pushes[i];
            else p.z += pushes[i];
          }
        }
      }
    }
  }

  update(dt, time) {
    // --- movement
    const k = this.keys;
    const input = new THREE.Vector2(
      (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0)
    );
    this.breathing = this.canMove && k.has('Space');
    const allowed = this.canMove && !this.breathing;
    if (!allowed) input.set(0, 0);
    if (input.lengthSq() > 1) input.normalize();

    const yaw = this.yaw;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    // camera forward on XZ is (-sin, -cos); right is (cos, -sin)
    const target = new THREE.Vector2(
      (input.x * cos - input.y * sin) * TUNING.walkSpeed,
      (-input.x * sin - input.y * cos) * TUNING.walkSpeed
    );
    this.velocity.lerp(target, Math.min(1, dt * 10));
    const p = this.head.position;
    p.x += this.velocity.x * dt;
    p.z += this.velocity.y * dt;
    this.resolveCollisions(p);

    // --- camera life: bob, breathing, fear sway, shake
    const speed = this.velocity.length();
    this.moving += ((speed > 0.2 ? 1 : 0) - this.moving) * Math.min(1, dt * 8);
    this.bobPhase += dt * speed * 4.2;
    this.breathTime = this.breathing ? this.breathTime + dt : 0;
    const breathBob = this.breathing ? Math.sin(time * 1.6) * 0.025 : 0;
    const cam = this.camera;
    cam.position.set(
      Math.cos(this.bobPhase * 0.5) * 0.025 * this.moving + Math.sin(time * 0.7) * 0.02 * this.sway,
      Math.sin(this.bobPhase) * 0.03 * this.moving + breathBob,
      0
    );
    const shake = this.shake;
    cam.rotation.set(
      Math.sin(time * 0.9) * 0.015 * this.sway + (Math.random() - 0.5) * shake * 0.04,
      (Math.random() - 0.5) * shake * 0.04,
      Math.sin(time * 0.53) * 0.035 * this.sway + (Math.random() - 0.5) * shake * 0.02
    );
    this.shake = Math.max(0, this.shake - dt * 1.5);

    // --- flashlight + battery
    if (this.flashOn) {
      this.battery = Math.max(0, this.battery - TUNING.battery.drain * dt);
      if (this.battery <= 0) this.flashOn = false;
    }
    let f = 1;
    if (this.battery < TUNING.battery.low) {
      // dying battery: stutters
      const n = Math.sin(time * 37) * Math.sin(time * 13.3);
      if (n > 0.6) f = 0.15;
      f *= 0.55 + (this.battery / TUNING.battery.low) * 0.45;
    }
    const targetI = this.flashOn ? this.flashBase * f * this.flashFlicker : 0;
    this.flashlight.intensity += (targetI - this.flashlight.intensity) * Math.min(1, dt * 25);
    if (this.hand) this.hand.visible = this.hasFlashlight && !this.handHidden;
  }

  toggleFlashlight() {
    if (!this.hasFlashlight) return false;
    if (!this.flashOn && this.battery <= 0) return false;
    this.flashOn = !this.flashOn;
    return true;
  }

  reset() {
    this.hasFlashlight = false;
    this.flashOn = false;
    this.battery = TUNING.battery.start;
    this.flashlight.intensity = 0;
    this.shake = 0;
    this.sway = 0;
    this.velocity.set(0, 0);
    this.keys.clear();
  }
}
