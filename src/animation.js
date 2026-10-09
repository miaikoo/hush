import * as THREE from 'three';

// Small tween / timeline system driven by the main loop, plus reusable
// procedural animations (light flicker).

export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t * t * t,
};

class Tweens {
  constructor() {
    this.list = [];
  }

  // Returns a promise so sequences can be written with async/await.
  add({ duration, update, easing = ease.inOut, tag = null }) {
    return new Promise((resolve) => {
      this.list.push({ t: 0, duration, update, easing, resolve, tag });
    });
  }

  wait(seconds) {
    return this.add({ duration: seconds, update: () => {}, easing: ease.linear });
  }

  cancel(tag) {
    this.list = this.list.filter((tw) => tw.tag !== tag);
  }

  clear() {
    this.list.length = 0;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      tw.t = Math.min(tw.duration, tw.t + dt);
      const k = tw.duration > 0 ? tw.t / tw.duration : 1;
      tw.update(tw.easing(k));
      if (k >= 1) {
        this.list.splice(i, 1);
        tw.resolve();
      }
    }
  }
}

export const tweens = new Tweens();

// 1D value noise, used for organic light flicker.
function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

// A lamp = PointLight + emissive "bulb" materials that must stay in sync.
export class Lamp {
  constructor({ light, emissiveMaterials = [], baseIntensity, emissiveIntensity = 2.5, flicker = 0 }) {
    this.light = light;
    this.materials = emissiveMaterials;
    this.base = baseIntensity;
    this.emissiveBase = emissiveIntensity;
    this.flicker = flicker; // 0 = steady, 1 = constantly unstable
    this.on = false;
    this.level = 0; // smoothed 0..1
    this.burst = 0; // seconds of forced flicker (events)
    this.seed = Math.random() * 100;
    this.apply(0);
  }

  set(on) {
    this.on = on;
  }

  apply(k) {
    this.light.intensity = this.base * k;
    for (const m of this.materials) m.emissiveIntensity = this.emissiveBase * k;
  }

  update(dt, time, fearFlicker = 0) {
    const target = this.on ? 1 : 0;
    this.level += (target - this.level) * Math.min(1, dt * 18);
    let k = this.level;
    if (this.on) {
      const amount = Math.min(1, this.flicker + fearFlicker + (this.burst > 0 ? 0.9 : 0));
      if (amount > 0) {
        const n = noise1(time * 9 + this.seed);
        const n2 = noise1(time * 31 + this.seed * 3);
        // dips: mostly on, occasionally drops hard
        const dip = n < 0.35 * amount ? 0.05 + n2 * 0.25 : 1 - amount * 0.25 * n2;
        k *= dip;
      }
    }
    this.burst = Math.max(0, this.burst - dt);
    this.apply(k);
  }
}

// Builds an AnimationClip for a glTF node rotating between two quaternions.
// Used for the fuse box door (played through an AnimationMixer).
export function makeRotationClip(name, nodeName, fromQ, toQ, duration) {
  const steps = 6;
  const times = [], values = [];
  const q = new THREE.Quaternion();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // ease-out with a small overshoot for a "creaky" swing
    const k = t === 1 ? 1 : 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.06;
    q.copy(fromQ).slerp(toQ, k);
    times.push(t * duration);
    values.push(q.x, q.y, q.z, q.w);
  }
  const track = new THREE.QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, values);
  return new THREE.AnimationClip(name, duration, [track]);
}
