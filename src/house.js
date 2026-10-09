import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WALL_HEIGHT as H, WALL_THICKNESS as T } from './config.js';
import { nightSkyTexture } from './textures.js';

// Builds the architecture of the house from primitives:
// walls (with door/window openings), trim, floor, ceiling, window and the view outside.

// Openings in the walls. `at` is the center along the wall.
export const OPENINGS = {
  libraryDoor: { at: -3, width: 1.0, bottom: 0, top: 2.15 },
  studyDoor: { at: 2.5, width: 1.0, bottom: 0, top: 2.15 },
  archway: { at: 0, width: 1.8, bottom: 0, top: 2.5 },
  frontDoor: { at: 0, width: 1.1, bottom: 0, top: 2.2 },
  foyerWindow: { at: 4.5, width: 1.2, bottom: 0.9, top: 2.3 },
};

// Box-projected UVs in world space: the texture tiles every `tile` meters
// on every face, no matter how big the box is.
function setWorldUVs(geo, tile) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    if (ny > 0.5) uv.setXY(i, x / tile, z / tile);
    else if (nx > 0.5) uv.setXY(i, z / tile, y / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  uv.needsUpdate = true;
}

function worldBox(sx, sy, sz, cx, cy, cz, tile) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(cx, cy, cz);
  setWorldUVs(g, tile);
  return g;
}

