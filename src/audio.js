import * as THREE from 'three';

// Procedural sound. Every buffer is synthesized sample-by-sample at startup,
// then played through Three.js audio (AudioListener on the camera,
// PositionalAudio for sounds that live somewhere in the house).

class Biquad {
  constructor(type, freq, q, sr) {
    const w = (2 * Math.PI * freq) / sr, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lowpass') {
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0;
    } else if (type === 'highpass') {
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0;
    } else {
      b0 = alpha; b1 = 0; b2 = -alpha; // bandpass
    }
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
    Object.assign(this, { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, x1: 0, x2: 0, y1: 0, y2: 0 });
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

const TAU = Math.PI * 2;
const rand = () => Math.random() * 2 - 1;

function normalize(d, peak = 0.9) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
}

// Smooth loop seam: crossfade the last part into the beginning.
function loopify(d, sr, fade = 0.15) {
  const n = Math.floor(fade * sr);
  for (let i = 0; i < n; i++) {
    const k = i / n;
    d[i] = d[i] * k + d[d.length - n + i] * (1 - k);
  }
  return d.subarray(0, d.length - n);
}

const SYNTHS = {
  drone(sr) {
    const d = new Float32Array(sr * 10);
    const lp = new Biquad('lowpass', 180, 0.7, sr);
    let brown = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      brown = (brown + rand() * 0.02) * 0.995;
      const swell = 0.6 + 0.4 * Math.sin(TAU * t * 0.1);
      d[i] = lp.process(brown * 3) * swell + Math.sin(TAU * 43 * t) * 0.25 + Math.sin(TAU * 64.5 * t + Math.sin(t)) * 0.12 * swell;
    }
    normalize(d, 0.7);
    return loopify(d, sr, 1.5);
  },
  heartbeat(sr) {
    const d = new Float32Array(Math.floor(sr * 0.7));
    const thump = (start, amp) => {
      for (let i = 0; i < sr * 0.18; i++) {
        const t = i / sr;
        const f = 55 - t * 120;
        const j = Math.floor(start * sr) + i;
        if (j < d.length) d[j] += Math.sin(TAU * f * t) * Math.exp(-t * 22) * amp;
      }
    };
    thump(0, 1);
    thump(0.22, 0.7);
    normalize(d, 0.95);
    return d;
  },
  breath(sr) {
    const d = new Float32Array(sr * 5);
    const bp = new Biquad('bandpass', 900, 0.6, sr);
    const lp = new Biquad('lowpass', 2500, 0.7, sr);
    for (let i = 0; i < d.length; i++) {
      const t = (i / sr) % 5;
      // inhale 0-2s, hold, exhale 2.6-4.8s (slow, calming)
      const env = t < 2 ? Math.sin((t / 2) * Math.PI) * 0.6 : t > 2.6 && t < 4.8 ? Math.sin(((t - 2.6) / 2.2) * Math.PI) : 0;
      d[i] = lp.process(bp.process(rand())) * env;
    }
    normalize(d, 0.6);
    return d;
  },
  creak(sr) {
    const d = new Float32Array(Math.floor(sr * 1.8));
    const bp = new Biquad('bandpass', 700, 3, sr);
    const bp2 = new Biquad('bandpass', 1400, 4, sr);
    let phase = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const f = 70 + Math.sin(t * 3.1) * 25 + Math.sin(t * 11.7) * 12;
      phase += f / sr;
      const stick = Math.pow(Math.max(0, Math.sin(phase * TAU)), 12); // stick-slip pulses
      const env = Math.sin(Math.min(1, t / 1.8) * Math.PI);
      const x = stick * (0.8 + 0.2 * rand());
      d[i] = (bp.process(x) + bp2.process(x) * 0.6) * env;
    }
    normalize(d, 0.8);
    return d;
  },
  rattle(sr) {
    const d = new Float32Array(Math.floor(sr * 0.5));
    const bp = new Biquad('bandpass', 1800, 2, sr);
    for (let k = 0; k < 6; k++) {
      const start = Math.floor((k * 0.07 + Math.random() * 0.02) * sr);
      for (let i = 0; i < sr * 0.04; i++) {
        if (start + i < d.length) d[start + i] += rand() * Math.exp(-i / (sr * 0.006));
      }
    }
    for (let i = 0; i < d.length; i++) d[i] = bp.process(d[i]) + d[i] * 0.2;
    normalize(d, 0.8);
    return d;
  },
  musicbox(sr) {
    // A slightly detuned lullaby. Each note: fast attack, metallic partials, long decay.
    const notes = [76, 72, 69, 72, 76, 74, 71, 68, 69, 72, 76, 81, 79, 76, 74, 72];
    const step = 0.55;
    const d = new Float32Array(Math.floor(sr * (notes.length * step + 1.5)));
    notes.forEach((n, k) => {
      const f = 440 * Math.pow(2, (n - 69) / 12) * (1 + (Math.random() - 0.5) * 0.012);
      const start = Math.floor(k * step * sr);
      for (let i = 0; i < sr * 1.6 && start + i < d.length; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 3.2);
        d[start + i] += (Math.sin(TAU * f * t) + 0.4 * Math.sin(TAU * f * 2.01 * t) * Math.exp(-t * 6) + 0.2 * Math.sin(TAU * f * 3.98 * t) * Math.exp(-t * 9)) * env;
      }
    });
    normalize(d, 0.7);
    return d;
  },
  radio(sr) {
    const d = new Float32Array(sr * 12);
    const bp = new Biquad('bandpass', 2200, 0.8, sr);
    const chords = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const ch = chords[Math.floor(t / 3) % 4];
      const local = (t % 3) / 3;
      const env = Math.sin(local * Math.PI) * 0.8 + 0.2;
      let s = 0;
      for (const n of ch) {
        const f = 440 * Math.pow(2, (n - 69) / 12);
        s += Math.sin(TAU * f * t + Math.sin(TAU * 5 * t) * 0.3) * 0.3;
      }
      const crackle = Math.random() < 0.0008 ? rand() * 2 : 0;
      d[i] = s * env * 0.6 + bp.process(rand()) * 0.08 + crackle;
    }
    // band-limit like a small speaker
    const hp = new Biquad('highpass', 300, 0.7, sr), lp = new Biquad('lowpass', 3000, 0.7, sr);
    for (let i = 0; i < d.length; i++) d[i] = lp.process(hp.process(d[i]));
    normalize(d, 0.6);
    return loopify(d, sr, 0.5);
  },
  hum(sr) {
    const d = new Float32Array(sr * 2);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = Math.sin(TAU * 50 * t) * 0.5 + Math.sin(TAU * 100 * t) * 0.3 + Math.sin(TAU * 150 * t) * 0.12 + rand() * 0.03;
    }
    normalize(d, 0.5);
    return d;
  },
  spark(sr) {
    const d = new Float32Array(Math.floor(sr * 0.8));
    const hp = new Biquad('highpass', 1500, 0.7, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const pop = Math.random() < 0.004 * Math.exp(-t * 4) ? 1 : 0;
      d[i] = hp.process(rand() * (0.15 + pop * 4)) * Math.exp(-t * 4);
    }
    normalize(d, 0.8);
    return d;
  },
  click(sr) {
    const d = new Float32Array(Math.floor(sr * 0.08));
    const bp = new Biquad('bandpass', 3000, 2, sr);
    for (let i = 0; i < d.length; i++) d[i] = bp.process(rand()) * Math.exp(-i / (sr * 0.004));
    normalize(d, 0.6);
    return d;
  },
  pickup(sr) {
    const d = new Float32Array(Math.floor(sr * 0.3));
    const bp = new Biquad('bandpass', 1200, 1, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = bp.process(rand()) * Math.exp(-t * 20) * 0.6 + Math.sin(TAU * 2400 * t) * Math.exp(-t * 30) * 0.15;
    }
    normalize(d, 0.6);
    return d;
  },
  paper(sr) {
    const d = new Float32Array(Math.floor(sr * 0.45));
    const bp = new Biquad('bandpass', 3500, 0.8, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const grit = 0.4 + 0.6 * Math.abs(Math.sin(t * 60) * Math.sin(t * 23));
      d[i] = bp.process(rand()) * grit * Math.sin((t / 0.45) * Math.PI);
    }
    normalize(d, 0.5);
    return d;
  },
  whisper(sr) {
    const d = new Float32Array(Math.floor(sr * 2.6));
    const formants = [new Biquad('bandpass', 700, 6, sr), new Biquad('bandpass', 1200, 6, sr), new Biquad('bandpass', 2600, 6, sr)];
    let syll = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      syll = 0.5 + 0.5 * Math.sin(t * 13 + Math.sin(t * 5) * 2);
      const env = Math.sin((t / 2.6) * Math.PI) * syll;
      const n = rand();
      d[i] = (formants[0].process(n) + formants[1].process(n) * 0.8 + formants[2].process(n) * 0.5) * env;
    }
    normalize(d, 0.7);
    return d;
  },
  footstepsAbove(sr) {
    const d = new Float32Array(sr * 3);
    const lp = new Biquad('lowpass', 160, 0.8, sr);
    const times = [0.1, 0.75, 1.35, 2.0, 2.55];
    for (const st of times) {
      const s = Math.floor(st * sr);
      for (let i = 0; i < sr * 0.15; i++) {
        const t = i / sr;
        if (s + i < d.length) d[s + i] += (Math.sin(TAU * 60 * t) + rand() * 0.6) * Math.exp(-t * 30);
      }
    }
    for (let i = 0; i < d.length; i++) d[i] = lp.process(d[i]);
    normalize(d, 0.8);
    return d;
  },
  step(sr) {
    const d = new Float32Array(Math.floor(sr * 0.16));
    const lp = new Biquad('lowpass', 500, 0.8, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = lp.process(rand() + Math.sin(TAU * 90 * t)) * Math.exp(-t * 35);
    }
    normalize(d, 0.5);
    return d;
  },
  tick(sr) {
    // tick ... tock (1 s each)
    const d = new Float32Array(sr * 2);
    const bp1 = new Biquad('bandpass', 2600, 6, sr), bp2 = new Biquad('bandpass', 1900, 6, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const a = t < 0.03 ? rand() * Math.exp(-t * 300) : 0;
      const b = t > 1 && t < 1.03 ? rand() * Math.exp(-(t - 1) * 300) : 0;
      d[i] = bp1.process(a) + bp2.process(b);
    }
    normalize(d, 0.5);
    return d;
  },
  unlock(sr) {
    const d = new Float32Array(Math.floor(sr * 0.6));
    const bp = new Biquad('bandpass', 2400, 3, sr);
    for (const st of [0, 0.18]) {
      const s = Math.floor(st * sr);
      for (let i = 0; i < sr * 0.05; i++) d[s + i] += rand() * Math.exp(-i / (sr * 0.005));
    }
    for (let i = 0; i < d.length; i++) d[i] = bp.process(d[i]) + Math.sin(TAU * 1800 * (i / sr)) * Math.exp(-(i / sr) * 25) * 0.2;
    normalize(d, 0.8);
    return d;
  },
  ringing(sr) {
    const d = new Float32Array(sr * 3);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = Math.sin(TAU * 6200 * t) * 0.5 + Math.sin(TAU * 6213 * t) * 0.5;
    }
    normalize(d, 0.3);
    return d;
  },
  impact(sr) {
    const d = new Float32Array(sr * 3);
    const lp = new Biquad('lowpass', 120, 0.7, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = lp.process(rand() * Math.exp(-t * 3) + Math.sin(TAU * (40 - t * 8) * t) * Math.exp(-t * 1.2));
    }
    normalize(d, 0.95);
    return d;
  },
  chime(sr) {
    const d = new Float32Array(sr * 5);
    for (const [st, f] of [[0, 196], [1.4, 196], [2.8, 196]]) {
      const s = Math.floor(st * sr);
      for (let i = 0; s + i < d.length; i++) {
        const t = i / sr;
        d[s + i] += (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2.76 * t) + 0.25 * Math.sin(TAU * f * 5.4 * t)) * Math.exp(-t * 1.4);
      }
    }
    normalize(d, 0.6);
    return d;
  },
};

