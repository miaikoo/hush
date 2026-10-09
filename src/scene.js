import * as THREE from 'three';

// Renderer, scene, fog, environment and the base ("always on") lights.

export function createRenderer(container) {
  // No MSAA: post-processing renders to its own targets, so canvas antialiasing would be wasted.
  // Pixel ratio starts at 1 and is adapted to the frame rate in main.js.
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

export const FOG_COLOR = new THREE.Color(0x040507);
export const FOG_BASE_DENSITY = 0.085;

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = FOG_COLOR.clone();
  // Exponential-squared fog: thin near the player, closes in quickly with distance.
  scene.fog = new THREE.FogExp2(FOG_COLOR.clone(), FOG_BASE_DENSITY);
  return scene;
}

export function applyEnvironment(renderer, scene, hdrTexture) {
  // Pre-filter the HDR into a PMREM so PBR materials can sample blurred
  // reflections by roughness. Kept very dim: it only exists so metal reads as metal.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(hdrTexture).texture;
  hdrTexture.dispose();
  pmrem.dispose();
  scene.environment = envMap;
  scene.environmentIntensity = 0.12;
}

export function createBaseLights(scene) {
  // Very low cold sky / warm ground fill so pure black areas still have form.
  const hemi = new THREE.HemisphereLight(0x4a5a80, 0x24180f, 0.35);
  scene.add(hemi);

  // Moonlight: a SpotLight outside the foyer window. A spot (instead of a
  // directional light) keeps the light inside its cone, so it can't leak
  // into other rooms. Walls cast shadows, so only the window shape gets through.
  const moon = new THREE.SpotLight(0x9fb4e0, 650, 18, 0.42, 0.6, 2);
  moon.position.set(-8.5, 4.6, 4.2);
  moon.target.position.set(0.5, 0, 5.4);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.near = 2;
  moon.shadow.camera.far = 16;
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.02;
  moon.shadow.radius = 3;
  // Nothing the moonlight touches moves, so its shadow map is rendered once,
  // not every frame (game.js refreshes it during the ending, when the front door opens).
  moon.shadow.autoUpdate = false;
  moon.shadow.needsUpdate = true;
  scene.add(moon, moon.target);

  return { hemi, moon };
}