export function buildHouse(textures) {
  const group = new THREE.Group();
  group.name = 'house';

  const mats = {
    wall: new THREE.MeshStandardMaterial({ ...textures.decrepit_wallpaper, color: 0xbdb3a2 }),
    floor: new THREE.MeshStandardMaterial({ ...textures.old_wood_floor, color: 0x9a8a78 }),
    ceiling: new THREE.MeshStandardMaterial({ ...textures.worn_plaster_wall, color: 0x6e6a62 }),
    trim: new THREE.MeshStandardMaterial({ ...textures.dark_paneled_wood, color: 0x6a5446 }),
    door: new THREE.MeshStandardMaterial({ ...textures.rough_pine_door, color: 0x8c7a68 }),
    carpet: new THREE.MeshStandardMaterial({ ...textures.dirty_carpet, color: 0x8a6a62 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xa8864f, metalness: 1, roughness: 0.32 }),
  };
  mats.wall.normalScale.set(0.6, 0.6);

  const wallGeos = [];
  const trimGeos = [];
  const colliders = [];

  // A straight wall. axis 'x' = runs along X at z=fixed; 'z' = runs along Z at x=fixed.
  function wall(axis, fixed, from, to, openings = []) {
    const a = from - T / 2, b = to + T / 2;
    const seg = (s0, s1, y0, y1) => {
      if (s1 - s0 < 0.001 || y1 - y0 < 0.001) return;
      const len = s1 - s0, mid = (s0 + s1) / 2, cy = (y0 + y1) / 2, hy = y1 - y0;
      const g = axis === 'x' ? worldBox(len, hy, T, mid, cy, fixed, 1.6) : worldBox(T, hy, len, fixed, cy, mid, 1.6);
      wallGeos.push(g);
      if (y0 < 1) {
        colliders.push(
          axis === 'x'
            ? { minX: s0, maxX: s1, minZ: fixed - T / 2, maxZ: fixed + T / 2, enabled: true }
            : { minX: fixed - T / 2, maxX: fixed + T / 2, minZ: s0, maxZ: s1, enabled: true }
        );
      }
      // skirting board on both faces
      if (y0 === 0) {
        const sk = 0.12, st = 0.025;
        for (const side of [-1, 1]) {
          const off = side * (T / 2 + st / 2);
          trimGeos.push(
            axis === 'x'
              ? worldBox(len, sk, st, mid, sk / 2, fixed + off, 1)
              : worldBox(st, sk, len, fixed + off, sk / 2, mid, 1)
          );
        }
      }
    };
    const ops = [...openings].sort((p, q) => p.at - q.at);
    let cursor = a;
    for (const op of ops) {
      const o0 = op.at - op.width / 2, o1 = op.at + op.width / 2;
      seg(cursor, o0, 0, H);
      seg(o0, o1, 0, op.bottom);
      seg(o0, o1, op.top, H);
      frame(axis, fixed, op);
      cursor = o1;
    }
    seg(cursor, b, 0, H);
  }

  // Wooden frame around an opening (door jambs + header, or window frame).
  function frame(axis, fixed, op) {
    const fw = 0.09, fd = T + 0.06;
    const o0 = op.at - op.width / 2, o1 = op.at + op.width / 2;
    const add = (s, y, ls, ly) =>
      trimGeos.push(axis === 'x' ? worldBox(ls, ly, fd, s, y, fixed, 1) : worldBox(fd, ly, ls, fixed, y, s, 1));
    const top = op.top, bot = op.bottom;
    add(o0 - fw / 2, (bot + top + fw) / 2, fw, top - bot + fw);
    add(o1 + fw / 2, (bot + top + fw) / 2, fw, top - bot + fw);
    add(op.at, top + fw / 2, op.width + fw * 2, fw);
    if (bot > 0) add(op.at, bot - 0.03, op.width + fw * 2 + 0.06, 0.06); // window sill
  }

  const O = OPENINGS;
  wall('x', -1.5, -6, 6, [O.libraryDoor, O.studyDoor]); // hallway north
  wall('x', 1.5, -6, 6, [O.archway]); // hallway south / foyer north
  wall('z', -6, -7.5, 1.5); // west
  wall('z', 6, -1.5, 1.5); // hallway east end
  wall('x', -7.5, -6, 0); // library north
  wall('z', 0, -7.5, -1.5); // library | study
  wall('x', -6.5, 0, 5); // study north
  wall('z', 5, -6.5, -1.5); // study east
  wall('z', -3, 1.5, 7.5, [O.foyerWindow]); // foyer west (window)
  wall('z', 3, 1.5, 7.5); // foyer east
  wall('x', 7.5, -3, 3, [O.frontDoor]); // foyer south (front door)

  const walls = new THREE.Mesh(mergeGeometries(wallGeos), mats.wall);
  walls.name = 'walls';
  walls.castShadow = true;
  walls.receiveShadow = true;
  const trim = new THREE.Mesh(mergeGeometries(trimGeos), mats.trim);
  trim.name = 'trim';
  trim.castShadow = true;
  trim.receiveShadow = true;
  group.add(walls, trim);

  // One floor and one ceiling plane cover the whole footprint.
  const floorGeo = new THREE.PlaneGeometry(12.4, 15.4);
  floorGeo.rotateX(-Math.PI / 2);
  setWorldUVs(floorGeo, 2.2);
  const floor = new THREE.Mesh(floorGeo, mats.floor);
  floor.receiveShadow = true;
  floor.name = 'floor';

  const ceilGeo = new THREE.PlaneGeometry(12.4, 15.4);
  ceilGeo.rotateX(Math.PI / 2);
  ceilGeo.translate(0, H, 0);
  setWorldUVs(ceilGeo, 2.5);
  const ceiling = new THREE.Mesh(ceilGeo, mats.ceiling);
  ceiling.receiveShadow = true;
  ceiling.name = 'ceiling';
  group.add(floor, ceiling);

  // Rugs
  const rug = (w, d, x, z) => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mats.carpet);
    m.position.set(x, 0.006, z);
    m.receiveShadow = true;
    group.add(m);
  };
  rug(2.2, 3.2, 0, 4.4);
  rug(2.8, 2.2, -3, -4.6);

  // Window: frame cross (casts the moonlight shadow pattern) + faint glass.
  const win = O.foyerWindow;
  const wy = (win.bottom + win.top) / 2;
  const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.05, win.top - win.bottom, 0.05), mats.trim);
  mullionV.position.set(-3, wy, win.at);
  const mullionH = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, win.width), mats.trim);
  mullionH.position.set(-3, wy + 0.15, win.at);
  for (const m of [mullionV, mullionH]) {
    m.castShadow = true;
    group.add(m);
  }
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(win.width, win.top - win.bottom),
    new THREE.MeshStandardMaterial({
      color: 0x8899aa,
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    })
  );
  glass.rotation.y = Math.PI / 2;
  glass.position.set(-3, wy, win.at);
  group.add(glass);

  // The night outside, seen through the window. Unaffected by fog so it stays readable.
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 6),
    new THREE.MeshBasicMaterial({ map: nightSkyTexture(), fog: false, color: 0x8090a8 })
  );
  sky.rotation.y = Math.PI / 2;
  sky.position.set(-9.5, 2.2, 4.5);
  group.add(sky);

  // Bright plane behind the front door, only used by the escape sequence.
  const exitLight = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 5),
    new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })
  );
  exitLight.rotation.y = Math.PI;
  exitLight.position.set(0, 2, 9.5);
  group.add(exitLight);

  return { group, colliders, occluders: [walls, trim], mats, exitLight };
}
