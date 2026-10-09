import * as THREE from 'three';
import { TUNING } from './config.js';

// Raycast-based interaction: hover detection from the screen center,
// highlight feedback, and an "inspect" view that holds an object in front of the camera.

const CENTER = new THREE.Vector2(0, 0);
const HIGHLIGHT = new THREE.Color(0x2a2116);

export class Interaction {
  constructor(camera, occluders) {
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = TUNING.interactRange;
    this.occluders = occluders; // walls: block interaction through them
    this.entries = [];
    this.owner = new WeakMap(); // mesh → entry (not userData: clone() JSON-copies userData)
    this.targets = [];
    this.dirty = true;
    this.hovered = null;
    this.enabled = true;
  }

  /**
   * Register an interactable.
   * @param {object} e
   * @param {THREE.Object3D} e.object
   * @param {() => string|null} e.prompt   text shown on hover; null = not interactable now
   * @param {() => void} e.action
   * @param {boolean} [e.highlight=true]
   */
  add(e) {
    const entry = { highlight: true, range: TUNING.interactRange, ...e, materials: [] };
    entry.object.traverse((o) => {
      if (!o.isMesh) return;
      this.owner.set(o, entry);
      if (entry.highlight && !o.userData.keepMaterial) {
        // own material copies, so highlighting one object doesn't light up its clones
        // (meshes whose material is driven elsewhere, e.g. lamp bulbs, are skipped)
        o.material = o.material.clone();
        entry.materials.push({ m: o.material, emissive: o.material.emissive?.clone() });
      }
    });
    this.entries.push(entry);
    this.dirty = true;
    return entry;
  }

  remove(entry) {
    this.entries = this.entries.filter((e) => e !== entry);
    if (this.hovered === entry) this.setHover(null);
    this.dirty = true;
  }

  rebuildTargets() {
    this.targets = [...this.occluders];
    for (const e of this.entries) {
      e.object.traverse((o) => {
        if (o.isMesh) this.targets.push(o);
      });
    }
    this.dirty = false;
  }

  setHover(entry) {
    if (this.hovered === entry) return;
    if (this.hovered) for (const { m, emissive } of this.hovered.materials) if (emissive) m.emissive.copy(emissive);
    this.hovered = entry;
    if (entry) for (const { m, emissive } of entry.materials) if (emissive) m.emissive.copy(emissive).add(HIGHLIGHT);
  }

  update() {
    if (this.dirty) this.rebuildTargets();
    if (!this.enabled) {
      this.setHover(null);
      return null;
    }
    this.raycaster.setFromCamera(CENTER, this.camera);
    const hits = this.raycaster.intersectObjects(this.targets, false);
    let found = null;
    for (const h of hits) {
      if (!isVisible(h.object)) continue;
      found = this.owner.get(h.object) ?? null; // first visible hit; walls have none
      if (found && h.distance > found.range) found = null;
      break;
    }
    if (found && !found.object.visible) found = null;
    const prompt = found ? found.prompt() : null;
    this.setHover(prompt ? found : null);
    return prompt ? { entry: found, prompt } : null;
  }

  activate() {
    if (!this.hovered) return false;
    this.hovered.action();
    return true;
  }
}

function isVisible(o) {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

// Inspect mode: a clone of the object floats in front of the camera and can
// be rotated with the mouse. A small light parented to the camera lights it.
export class Inspector {
  constructor(camera) {
    this.camera = camera;
    this.anchor = new THREE.Group();
    this.anchor.position.set(0, 0, -0.55);
    camera.add(this.anchor);
    this.light = new THREE.PointLight(0xfff0dd, 0, 3, 2);
    this.light.position.set(0.25, 0.3, -0.1);
    camera.add(this.light);
    this.item = null;
    this.rot = new THREE.Vector2();
    window.addEventListener('mousemove', (e) => {
      if (!this.item) return;
      this.rot.x += e.movementY * 0.006;
      this.rot.y += e.movementX * 0.006;
    });
  }

  open(object, { scale = 1, baseRotation = null } = {}) {
    this.close();
    const copy = object.clone(true);
    copy.position.set(0, 0, 0);
    copy.rotation.set(0, 0, 0);
    copy.scale.setScalar(1);
    if (baseRotation) copy.rotation.copy(baseRotation);
    copy.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    // Fit the object into a ~0.32 m box and center it on the anchor.
    const box = new THREE.Box3().setFromObject(copy);
    const size = box.getSize(new THREE.Vector3()).length();
    const s = (0.32 / size) * scale;
    const holder = new THREE.Group();
    copy.position.sub(box.getCenter(new THREE.Vector3()));
    holder.add(copy);
    holder.scale.setScalar(s);
    this.anchor.add(holder);
    this.item = holder;
    this.rot.set(0, 0);
    this.light.intensity = 4;
  }

  update(dt) {
    if (!this.item) return;
    this.item.rotation.x += (this.rot.x - this.item.rotation.x) * Math.min(1, dt * 10);
    this.item.rotation.y += (this.rot.y - this.item.rotation.y) * Math.min(1, dt * 10);
  }

  close() {
    if (this.item) this.anchor.remove(this.item);
    this.item = null;
    this.light.intensity = 0;
  }
}
