import * as THREE from 'three';
import { cloneModel } from './assets.js';
import { ROOMS, WALL_THICKNESS as T, WALL_HEIGHT as H } from './config.js';
import { Door } from './doors.js';
import { Lamp, makeRotationClip } from './animation.js';
import * as tex from './textures.js';

// Furniture (GLB) placement + procedural story props.
// Returns references the game logic hooks into.

const _box = new THREE.Box3();
const _v = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);

const WALL_ROT = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };

// Rotate an object, then move it so its bounding box lands where we want:
// centered on x/z, bottom at `y` (or top at `top`).
function align(obj, { x, z, rotY = 0, y = 0, top = null }) {
  obj.rotation.y = rotY;
  obj.position.set(0, 0, 0);
  obj.updateMatrixWorld(true);
  _box.setFromObject(obj);
  const c = _box.getCenter(_v);
  obj.position.set(x - c.x, top !== null ? top - _box.max.y : y - _box.min.y, z - c.z);
  obj.updateMatrixWorld(true);
  return obj;
}

// Place an object flat against a wall of a room, facing into the room.
function alignWall(obj, room, wall, along, { y = 0, gap = 0.02, center = false } = {}) {
  const r = ROOMS[room];
  obj.rotation.y = WALL_ROT[wall];
  obj.position.set(0, 0, 0);
  obj.updateMatrixWorld(true);
  _box.setFromObject(obj);
  const size = _box.getSize(new THREE.Vector3());
  const yy = center ? y - size.y / 2 : y;
  let x = along, z = along;
  if (wall === 'N') z = r.minZ + T / 2 + size.z / 2 + gap;
  if (wall === 'S') z = r.maxZ - T / 2 - size.z / 2 - gap;
  if (wall === 'W') x = r.minX + T / 2 + size.x / 2 + gap;
  if (wall === 'E') x = r.maxX - T / 2 - size.x / 2 - gap;
  if (wall === 'N' || wall === 'S') x = along;
  else z = along;
  return align(obj, { x, z, rotY: WALL_ROT[wall], y: yy });
}

// World position + inward normal of a point on a room's wall surface.
function wallPoint(room, wall, along, y, out = 0) {
  const r = ROOMS[room];
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  if (wall === 'N') { p.set(along, y, r.minZ + T / 2 + out); n.set(0, 0, 1); }
  if (wall === 'S') { p.set(along, y, r.maxZ - T / 2 - out); n.set(0, 0, -1); }
  if (wall === 'W') { p.set(r.minX + T / 2 + out, y, along); n.set(1, 0, 0); }
  if (wall === 'E') { p.set(r.maxX - T / 2 - out, y, along); n.set(-1, 0, 0); }
  return { p, n, rotY: WALL_ROT[wall] };
}

// Give an empty picture frame a painting. These frames have an "artwork" mesh
// (black in the original) behind an opaque glass pane, which read as a mirror.
// The artwork gets the painting; the pane becomes a faint transparent sheen.
function fillFrame(frame, map) {
  map.flipY = false; // glTF UVs expect unflipped textures; canvas textures default to flipped
  const art = new THREE.MeshStandardMaterial({ map, roughness: 0.6, metalness: 0 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, transparent: true, opacity: 0.08, depthWrite: false });
  frame.traverse((o) => {
    if (!o.isMesh) return;
    if (/artwork/i.test(o.material.name)) o.material = art;
    else if (/glass/i.test(o.material.name) || o.material.name === '') o.material = glass;
  });
  return frame;
}

// Raycast straight down onto an object to find the surface height at (x, z).
function surfaceY(obj, x, z, fromY = H) {
  _ray.set(new THREE.Vector3(x, fromY, z), DOWN);
  const hit = _ray.intersectObject(obj, true)[0];
  return hit ? hit.point.y : null;
}

// All upward-facing surfaces under (x, z), top to bottom (e.g. bookshelf shelves).
function shelfHeights(obj, x, z) {
  const heights = [];
  let y = H;
  for (let i = 0; i < 12; i++) {
    _ray.set(new THREE.Vector3(x, y, z), DOWN);
    const hit = _ray.intersectObject(obj, true).find((h) => h.face && h.face.normal.y > 0.5);
    if (!hit) break;
    heights.push(hit.point.y);
    y = hit.point.y - 0.04;
  }
  return heights.reverse(); // bottom first
}

