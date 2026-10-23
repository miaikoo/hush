import * as THREE from 'three';
import { createRenderer, createScene, createBaseLights, applyEnvironment } from './scene.js';
import { loadAssets, cloneModel } from './assets.js';
import { buildHouse } from './house.js';
import { buildProps } from './props.js';
import { Player } from './player.js';
import { Interaction, Inspector } from './interaction.js';
import { createPostProcessing, Dust, Sparks, makeDissolvable } from './effects.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { Game } from './game.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

const ui = new UI(document.getElementById('ui'));
const renderer = createRenderer(document.getElementById('app'));
const scene = createScene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 60);
const baseLights = createBaseLights(scene);

const assets = await loadAssets(renderer, (p) => ui.setLoading(p * 0.85));
applyEnvironment(renderer, scene, assets.hdr);

const house = buildHouse(assets.textures);
scene.add(house.group);
const world = buildProps({ models: assets.models, textures: assets.textures, houseMats: house.mats });
scene.add(world.group);

const player = new Player(camera, renderer.domElement, [...house.colliders, ...world.colliders]);
scene.add(player.head);
player.attachHandModel(cloneModel(assets.models.vintage_flashlight));

const interaction = new Interaction(camera, house.occluders);
const inspector = new Inspector(camera);
const post = createPostProcessing(renderer, scene, camera);
const dust = new Dust();
scene.add(dust.points);
const sparks = new Sparks();
scene.add(sparks.points);
const sound = new Sound(camera, scene);

const game = new Game({ scene, camera, renderer, world, house, player, interaction, inspector, ui, sound, post, dust, sparks, baseLights });
game.debug = DEBUG;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.resize();
});

// Warm-up. Without it, the first look at each object freezes the game while its
// shaders compile and its textures upload to the GPU. Compiling ~50 shader programs
// takes several seconds (Chrome on Windows translates each to Direct3D), so it runs
// in the background while the title screen is up: the title's background is opaque,
// and its buttons wait until the house is ready.
// Checking every shader for compile errors forces each one to finish compiling on
// the spot (a synchronous stall); the deployed game skips that, debug mode keeps it.
renderer.debug.checkShaderErrors = DEBUG;
let titleButtons = null;
if (!DEBUG) {
  // show the title (with its buttons waiting) and let it paint before compiling starts
  ui.show('title');
  titleButtons = [...document.querySelectorAll('#title button')].map((b) => {
    const label = b.textContent;
    b.disabled = true;
    b.textContent = 'Preparing the house…';
    return { b, label };
  });
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}
const ready = (async () => {
  await renderer.compileAsync(scene, camera);
  await warmUp();
})();

async function warmUp() {
  // 1. upload every texture now
  scene.traverse((o) => {
    if (!o.material) return;
    for (const m of [].concat(o.material)) {
      for (const v of Object.values(m)) if (v?.isTexture) renderer.initTexture(v);
    }
  });
  // 2. temporarily show everything that starts hidden, plus a dissolving key
  const hidden = [];
  scene.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
  });
  const key = world.makeKey();
  makeDissolvable(key.children[0].material);
  key.traverse((o) => o.isMesh && (o.material = key.children[0].material));
  key.position.set(0, 0, -0.6);
  camera.add(key);
  // 3. render every room from four directions (all shadow passes + post-processing)
  const views = [[0, 5], [0, 2.5], [-3, 0], [3, 0], [-3, -4.5], [2.5, -4]];
  let n = 0;
  for (const [x, z] of views) {
    for (let k = 0; k < 4; k++) {
      player.setPose(x, z, (k * Math.PI) / 2);
      post.composer.render(0.016);
      ui.setLoading(0.85 + (0.15 * ++n) / (views.length * 4));
      await new Promise((r) => requestAnimationFrame(r)); // keep the page responsive
    }
  }
  camera.remove(key);
  for (const o of hidden) o.visible = false;
  baseLights.moon.shadow.needsUpdate = true; // redraw the static moon shadow without the warm-up extras
  game.resetWorld();
}

if (DEBUG) {
  await ready;
  setupDebug();
} else {
  ready.then(() => {
    for (const { b, label } of titleButtons) {
      b.disabled = false;
      b.textContent = label;
    }
  });
}

// Adaptive resolution: if the frame rate drops, render fewer pixels;
// raise it back when there's headroom. Toggle the FPS readout with the ` key.
// Changing resolution reallocates render targets (a small hitch itself), so it only reacts to
// sustained low frame rates: two slow windows in a row, never in the first seconds of play.
const quality = { ratio: renderer.getPixelRatio(), min: 0.5, max: Math.min(window.devicePixelRatio, 1), frames: 0, time: 0, holdUp: 0, fps: 0, slow: 0, playTime: 0 };
const fpsLabel = Object.assign(document.createElement('div'), { className: 'fps' });
document.body.appendChild(fpsLabel);
window.addEventListener('keydown', (e) => e.code === 'Backquote' && fpsLabel.classList.toggle('show'));