export class Sound {
  constructor(camera, scene) {
    this.scene = scene;
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;
    this.buffers = {};
    this.ready = false;
    this.loops = {};
    this.heartTimer = 0;
  }

  // Must run after a user gesture (browser autoplay rules).
  async init() {
    if (this.ready) return;
    await this.ctx.resume();
    const sr = this.ctx.sampleRate;
    for (const [name, fn] of Object.entries(SYNTHS)) {
      const data = fn(sr);
      const b = this.ctx.createBuffer(1, data.length, sr);
      b.copyToChannel(data, 0);
      this.buffers[name] = b;
    }
    this.ready = true;

    this.loops.drone = this.makeGlobal('drone', true, 0.3);
    this.loops.breath = this.makeGlobal('breath', true, 0);
    this.loops.ringing = this.makeGlobal('ringing', true, 0);
    for (const l of Object.values(this.loops)) l.play();
    this.levels = { drone: 0.3, breath: 0, ringing: 0 };

    // One-shot emitters are created once and reused. Creating audio nodes on demand
    // (especially 3D HRTF panners) stalls the main thread, and finished nodes that are
    // never disconnected pile up in the audio graph.
    this.globalPool = Array.from({ length: 6 }, () => new THREE.Audio(this.listener));
    this.spatialPool = Array.from({ length: 6 }, () => {
      const holder = new THREE.Object3D();
      const a = new THREE.PositionalAudio(this.listener);
      a.setRolloffFactor(1.4);
      holder.add(a);
      this.scene.add(holder);
      return { holder, a };
    });
    this.nextGlobal = 0;
    this.nextSpatial = 0;
  }