function colliderOf(obj, pad = 0.03) {
  _box.setFromObject(obj);
  return { minX: _box.min.x - pad, maxX: _box.max.x + pad, minZ: _box.min.z - pad, maxZ: _box.max.z + pad, enabled: true };
}

function shadowAll(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}

// ---------------------------------------------------------------- procedural props

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const BOOK_COLORS = [0x4a2a1e, 0x2f3a2a, 0x5a4630, 0x3a2430, 0x6b5a3a, 0x22303a, 0x7a6a50, 0x40281a, 0x553322];

// Fill one shelf with a row of books (as data; rendered later by makeBookInstances).
// `skip` = [minX, maxX] range to leave empty (where the red books stand).
function fillShelf(list, cx, y, z, width, maxH, rand, skip = null) {
  let x = cx - width / 2;
  const end = cx + width / 2;
  while (x < end - 0.04) {
    if (skip && x + 0.06 > skip[0] && x < skip[1]) {
      x = skip[1];
      continue;
    }
    if (rand() < 0.07) {
      x += 0.06 + rand() * 0.14; // a gap
      continue;
    }
    const w = 0.025 + rand() * 0.035;
    const h = Math.min(maxH, 0.17 + rand() * 0.1);
    const lean = rand() < 0.06 ? 0.22 : 0;
    list.push({ x: x + w / 2, y, z: z + (rand() - 0.5) * 0.03, w, h, d: 0.15 + rand() * 0.05, rotY: 0, tilt: lean, color: BOOK_COLORS[Math.floor(rand() * BOOK_COLORS.length)] });
    x += w + 0.002 + (lean ? 0.06 : 0);
  }
}

// One InstancedMesh for all books: each instance has its own matrix (position,
// rotation, size) and color, but the GPU draws them all in a single call.
function makeBookInstances(list) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0); // origin at the bottom so books stand on shelves
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.75 }), list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  list.forEach((b, i) => {
    q.setFromEuler(e.set(0, b.rotY, b.tilt));
    m.compose(p.set(b.x, b.y, b.z), q, s.set(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setHex(b.color));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  mesh.name = 'books';
  return mesh;
}

function makeKey(mat) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 24), mat);
  ring.position.y = -0.022;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.003, 6, 12), mat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = -0.05;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.09, 8), mat);
  shaft.position.y = -0.095;
  const bit1 = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.006), mat);
  bit1.position.set(0.013, -0.128, 0);
  const bit2 = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.009, 0.006), mat);
  bit2.position.set(0.009, -0.112, 0);
  g.add(ring, collar, shaft, bit1, bit2);
  g.scale.setScalar(1.6);
  return g;
}

function makeBattery() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.017, 0.017, 0.06, 16),
    new THREE.MeshStandardMaterial({ color: 0x7a1d18, roughness: 0.45, metalness: 0.3 })
  );
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.006, 10),
    new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.3, metalness: 1 })
  );
  cap.position.y = 0.033;
  g.add(body, cap);
  g.rotation.z = Math.PI / 2; // lying on its side
  return shadowAll(g);
}

function makeFuse() {
  const g = new THREE.Group();
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.55 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.3, metalness: 1 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.055, 14), ceramic);
  const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0155, 0.012, 14), brass);
  c1.position.y = 0.03;
  const c2 = c1.clone();
  c2.position.y = -0.03;
  g.add(body, c1, c2);
  g.rotation.z = Math.PI / 2;
  return shadowAll(g);
}