// Which GPU is the browser really using? "SwiftShader" / "Basic Render" = no hardware acceleration.
const gpuName = (() => {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const raw = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return String(raw).replace(/^ANGLE \((.*)\)$/, '$1').split(',').slice(0, 2).join(',');
})();
const software = /swiftshader|basic render|llvmpipe|software/i.test(gpuName);
if (software) {
  document.querySelector('#title .small:last-child').innerHTML =
    '<b style="color:#c43a30">Hardware acceleration is off — the game is rendering on the CPU.</b><br>Enable it in your browser settings (System → "Use graphics acceleration") and restart the browser.';
}
// Built-in (integrated) GPUs start at a lower resolution instead of stuttering for
// the ~9 s the adaptive logic needs to notice; it still climbs back up if there's headroom.
const integrated = /intel|uhd|iris|radeon\(tm\) graphics|radeon graphics|vega|7[68]0m|mali|adreno/i.test(gpuName);
if (software || integrated) {
  quality.ratio = Math.max(quality.min, Math.min(quality.max, software ? 0.5 : 0.75));
  renderer.setPixelRatio(quality.ratio);
  post.resize();
  dust.uniforms.uPixelRatio.value = quality.ratio;
}

function adaptQuality(rawDt) {
  quality.frames++;
  quality.time += rawDt;
  quality.worst = Math.max(quality.worst ?? 0, rawDt);
  quality.holdUp = Math.max(0, quality.holdUp - rawDt);
  if (game.state === 'playing') quality.playTime += rawDt;
  if (quality.time < 2) return;
  quality.fps = quality.frames / quality.time;
  quality.frames = quality.time = 0;
  fpsLabel.textContent = `${quality.fps.toFixed(0)} fps · worst frame ${(quality.worst * 1000).toFixed(0)} ms · ${Math.round(quality.ratio * 100)}% res · ${gpuName}`;
  quality.worst = 0;
  if (game.state !== 'playing' || quality.playTime < 5) return;
  quality.slow = quality.fps < 45 ? quality.slow + 1 : 0;
  let next = quality.ratio;
  if (quality.slow >= 2) {
    next = Math.max(quality.min, quality.ratio - 0.15);
    quality.slow = 0;
    quality.holdUp = 30; // don't climb straight back up and oscillate
  } else if (quality.fps > 58 && quality.holdUp === 0) {
    next = Math.min(quality.max, quality.ratio + 0.1);
  }
  if (next !== quality.ratio) {
    quality.ratio = next;
    renderer.setPixelRatio(next);
    post.resize();
    dust.uniforms.uPixelRatio.value = next;
  }
}

const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  const raw = timer.getDelta();
  adaptQuality(raw);
  const dt = Math.min(raw, 1 / 20);
  game.update(dt);
  post.composer.render(dt);
});

// ------------------------------------------------------------------ debug
// ?debug                  skip menus, start playing
// &cam=x,z,yaw[,pitch]    camera pose (yaw/pitch in degrees)
// &fear=60                hold fear at a value
// &power=1                start with power restored
// &flash=1                start holding the flashlight (on)
// &keys=1                 trigger the study key event
function setupDebug() {
  window.__hush = { game, scene, camera, renderer, world, THREE };
  game.beginPlay(false);
  const cam = params.get('cam');
  if (cam) {
    const [x, z, yaw, pitch = 0] = cam.split(',').map(Number);
    player.setPose(x, z, THREE.MathUtils.degToRad(yaw), THREE.MathUtils.degToRad(pitch));
  }
  if (params.has('flash')) {
    player.hasFlashlight = true;
    player.flashOn = true;
    game.flags.flashlight = true;
  }
  if (params.has('power')) {
    game.flags.fuse = true;
    world.fuseBox.opened = true;
    world.fuseBox.openAction.play();
    game.restorePower();
  }
  if (params.has('real')) game.debugRealKey = Number(params.get('real'));
  if (params.has('keys')) {
    world.doors.study.open(0.1);
    game.flags.power = true;
    game.keyEvent();
  }
  if (params.has('lamps')) {
    world.lamps.library.set(true);
    world.lamps.study.set(true);
  }
  if (params.has('fear')) {
    const v = Number(params.get('fear'));
    game.fear.update = () => (game.fear.value = v);
    game.fear.value = v;
    game.smoothedFear = v / 100;
  }
  // arrow keys look around without pointer lock
  window.addEventListener('keydown', (e) => {
    const r = 0.08;
    if (e.code === 'ArrowLeft') player.head.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), r);
    if (e.code === 'ArrowRight') player.head.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -r);
  });
}
