import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { softDotTexture } from './textures.js';

// ---------------------------------------------------------------- post-processing

// Full-screen fear shader. It also does the tone mapping + sRGB conversion that a
// separate OutputPass used to do, which saves a whole full-screen pass per frame.
const FearShader = {
  uniforms: {
    tDiffuse: { value: null },
    uFear: { value: 0 }, // 0..1
    uTime: { value: 0 },
    uPulse: { value: 0 }, // heartbeat 0..1
    uDim: { value: 0 }, // darken for inspect / menus
    uFade: { value: 0 }, // fade to black
    uWhite: { value: 0 }, // fade to white (escape)
    uBreath: { value: 0 }, // calm while breathing
    uAspect: { value: 1 },
    toneMappingExposure: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uFear, uTime, uPulse, uDim, uFade, uWhite, uBreath, uAspect;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      float fear = uFear;
      float panic = smoothstep(0.75, 1.0, fear);
      float disturbed = smoothstep(0.5, 0.8, fear);
      vec2 uv = vUv;
      vec2 c = uv - 0.5;

      // panic: the image breathes / warps slightly toward the edges
      float warp = panic * 0.012 * sin(uTime * 1.3 + length(c) * 9.0);
      uv += c * warp;

      // chromatic aberration grows with fear (and kicks on heartbeats)
      float ca = (disturbed * 0.004 + panic * 0.01) * (1.0 + uPulse * 1.5);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;

      // tone mapping + sRGB output: three.js injects toneMapping() and
      // linearToOutputTexel() into ShaderMaterials rendered to the screen
      #ifdef TONE_MAPPING
      col = toneMapping(col);
      #endif
      col = linearToOutputTexel(vec4(col, 1.0)).rgb;

      // drain color
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l), smoothstep(0.3, 0.9, fear) * 0.75 * (1.0 - uBreath * 0.5));

      // vignette closes in
      vec2 vc = c * vec2(uAspect, 1.0);
      float r = length(vc);
      float inner = mix(0.75, 0.18, fear) - uPulse * 0.05 * disturbed + uBreath * 0.1;
      float vig = smoothstep(inner + 0.55, inner, r);
      col *= mix(1.0, vig, 0.35 + fear * 0.65);

      // film grain
      float g = hash(vUv * 1000.0 + fract(uTime) * 100.0) - 0.5;
      col += g * (0.035 + fear * 0.07);

      col *= 1.0 - uDim * 0.65;
      col = mix(col, vec3(0.0), uFade);
      col = mix(col, vec3(1.0, 0.98, 0.95), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPostProcessing(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const fear = new ShaderPass(FearShader); // also does tone mapping + sRGB (see the shader)
  composer.addPass(fear);
  const resize = () => {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);
    fear.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
  };
  resize();
  return { composer, fear: fear.uniforms, resize };
}

// ---------------------------------------------------------------- dust

// Floating dust around the player. Each particle is lit only if it lies
// inside the flashlight cone (the cone test runs in the vertex shader),
// so the beam looks volumetric without any real volumetrics.
export class Dust {
  constructor(count = 1200, size = 7) {
    this.size = size;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * size;
      pos[i * 3 + 1] = Math.random() * 3;
      pos[i * 3 + 2] = Math.random() * size;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.uniforms = {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uBox: { value: size },
      uLightPos: { value: new THREE.Vector3() },
      uLightDir: { value: new THREE.Vector3(0, 0, -1) },
      uLightOn: { value: 0 },
      uCosOuter: { value: Math.cos(0.42) },
      uAmbient: { value: 0 },
      uMap: { value: softDotTexture() },
      uPixelRatio: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime, uBox, uLightOn, uCosOuter, uAmbient, uPixelRatio;
        uniform vec3 uCenter, uLightPos, uLightDir;
        varying float vBright;
        void main() {
          // drift, then wrap into a box that follows the player
          vec3 p = position + vec3(sin(uTime * 0.13 + aSeed * 30.0) * 0.3, -uTime * 0.025 * (0.5 + aSeed), cos(uTime * 0.11 + aSeed * 20.0) * 0.3);
          p.xz = mod(p.xz - uCenter.xz + uBox * 0.5, uBox) + uCenter.xz - uBox * 0.5;
          p.y = mod(p.y, 3.0);
          vec3 L = p - uLightPos;
          float d = length(L);
          float cone = smoothstep(uCosOuter, uCosOuter + 0.08, dot(L / d, uLightDir));
          vBright = cone * uLightOn / (1.0 + d * d * 0.35) + uAmbient;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (0.012 + aSeed * 0.012) * 900.0 * uPixelRatio / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vBright;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a;
          gl_FragColor = vec4(vec3(1.0, 0.92, 0.8) * vBright * a * 0.5, 1.0);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  update(time, center, flashlight, ambient) {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uCenter.value.copy(center);
    flashlight.getWorldPosition(u.uLightPos.value);
    const t = flashlight.target.getWorldPosition(new THREE.Vector3());
    u.uLightDir.value.copy(t).sub(u.uLightPos.value).normalize();
    u.uLightOn.value = Math.min(1, flashlight.intensity / 20);
    u.uAmbient.value = ambient;
  }
}

// ---------------------------------------------------------------- sparks

export class Sparks {
  constructor(max = 80) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffc070,
        size: 0.03,
        map: softDotTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.points.frustumCulled = false;
  }

  burst(origin, normal, n = 60) {
    for (let i = 0; i < Math.min(n, this.max); i++) {
      this.pos.set([origin.x, origin.y, origin.z], i * 3);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5)
        .multiplyScalar(2)
        .addScaledVector(normal, 1.5 + Math.random() * 1.5);
      this.vel.set([v.x, v.y, v.z], i * 3);
      this.life[i] = 0.4 + Math.random() * 0.6;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -100;
        continue;
      }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 9.8 * dt;
      for (let a = 0; a < 3; a++) this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      if (this.pos[i * 3 + 1] < 0.01) {
        this.pos[i * 3 + 1] = 0.01;
        this.vel[i * 3 + 1] *= -0.3;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- dissolve

// Patches a MeshStandardMaterial so it can dissolve away with a glowing edge.
// Drive it with material.userData.dissolve.value from 0 (solid) to 1 (gone).
export function makeDissolvable(material) {
  const uniform = { value: 0 };
  material.userData.dissolve = uniform;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDissolve = uniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDissolvePos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDissolvePos = position * 60.0;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vDissolvePos;
        uniform float uDissolve;
        float dHash(vec3 p) { return fract(sin(dot(p, vec3(17.1, 113.7, 41.3))) * 43758.5453); }
        float dNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(dHash(i), dHash(i + vec3(1,0,0)), f.x), mix(dHash(i + vec3(0,1,0)), dHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(dHash(i + vec3(0,0,1)), dHash(i + vec3(1,0,1)), f.x), mix(dHash(i + vec3(0,1,1)), dHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float dn = dNoise(vDissolvePos);
        if (dn < uDissolve) discard;
        float edge = 1.0 - smoothstep(0.0, 0.08, dn - uDissolve);
        totalEmissiveRadiance += edge * step(0.001, uDissolve) * vec3(1.0, 0.45, 0.15) * 4.0;`
      );
  };
  material.customProgramCacheKey = () => 'dissolve';
  return uniform;
}