function makeMusicBox(woodMat) {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0xb8955a, roughness: 0.3, metalness: 1 });
  const W = 0.2, Hh = 0.09, D = 0.14;
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, Hh, D), woodMat);
  base.position.y = Hh / 2;
  const inner = new THREE.Mesh(
    new THREE.BoxGeometry(W - 0.02, 0.005, D - 0.02),
    new THREE.MeshStandardMaterial({ color: 0x5a0f18, roughness: 0.9 })
  );
  inner.position.y = Hh - 0.004;
  // Lid hinged at the back edge: lidPivot is the parent, lid the child.
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, Hh, -D / 2);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(W + 0.006, 0.018, D + 0.006), woodMat);
  lid.position.set(0, 0.009, D / 2);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.002, 0.04), brass);
  plate.position.set(0, 0.019, D / 2);
  lidPivot.add(lid);
  lid.add(plate);
  // Tiny dancer that rises and spins when the box plays.
  const porcelain = new THREE.MeshStandardMaterial({ color: 0xf2ece4, roughness: 0.35 });
  const dancer = new THREE.Group();
  const dress = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.035, 14), porcelain);
  dress.position.y = 0.018;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.02, 8), porcelain);
  torso.position.y = 0.045;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 10, 8), porcelain);
  head.position.y = 0.06;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.03, 6), brass);
  pole.position.y = -0.012;
  dancer.add(dress, torso, head, pole);
  dancer.position.y = Hh - 0.05;
  dancer.visible = false;
  g.add(base, inner, lidPivot, dancer);
  return { group: shadowAll(g), lidPivot, dancer, restY: Hh - 0.05, upY: Hh + 0.002 };
}

function makeCoatRack(woodMat) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 1.85, 12), woodMat);
  pole.position.y = 0.925;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.04, 24), woodMat);
  base.position.y = 0.02;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), woodMat);
  knob.position.y = 1.88;
  g.add(pole, base, knob);
  for (let i = 0; i < 4; i++) {
    const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), woodMat);
    const a = (i / 4) * Math.PI * 2;
    hook.position.set(Math.cos(a) * 0.06, 1.74, Math.sin(a) * 0.06);
    hook.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    g.add(hook);
  }
  // The coat: a lathe profile (shoulders → hem), flattened.
  const profile = [
    [0.0, 1.66], [0.05, 1.64], [0.15, 1.6], [0.19, 1.5], [0.2, 1.3],
    [0.21, 1.0], [0.23, 0.8], [0.24, 0.72], [0.0, 0.72],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const coatGeo = new THREE.LatheGeometry(profile, 24);
  const coat = new THREE.Mesh(
    coatGeo,
    new THREE.MeshStandardMaterial({ color: 0xb3a07c, roughness: 0.9 }) // beige trench coat
  );
  coat.scale.set(1, 1, 0.5);
  coat.position.set(0.16, 0.02, 0);
  coat.rotation.z = -0.04;
  g.add(coat);
  return { group: shadowAll(g), coat };
}

function makeHangingBulb(x, z, drop = 0.75) {
  const g = new THREE.Group();
  g.position.set(x, H, z);
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1714, roughness: 0.6, metalness: 0.4 });
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, drop, 6), dark);
  cord.position.y = -drop / 2;
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.06, 12), dark);
  socket.position.y = -drop - 0.03;
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff3dd,
    emissive: 0xffb15c,
    emissiveIntensity: 0,
    roughness: 0.15,
  });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), bulbMat);
  bulb.scale.y = 1.25;
  bulb.position.y = -drop - 0.1;
  bulb.userData.keepMaterial = true;
  g.add(cord, socket, bulb);
  const light = new THREE.PointLight(0xffb36b, 0, 3.4, 2); // short range: no leaking through walls
  light.position.set(0, -drop - 0.12, 0);
  g.add(light);
  shadowAll(g, false, false);
  return { group: g, light, bulbMat };
}

function makeSwitch() {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 0.01),
    new THREE.MeshStandardMaterial({ color: 0xcfc4ae, roughness: 0.5 })
  );
  const toggle = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, 0.035, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x3b2f22, roughness: 0.4 })
  );
  toggle.position.z = 0.012;
  g.add(plate, toggle);
  return { group: g, toggle };
}

