import * as THREE from 'three';
import { roomAt } from './config.js';
import { silhouetteTexture, softDotTexture } from './textures.js';
import { tweens, ease } from './animation.js';

// Things that exist only in the player's head.

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// ---------------------------------------------------------------- shadow figures

// A dark figure that appears at the edge of vision and fades away
// as soon as the player turns to look at it. Never in front, never jumps.
export class ShadowFigures {
  constructor(scene, occluders) {
    this.scene = scene;
    this.occluders = occluders;
    this.ray = new THREE.Raycaster();
    this.cooldown = 10;
    this.active = null;

    this.group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 1.85),
      new THREE.MeshBasicMaterial({ map: silhouetteTexture(), color: 0x000000, transparent: true, opacity: 0, depthWrite: false })
    );
    body.position.y = 0.92;
    // faint pale eyes: the only thing visible in a dark room
    const eyeMat = new THREE.SpriteMaterial({
      map: softDotTexture(),
      color: 0xd8e0ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const eyes = [-0.045, 0.045].map((x) => {
      const s = new THREE.Sprite(eyeMat);
      s.scale.setScalar(0.035);
      s.position.set(x, 1.68, 0.01);
      return s;
    });
    this.group.add(body, ...eyes);
    this.group.visible = false;
    this.body = body;
    this.eyeMat = eyeMat;
    scene.add(this.group);
  }

  trySpawn(player) {
    const head = player.position;
    const fwd = player.forward(_v).setY(0).normalize();
    // Horizontal half field of view from the vertical FOV and aspect ratio:
    // spawn just inside the edge of the screen, where peripheral vision is.
    const cam = player.camera;
    const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect);
    const maxAng = halfH - THREE.MathUtils.degToRad(5);
    const minAng = Math.max(THREE.MathUtils.degToRad(30), maxAng - THREE.MathUtils.degToRad(12));
    for (let i = 0; i < 8; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const ang = side * (minAng + Math.random() * (maxAng - minAng));
      const dir = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      const dist = 2.5 + Math.random() * 3.5;
      const p = head.clone().addScaledVector(dir, dist);
      if (!roomAt(p.x, p.z)) continue;
      // must be in line of sight (not inside/behind a wall)
      this.ray.set(head, dir);
      this.ray.far = dist + 0.5;
      if (this.ray.intersectObjects(this.occluders, false).length) continue;
      this.group.position.set(p.x, 0, p.z);
      this.group.lookAt(head.x, 0, head.z);
      this.group.visible = true;
      this.active = { age: 0, life: 4 + Math.random() * 4, fading: false, opacity: 0 };
      return true;
    }
    return false;
  }

  update(dt, player, fear) {
    if (!this.active) {
      if (fear < 50) return;
      this.cooldown -= dt * (0.5 + (fear - 50) / 50);
      if (this.cooldown <= 0) {
        this.cooldown = 8 + Math.random() * 10;
        this.trySpawn(player);
      }
      return;
    }
    const a = this.active;
    a.age += dt;
    // looked at? (angle between view direction and direction to the figure)
    const fwd = player.forward(_v);
    const to = _v2.copy(this.group.position).setY(1.4).sub(player.position).normalize();
    const looking = fwd.dot(to) > Math.cos(THREE.MathUtils.degToRad(22));
    if (looking || a.age > a.life || fear < 40) a.fading = true;
    const target = a.fading ? 0 : 0.88;
    a.opacity += (target - a.opacity) * Math.min(1, dt * (a.fading ? 6 : 1.5));
    this.body.material.opacity = a.opacity;
    this.eyeMat.opacity = a.opacity * 0.9;
    if (a.fading && a.opacity < 0.02) this.clear();
  }

  clear() {
    this.active = null;
    this.group.visible = false;
    this.body.material.opacity = 0;
    this.eyeMat.opacity = 0;
  }
}

// ---------------------------------------------------------------- off-screen shifts

// Objects that change pose only while they are outside the camera frustum.
// Uses the camera's projection to know what the player can and cannot see.
export class Shifters {
  constructor(camera) {
    this.camera = camera;
    this.frustum = new THREE.Frustum();
    this.matrix = new THREE.Matrix4();
    this.items = [];
    this.box = new THREE.Box3();
  }

  add(object, apply, restore) {
    this.items.push({ object, apply, restore, shifted: false });
  }

  update(fear) {
    this.camera.updateMatrixWorld();
    this.matrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix);
    for (const it of this.items) {
      this.box.setFromObject(it.object);
      if (this.frustum.intersectsBox(this.box)) continue; // seen: never move while watched
      const want = fear >= 50;
      if (want && !it.shifted && Math.random() < 0.004) {
        it.apply();
        it.shifted = true;
      } else if (!want && it.shifted && Math.random() < 0.01) {
        it.restore();
        it.shifted = false;
      }
    }
  }

  reset() {
    for (const it of this.items) {
      if (it.shifted) it.restore();
      it.shifted = false;
    }
  }
}

// ---------------------------------------------------------------- random events

// Every 20–40 s, picks an unsettling event weighted by the current fear tier.
export class EventDirector {
  constructor(events, gap) {
    this.events = events; // [{ name, minTier, weight, run }]
    this.gap = gap;
    this.timer = 25;
  }

  update(dt, tier, ctx) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.gap.min + Math.random() * (this.gap.max - this.gap.min);
    const pool = this.events.filter((e) => tier >= e.minTier && (!e.when || e.when(ctx)));
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    for (const e of pool) {
      r -= e.weight;
      if (r <= 0) {
        e.run(ctx);
        return e.name;
      }
    }
    return null;
  }

  reset() {
    this.timer = 25;
  }
}

// Fades a mesh's dissolve uniform from 0 to 1, then calls done.
export function dissolve(material, duration = 1.2) {
  const u = material.userData.dissolve;
  return tweens.add({ duration, easing: ease.in, update: (k) => (u.value = k) });
}