  makeGlobal(name, loop, volume) {
    const a = new THREE.Audio(this.listener);
    a.setBuffer(this.buffers[name]);
    a.setLoop(loop);
    a.setVolume(volume);
    return a;
  }

  // A looping sound attached to an object in the world (radio, music box, hum...).
  attachLoop(name, object, { volume = 1, ref = 1, play = false } = {}) {
    const a = new THREE.PositionalAudio(this.listener);
    a.setRefDistance(ref);
    a.setRolloffFactor(1.4);
    a.setVolume(volume);
    a.setLoop(true);
    object.add(a);
    const handle = {
      audio: a,
      name,
      start: () => {
        if (!this.ready || a.isPlaying) return;
        a.setBuffer(this.buffers[name]);
        a.play();
      },
      stop: () => a.isPlaying && a.stop(),
    };
    if (play) handle.start();
    return handle;
  }

  // One-shot. `at` = Vector3 for a positional sound, omit for a global one.
  play(name, { volume = 1, at = null, rate = 1, ref = 1.2 } = {}) {
    if (!this.ready) return;
    let a;
    if (at) {
      const slot = this.spatialPool[this.nextSpatial++ % this.spatialPool.length];
      slot.holder.position.copy(at);
      slot.holder.updateMatrixWorld();
      a = slot.a;
      a.setRefDistance(ref);
    } else {
      a = this.globalPool[this.nextGlobal++ % this.globalPool.length];
    }
    if (a.isPlaying) a.stop(); // pool exhausted: reuse the oldest emitter
    a.setBuffer(this.buffers[name]);
    a.setVolume(volume);
    a.setPlaybackRate(rate);
    a.play();
    return a;
  }

  // Volume changes go through Web Audio automation; only schedule one when it changed.
  setLevel(name, target, dt) {
    const cur = this.levels[name];
    const next = cur + (target - cur) * Math.min(1, dt * 2);
    if (Math.abs(next - cur) < 0.004 && Math.abs(target - cur) < 0.004) return;
    this.levels[name] = next;
    const g = this.loops[name].gain.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setValueAtTime(next, this.ctx.currentTime);
  }

  update(dt, { fear, breathing, playing }) {
    if (!this.ready) return;
    const f = fear / 100;
    this.setLevel('drone', playing ? 0.18 + f * 0.55 : 0.08, dt);
    this.setLevel('breath', playing && breathing ? 0.7 : 0, dt);
    this.setLevel('ringing', playing ? Math.max(0, (f - 0.8) * 0.5) : 0, dt);

    // Heartbeat: audible above ~35 fear, faster as fear rises.
    if (playing && f > 0.35) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        this.heartTimer = 1.15 - f * 0.7;
        this.play('heartbeat', { volume: (f - 0.3) * 1.3 });
        this.onBeat?.();
      }
    }
  }
}