function makePictureFrame(w, h, picMat, frameMat, depth = 0.03, border = 0.05) {
  const g = new THREE.Group();
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), picMat);
  pic.userData.keepMaterial = true;
  pic.position.z = depth * 0.25 + 0.002; // just in front of the backing board
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth * 0.5), frameMat);
  g.add(back, pic);
  const bars = [
    [w + border * 2, border, 0, h / 2 + border / 2],
    [w + border * 2, border, 0, -h / 2 - border / 2],
    [border, h, -w / 2 - border / 2, 0],
    [border, h, w / 2 + border / 2, 0],
  ];
  for (const [bw, bh, bx, by] of bars) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, depth), frameMat);
    b.position.set(bx, by, 0);
    g.add(b);
  }
  shadowAll(g, true, true);
  return { group: g, pic };
}

function makeNote(texture, w = 0.19, h = 0.24) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 })
  );
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

function makeDecal(texture, w, h, { opacity = 1 } = {}) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      roughness: 0.9,
    })
  );
}

function makeOilLamp(models) {
  const lamp = cloneModel(models.vintage_oil_lamp, true);
  lamp.updateMatrixWorld(true);
  _box.setFromObject(lamp);
  const h = _box.max.y - _box.min.y;
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xff9a3c,
    emissiveIntensity: 0,
    transparent: true,
    opacity: 0.95,
  });
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), flameMat);
  flame.scale.set(1, 2.4, 1);
  flame.castShadow = false;
  flame.userData.keepMaterial = true;
  const group = new THREE.Group();
  group.add(lamp);
  const flameY = _box.min.y + h * 0.42;
  flame.position.set((_box.min.x + _box.max.x) / 2, flameY, (_box.min.z + _box.max.z) / 2);
  group.add(flame);
  const light = new THREE.PointLight(0xff9a4a, 0, 4.5, 2);
  light.position.copy(flame.position).y += 0.03;
  group.add(light);
  return { group, light, flameMat };
}

// ---------------------------------------------------------------- build

