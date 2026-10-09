import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Loads every external asset up front, reporting progress for the loading screen.

const TEXTURE_SETS = [
  'old_wood_floor',
  'decrepit_wallpaper',
  'worn_plaster_wall',
  'rough_pine_door',
  'dirty_carpet',
  'dark_paneled_wood',
];

const MODELS = [
  'vintage_grandfather_clock_01',
  'wooden_bookshelf_worn',
  'power_box_01',
  'hanging_picture_frame_01',
  'hanging_picture_frame_02',
  'fancy_picture_frame_01',
  'vintage_radio_transceiver',
  'Rockingchair_01',
  'Chandelier_01',
  'vintage_flashlight',
  'clipboard',
  'ClassicConsole_01',
  'wooden_table_02',
  'ArmChair_01',
  'GothicCommode_01',
  'vintage_oil_lamp',
  'ornate_mirror_01',
  'standing_picture_frame_01',
  'side_table_01',
  'vintage_wooden_drawer_01',
  'dining_chair_02',
];

export async function loadAssets(renderer, onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress?.(loaded / total);

  const texLoader = new THREE.TextureLoader(manager);
  const gltfLoader = new GLTFLoader(manager);
  const hdrLoader = new HDRLoader(manager);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const loadTex = (url, srgb) =>
    texLoader.loadAsync(url).then((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = anisotropy;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace; // color data is sRGB; roughness/normal stay linear
      return t;
    });

  const textures = {};
  const texJobs = TEXTURE_SETS.map(async (id) => {
    const base = `/textures/${id}`;
    const [map, roughnessMap, normalMap] = await Promise.all([
      loadTex(`${base}/diff.jpg`, true),
      loadTex(`${base}/rough.jpg`, false),
      loadTex(`${base}/nor.jpg`, false),
    ]);
    textures[id] = { map, roughnessMap, normalMap };
  });

  const models = {};
  const modelJobs = MODELS.map(async (id) => {
    const gltf = await gltfLoader.loadAsync(`/models/${id}/${id}_1k.gltf`);
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    models[id] = gltf.scene;
  });

  const hdrJob = hdrLoader.loadAsync('/environments/old_room_1k.hdr').then((t) => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  });

  // Canvas text textures need the web fonts ready before drawing.
  const fontJob = Promise.all([
    document.fonts.load('48px "Caveat"'),
    document.fonts.load('48px "Special Elite"'),
  ]).catch(() => {});

  const [hdr] = await Promise.all([hdrJob, ...texJobs, ...modelJobs, fontJob]);
  return { textures, models, hdr };
}

// Clone a loaded model so it can be placed more than once.
// Materials are shared between clones unless `uniqueMaterials` is set.
export function cloneModel(source, uniqueMaterials = false) {
  const copy = source.clone(true);
  if (uniqueMaterials) {
    copy.traverse((o) => {
      if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    });
  }
  return copy;
}
