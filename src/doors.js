import * as THREE from 'three';
import { tweens, ease } from './animation.js';

// A hinged door. Scene graph:
//   pivot (Group at the hinge, rotates)
//   └── slab (Mesh, offset so its edge sits on the pivot)
//       ├── knobFront
//       └── knobBack

export class Door {
  /**
   * @param {object} o
   * @param {'x'|'z'} o.axis   direction the wall runs along
   * @param {number} o.hingeX  world position of the hinge
   * @param {number} o.hingeZ
   * @param {number} o.width
   * @param {number} o.height
   * @param {number} o.openAngle signed radians; sign picks the swing side
   */
  constructor({ name, axis, hingeX, hingeZ, width, height, openAngle, material, knobMaterial }) {
    this.name = name;
    this.openAngle = openAngle;
    this.isOpen = false;
    this.locked = false;

    this.pivot = new THREE.Group();
    this.pivot.name = `${name}-pivot`;
    this.pivot.position.set(hingeX, 0, hingeZ);
    this.closedRotation = axis === 'x' ? 0 : -Math.PI / 2;
    this.pivot.rotation.y = this.closedRotation;

    const thickness = 0.05;
    const geo = new THREE.BoxGeometry(width - 0.02, height - 0.01, thickness);
    geo.translate(width / 2, height / 2, 0);
    this.slab = new THREE.Mesh(geo, material);
    this.slab.castShadow = true;
    this.slab.receiveShadow = true;
    this.pivot.add(this.slab);

    const knobGeo = new THREE.SphereGeometry(0.032, 16, 12);
    const roseGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16);
    roseGeo.rotateX(Math.PI / 2);
    for (const side of [1, -1]) {
      const rose = new THREE.Mesh(roseGeo, knobMaterial);
      rose.position.set(width - 0.09, 1.0, side * (thickness / 2 + 0.006));
      const knob = new THREE.Mesh(knobGeo, knobMaterial);
      knob.position.set(width - 0.09, 1.0, side * (thickness / 2 + 0.045));
      knob.castShadow = true;
      this.slab.add(rose, knob);
    }

    // Collider while closed: the doorway opening.
    const half = width / 2;
    this.collider =
      axis === 'x'
        ? { minX: hingeX, maxX: hingeX + width, minZ: hingeZ - 0.15, maxZ: hingeZ + 0.15, enabled: true }
        : { minX: hingeX - 0.15, maxX: hingeX + 0.15, minZ: hingeZ, maxZ: hingeZ + width, enabled: true };
    this.center = new THREE.Vector3(
      axis === 'x' ? hingeX + half : hingeX,
      1.1,
      axis === 'x' ? hingeZ : hingeZ + half
    );
  }

  get object() {
    return this.pivot;
  }

  open(duration = 1.6) {
    if (this.isOpen) return Promise.resolve();
    this.isOpen = true;
    this.collider.enabled = false;
    const from = this.pivot.rotation.y;
    const to = this.closedRotation + this.openAngle;
    tweens.cancel(this);
    return tweens.add({
      duration,
      easing: ease.out,
      tag: this,
      update: (k) => (this.pivot.rotation.y = from + (to - from) * k),
    });
  }

  close(duration = 1.2) {
    this.isOpen = false;
    this.collider.enabled = true;
    const from = this.pivot.rotation.y;
    const to = this.closedRotation;
    tweens.cancel(this);
    return tweens.add({
      duration,
      easing: ease.inOut,
      tag: this,
      update: (k) => (this.pivot.rotation.y = from + (to - from) * k),
    });
  }

  // Locked feedback: a short rattle.
  rattle() {
    tweens.cancel(this);
    return tweens.add({
      duration: 0.45,
      easing: ease.linear,
      tag: this,
      update: (k) => {
        this.pivot.rotation.y = this.closedRotation + Math.sin(k * Math.PI * 9) * 0.012 * (1 - k);
      },
    });
  }

  reset() {
    tweens.cancel(this);
    this.isOpen = false;
    this.collider.enabled = true;
    this.pivot.rotation.y = this.closedRotation;
  }
}