export function buildProps({ models, textures, houseMats }) {
  const group = new THREE.Group();
  group.name = 'props';
  const colliders = [];
  const add = (obj, collide = false) => {
    group.add(obj);
    if (collide) colliders.push(colliderOf(obj));
    return obj;
  };
  const model = (id, unique = false) => cloneModel(models[id], unique);

  const woodMat = new THREE.MeshStandardMaterial({ ...textures.dark_paneled_wood, color: 0x5a4636 });
  const brassMat = houseMats.brass;
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x5e4627, roughness: 0.45, metalness: 0.6 });

  const world = { group, colliders, lamps: {}, doors: {}, mixers: [], loopMemory: [] };

  // ---------------- Doors
  const doorMat = houseMats.door;
  world.doors.front = new Door({ name: 'front', axis: 'x', hingeX: -0.55, hingeZ: 7.5, width: 1.1, height: 2.2, openAngle: 1.65, material: doorMat, knobMaterial: brassMat });
  world.doors.library = new Door({ name: 'library', axis: 'x', hingeX: -3.5, hingeZ: -1.5, width: 1.0, height: 2.15, openAngle: 1.75, material: doorMat, knobMaterial: brassMat });
  world.doors.study = new Door({ name: 'study', axis: 'x', hingeX: 2.0, hingeZ: -1.5, width: 1.0, height: 2.15, openAngle: 1.75, material: doorMat, knobMaterial: brassMat });
  for (const d of Object.values(world.doors)) {
    group.add(d.object);
    colliders.push(d.collider);
  }

  // ================================================================ FOYER
  const console_ = add(alignWall(model('ClassicConsole_01'), 'foyer', 'E', 4.6), true);
  const consoleTop = surfaceY(console_, 2.7, 4.6) ?? 0.95;
  add(alignWall(model('ornate_mirror_01'), 'foyer', 'E', 4.6, { y: 1.35 }));

  const clock = model('vintage_grandfather_clock_01', true);
  add(alignWall(clock, 'foyer', 'W', 2.35), true);
  world.clock = {
    object: clock,
    minute: clock.getObjectByName('vintage_grandfather_clock_01_minute_hand'),
    hour: clock.getObjectByName('vintage_grandfather_clock_01_houd_hand'),
  };
  for (const k of ['minute', 'hour']) if (world.clock[k]) world.clock[k].userData.baseQ = world.clock[k].quaternion.clone();

  const rack = makeCoatRack(woodMat);
  // right beside the front door, so it's in view from the starting position
  rack.group.position.set(1.08, 0, 7.02);
  rack.group.rotation.y = Math.PI; // coat hangs on the door side of the pole
  add(rack.group);
  colliders.push({ minX: 0.82, maxX: 1.5, minZ: 6.78, maxZ: 7.3, enabled: true });
  world.coat = rack.coat;

  add(alignWall(model('fancy_picture_frame_01'), 'foyer', 'N', -1.9, { y: 1.4 }));

  // Chandelier (foyer lamp)
  const chandelier = model('Chandelier_01', true);
  add(align(chandelier, { x: 0, z: 4.5, top: H }));
  const chandelierMats = [];
  chandelier.traverse((o) => {
    if (o.isMesh && /lamps/.test(o.material.name)) {
      o.material.emissive = new THREE.Color(0xffc27a);
      o.material.emissiveMap = o.material.map;
      o.userData.keepMaterial = true;
      chandelierMats.push(o.material);
    }
  });
  _box.setFromObject(chandelier);
  const foyerLight = new THREE.PointLight(0xffb36b, 0, 6.5, 2);
  foyerLight.position.set(0, _box.min.y + 0.25, 4.5);
  group.add(foyerLight);
  world.lamps.foyer = new Lamp({ light: foyerLight, emissiveMaterials: chandelierMats, baseIntensity: 14, emissiveIntensity: 3 });

  const foyerSwitch = makeSwitch();
  {
    const { p, rotY } = wallPoint('foyer', 'N', 1.35, 1.3, 0.005);
    foyerSwitch.group.position.copy(p);
    foyerSwitch.group.rotation.y = rotY;
    add(foyerSwitch.group);
  }
  world.switches = { foyer: foyerSwitch };

  // Loop memory: the inspector's own clipboard, already waiting on the console.
  const clipboard = model('clipboard');
  clipboard.rotation.x = -Math.PI / 2; // lying flat; align() only changes rotation.y
  add(align(clipboard, { x: 2.68, z: 5.1, rotY: 0, y: consoleTop }));
  world.loopMemory.push({ object: clipboard, minLoop: 1 });

  // ================================================================ HALLWAY
  const fuseBox = model('power_box_01', true);
  const fbDoor = fuseBox.getObjectByName('power_box_01_door');
  const openQ = fbDoor.quaternion.clone();
  fbDoor.quaternion.identity();
  add(alignWall(fuseBox, 'hallway', 'E', 0.2, { y: 1.45, center: true }));
  const mixer = new THREE.AnimationMixer(fuseBox);
  const openAction = mixer.clipAction(makeRotationClip('fusebox-open', fbDoor.name, new THREE.Quaternion(), openQ, 1.1));
  openAction.setLoop(THREE.LoopOnce, 1);
  openAction.clampWhenFinished = true;
  world.mixers.push(mixer);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 1.2 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), ledMat);
  _box.setFromObject(fuseBox);
  led.position.set(_box.min.x - 0.004, _box.max.y - 0.03, (_box.min.z + _box.max.z) / 2 + 0.12);
  add(led);
  const fuseInside = makeFuse();
  fuseInside.rotation.set(0, 0, 0);
  fuseInside.position.set(_box.min.x + 0.03, 1.45, (_box.min.z + _box.max.z) / 2);
  fuseInside.visible = false;
  add(fuseInside);
  world.fuseBox = { object: fuseBox, mixer, openAction, ledMat, fuseInside, opened: false };

  // Tally marks scratched into the wall next to the fuse box.
  const tallyMesh = makeDecal(tex.tallyTexture(0), 1.1, 0.55, { opacity: 0.95 });
  {
    const { p, rotY } = wallPoint('hallway', 'N', 4.25, 1.45, 0.004); // eye level, between the study door and the fuse box
    tallyMesh.position.copy(p);
    tallyMesh.rotation.y = rotY;
  }
  add(tallyMesh);
  world.tally = {
    mesh: tallyMesh,
    setCount(n) {
      tallyMesh.material.map?.dispose();
      tallyMesh.material.map = tex.tallyTexture(n);
      tallyMesh.material.needsUpdate = true;
    },
  };

  // Portrait with emissive eyes.
  const pt = tex.portraitTextures();
  const portraitMat = new THREE.MeshStandardMaterial({
    map: pt.map,
    emissiveMap: pt.emissiveMap,
    emissive: 0xffe2a8,
    emissiveIntensity: 0,
    roughness: 0.75,
  });
  const portrait = makePictureFrame(0.5, 0.66, portraitMat, frameMat, 0.04, 0.06);
  {
    const { p, rotY } = wallPoint('hallway', 'S', -4.3, 1.7, 0.02);
    portrait.group.position.copy(p);
    portrait.group.rotation.y = rotY;
  }
  add(portrait.group);
  world.portrait = { object: portrait.group, material: portraitMat };

  // Side table with the family photo and a battery.
  const sideTable = add(alignWall(model('side_table_01'), 'hallway', 'S', 3.9), true);
  const sideTop = surfaceY(sideTable, 3.9, 1.1) ?? 0.55;
  const photoMat = new THREE.MeshStandardMaterial({ map: tex.familyPhotoTexture(1), roughness: 0.6 });
  const photo = makePictureFrame(0.2, 0.15, photoMat, woodMat, 0.015, 0.02);
  photo.group.rotation.order = 'YXZ';
  photo.group.rotation.set(-0.18, Math.PI + 0.25, 0);
  photo.group.position.set(3.75, sideTop + 0.1, 1.15);
  add(photo.group);
  world.familyPhoto = { object: photo.group, material: photoMat };

  world.hallFrame = add(fillFrame(alignWall(model('hanging_picture_frame_02'), 'hallway', 'N', -0.5, { y: 1.45 }), tex.paintingTexture(0)));
  add(fillFrame(alignWall(model('hanging_picture_frame_01'), 'hallway', 'S', 2.1, { y: 1.25 }), tex.paintingTexture(1)));

  const hallA = makeHangingBulb(-3.5, 0.45);
  const hallB = makeHangingBulb(2.9, 0.45);
  add(hallA.group);
  add(hallB.group);
  world.lamps.hallA = new Lamp({ light: hallA.light, emissiveMaterials: [hallA.bulbMat], baseIntensity: 7, emissiveIntensity: 4 });
  world.lamps.hallB = new Lamp({ light: hallB.light, emissiveMaterials: [hallB.bulbMat], baseIntensity: 7, emissiveIntensity: 4, flicker: 0.55 });

  const hallSwitch = makeSwitch();
  {
    const { p, rotY } = wallPoint('hallway', 'S', -1.3, 1.3, 0.005);
    hallSwitch.group.position.copy(p);
    hallSwitch.group.rotation.y = rotY;
    add(hallSwitch.group);
  }
  world.switches.hallway = hallSwitch;

  // Muddy footprints from the archway towards the library door.
  const prints = makeDecal(tex.footprintsTexture(), 0.45, 3.4, { opacity: 0.85 });
  prints.rotation.order = 'YXZ';
  prints.rotation.set(-Math.PI / 2, Math.atan2(3, 2.7), 0);
  prints.position.set(-1.45, 0.008, -0.1);
  add(prints);

  // ================================================================ LIBRARY
  const shelfA = add(alignWall(model('wooden_bookshelf_worn'), 'library', 'N', -4.4), true);
  const shelfB = add(alignWall(model('wooden_bookshelf_worn'), 'library', 'N', -1.7), true);
  _box.setFromObject(shelfA);
  const shelfZ = (_box.min.z + _box.max.z) / 2;
  const shelves = shelfHeights(shelfA, -4.4, shelfZ);
  // "Third shelf": the third from the top, at chest height (~1.3 m), not down by your knees
  const third = shelves.length ? shelves.reduce((best, y) => (Math.abs(y - 1.28) < Math.abs(best - 1.28) ? y : best)) : 1.28;

  // "Third shelf. Behind the red books." — a row of red books hiding the fuse.
  const redBooks = new THREE.Group();
  const redMats = [0x6e1414, 0x7d1d18, 0x5c1010].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
  let bx = -0.2;
  for (let i = 0; i < 7; i++) {
    const t = 0.035 + (i % 3) * 0.008;
    const h = 0.2 + ((i * 37) % 5) * 0.012;
    const book = new THREE.Mesh(new THREE.BoxGeometry(t, h, 0.16), redMats[i % 3]);
    book.position.set(bx + t / 2, h / 2, 0);
    bx += t + 0.003;
    redBooks.add(book);
  }
  shadowAll(redBooks);
  redBooks.position.set(-4.4, third + 0.001, shelfZ + 0.04);
  add(redBooks);
  world.redBooks = { object: redBooks, rest: redBooks.position.clone() };

  const fuse = makeFuse();
  fuse.position.set(-4.4 + 0.02, third + 0.016, shelfZ - 0.07);
  // the fuse is tiny (7 cm); an invisible, larger box around it is what the raycast hits
  const fuseHit = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  fuseHit.userData.keepMaterial = true;
  fuseHit.castShadow = fuseHit.receiveShadow = false;
  fuse.add(fuseHit);
  add(fuse);
  world.fuse = fuse;

  // Every other book in the library: one InstancedMesh (a single draw call).
  const books = [];
  const rand = seeded(7);
  const shelvesB = shelfHeights(shelfB, -1.7, shelfZ);
  shelves.forEach((y, i) => {
    if (i === shelves.length - 1) return; // top of the shelf
    const room = Math.min(0.32, shelves[i + 1] - y - 0.03);
    fillShelf(books, -4.4, y, shelfZ, 1.12, room, rand, y === third ? [-4.66, -4.18] : null); // leave room for the red books
  });
  shelvesB.forEach((y, i) => {
    if (i === shelvesB.length - 1 || i === 1) return;
    fillShelf(books, -1.7, y, shelfZ, 1.12, Math.min(0.32, shelvesB[i + 1] - y - 0.03), rand);
  });

  const desk = add(align(model('wooden_table_02'), { x: -3, z: -4.7 }), true);
  const deskTop = surfaceY(desk, -3, -4.7) ?? 0.8;
  world.libraryChair = add(align(model('dining_chair_02'), { x: -3, z: -4.0, rotY: Math.PI }), true);
  // a small stack of books lying on the desk
  for (let i = 0; i < 3; i++) {
    books.push({ x: -3.3, y: deskTop + i * 0.045, z: -4.92, w: 0.24 - i * 0.02, h: 0.044, d: 0.17, rotY: (rand() - 0.5) * 0.4, tilt: 0, color: BOOK_COLORS[(i * 3) % BOOK_COLORS.length] });
  }
  add(makeBookInstances(books));

  const deskNote = makeNote(tex.noteTexture(['Third shelf.', 'Behind the red books.', '', 'You always forget.'], 3));
  deskNote.position.set(-3.15, deskTop + 0.002, -4.55);
  deskNote.rotation.y = 0.2;
  add(deskNote);
  world.deskNote = deskNote;

  const libLamp = makeOilLamp(models);
  add(align(libLamp.group, { x: -2.6, z: -4.85, y: deskTop }));
  world.lamps.library = new Lamp({ light: libLamp.light, emissiveMaterials: [libLamp.flameMat], baseIntensity: 6, emissiveIntensity: 6 });
  world.libraryLampObj = libLamp.group;

  const drawer = add(alignWall(model('vintage_wooden_drawer_01'), 'library', 'W', -4.4), true);
  _box.setFromObject(drawer);
  const drawerX = (_box.min.x + _box.max.x) / 2;
  const drawerTop = surfaceY(drawer, drawerX, -4.4) ?? 0.55;
  const radio = model('vintage_radio_transceiver', true);
  add(align(radio, { x: drawerX, z: -4.5, rotY: Math.PI / 2, y: drawerTop }));
  const dialMats = [];
  radio.traverse((o) => {
    if (o.isMesh && /dial/.test(o.name)) {
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(0xffb35a);
      o.material.emissiveIntensity = 0;
      o.userData.keepMaterial = true;
      dialMats.push(o.material);
    }
  });
  world.radio = { object: radio, dialMats, on: false };

  add(align(model('ArmChair_01'), { x: -1.0, z: -6.55, rotY: -0.76 }), true);
  add(fillFrame(alignWall(model('hanging_picture_frame_01'), 'library', 'E', -4.5, { y: 1.35 }), tex.paintingTexture(1)));

  // ================================================================ STUDY
  const sDesk = add(alignWall(model('wooden_table_02'), 'study', 'N', 1.9), true);
  _box.setFromObject(sDesk);
  const sDeskZ = (_box.min.z + _box.max.z) / 2;
  const sDeskTop = surfaceY(sDesk, 1.9, sDeskZ) ?? 0.8;

  const mb = makeMusicBox(woodMat);
  mb.group.position.set(1.7, sDeskTop, sDeskZ + 0.05);
  mb.group.rotation.y = 0.15;
  add(mb.group);
  world.musicBox = { ...mb, object: mb.group, open: false, playing: false };

  const studyNote = makeNote(tex.noteTexture(['If it has', 'no shadow,', "it isn't there."], 17));
  studyNote.position.set(2.2, sDeskTop + 0.002, sDeskZ + 0.12);
  studyNote.rotation.y = -0.25;
  add(studyNote);
  world.studyNote = studyNote;

  const commode = add(alignWall(model('GothicCommode_01'), 'study', 'E', -4.2), true);
  _box.setFromObject(commode);
  const comX = (_box.min.x + _box.max.x) / 2;
  const comTop = surfaceY(commode, comX, -4.2) ?? 1.2;
  const studyLamp = makeOilLamp(models);
  add(align(studyLamp.group, { x: comX, z: -4.65, y: comTop }));
  world.lamps.study = new Lamp({ light: studyLamp.light, emissiveMaterials: [studyLamp.flameMat], baseIntensity: 6, emissiveIntensity: 6 });
  world.studyLampObj = studyLamp.group;
  add(align(model('standing_picture_frame_01'), { x: comX, z: -3.75, rotY: -Math.PI / 2 - 0.3, y: comTop }));

  // Rocking chair in a pivot group so it can rock on its runners.
  const rocker = model('Rockingchair_01');
  const rockPivot = new THREE.Group();
  rockPivot.add(rocker);
  align(rocker, { x: 0, z: 0 });
  rockPivot.position.set(1.0, 0, -2.6);
  rockPivot.rotation.y = 2.36;
  add(rockPivot);
  colliders.push({ minX: 0.55, maxX: 1.45, minZ: -3.05, maxZ: -2.15, enabled: true });
  world.rocker = rockPivot;

  // Key hooks: four places in the study where keys can hang.
  world.keyMaterial = new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.35, metalness: 1 });
  world.makeKey = () => makeKey(world.keyMaterial.clone());
  const hookSpots = [
    ['N', 3.6, 1.5],
    ['E', -2.55, 1.55],
    ['W', -4.6, 1.45],
    ['S', 4.25, 1.5],
  ];
  world.keySpots = hookSpots.map(([wall, along, y]) => {
    const { p, n, rotY } = wallPoint('study', wall, along, y, 0);
    const hook = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.17, 6), brassMat);
    arm.rotation.x = Math.PI / 2;
    arm.position.z = 0.085;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 6), brassMat);
    tip.position.set(0, 0.008, 0.168);
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 10), brassMat);
    rose.rotation.x = Math.PI / 2;
    hook.add(arm, tip, rose);
    hook.position.copy(p);
    hook.rotation.y = rotY;
    shadowAll(hook);
    add(hook);
    const keyPos = p.clone().addScaledVector(n, 0.16);
    return { position: keyPos, rotY };
  });

  // ================================================================ BATTERIES
  world.batteries = [
    { x: 2.62, y: consoleTop, z: 4.15, ry: 0.4 },
    { x: drawerX + 0.05, y: drawerTop, z: -4.05, ry: 1.2 },
    { x: 4.05, y: sideTop, z: 1.2, ry: -0.3 },
  ].map(({ x, y, z, ry }) => {
    const b = makeBattery();
    const holder = new THREE.Group();
    holder.add(b);
    holder.position.set(x, y + 0.017, z);
    holder.rotation.y = ry;
    add(holder);
    return holder;
  });

  return world;
}
