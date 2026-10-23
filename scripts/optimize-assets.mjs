// Builds the web-ready assets in public/ from the originals in assets-src/.
//   npm run optimize
//
// Why: the original Poly Haven files are ~42 MB in ~150 files (a .gltf, a .bin
// and 3-6 JPGs per model). On a slow connection both the size and the number of
// requests hurt. This script:
//   - packs each model into ONE .glb (geometry + textures in a single request),
//   - re-encodes its textures as WebP and shrinks small props to 512 px
//     (the house is dark; 1K detail on a flashlight or a clipboard is never seen),
//   - compresses the geometry with meshopt (EXT_meshopt_compression; three.js
//     decodes it with MeshoptDecoder),
//   - converts the room textures (wall, floor, ...) to WebP,
//   - downsamples the HDR environment map: it's only used at 12% intensity for
//     faint reflections, so 256x128 is plenty.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, reorder, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const SRC = 'assets-src', OUT = 'public';
// big furniture keeps 1K textures; everything else gets 512
const LARGE = new Set(['wooden_bookshelf_worn', 'vintage_grandfather_clock_01', 'GothicCommode_01', 'ClassicConsole_01']);

const kb = (n) => `${Math.round(n / 1024)} KB`;
const dirSize = (d) => fs.readdirSync(d, { recursive: true }).reduce((s, f) => {
  const p = path.join(d, f);
  return fs.statSync(p).isFile() ? s + fs.statSync(p).size : s;
}, 0);

async function models() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });
  fs.mkdirSync(`${OUT}/models`, { recursive: true });
  let before = 0, after = 0;
  for (const id of fs.readdirSync(`${SRC}/models`)) {
    const src = `${SRC}/models/${id}/${id}_1k.gltf`;
    if (!fs.existsSync(src)) continue;
    const doc = await io.read(src);
    const size = LARGE.has(id) ? 1024 : 512;
    await doc.transform(
      dedup(),
      prune(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }),
      reorder({ encoder: MeshoptEncoder }) // vertex order that compresses (and caches) better
    );
    // compress the geometry buffers; no quantization, so node transforms (e.g. the
    // fuse box door's hinge) are untouched
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({
      method: EXTMeshoptCompression.EncoderMethod.FILTER,
    });
    const out = `${OUT}/models/${id}.glb`;
    await io.write(out, doc);
    const from = dirSize(`${SRC}/models/${id}`), to = fs.statSync(out).size;
    before += from;
    after += to;
    console.log(`  ${id.padEnd(30)} ${kb(from).padStart(8)} → ${kb(to)}`);
  }
  console.log(`models: ${kb(before)} → ${kb(after)}`);
}

async function textures() {
  let before = 0, after = 0;
  for (const set of fs.readdirSync(`${SRC}/textures`)) {
    fs.mkdirSync(`${OUT}/textures/${set}`, { recursive: true });
    for (const [name, size, quality] of [['diff', 1024, 82], ['nor', 1024, 90], ['rough', 512, 80]]) {
      const src = `${SRC}/textures/${set}/${name}.jpg`;
      const out = `${OUT}/textures/${set}/${name}.webp`;
      await sharp(src).resize(size, size).webp({ quality }).toFile(out);
      before += fs.statSync(src).size;
      after += fs.statSync(out).size;
    }
  }
  console.log(`room textures: ${kb(before)} → ${kb(after)}`);
}

// --- Radiance .hdr (RGBE): read (flat or run-length encoded), box-downsample, write flat.
function readHDR(buf) {
  let pos = 0;
  const line = () => {
    let s = '';
    while (buf[pos] !== 0x0a) s += String.fromCharCode(buf[pos++]);
    pos++;
    return s;
  };
  while (line() !== '') { /* header */ }
  const [, h, , w] = line().split(' ').map((v, i) => (i % 2 ? Number(v) : v));
  const rgbe = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const row = rgbe.subarray(y * w * 4, (y + 1) * w * 4);
    if (buf[pos] === 2 && buf[pos + 1] === 2) {
      pos += 4;
      for (let c = 0; c < 4; c++) {
        for (let x = 0; x < w; ) {
          let n = buf[pos++];
          if (n > 128) {
            n -= 128;
            const v = buf[pos++];
            while (n--) row[(x++) * 4 + c] = v;
          } else while (n--) row[(x++) * 4 + c] = buf[pos++];
        }
      }
    } else {
      row.set(buf.subarray(pos, pos + w * 4));
      pos += w * 4;
    }
  }
  return { w, h, rgbe };
}

function downsampleHDR(src, dst, factor) {
  const { w, h, rgbe } = readHDR(fs.readFileSync(src));
  const W = w / factor, H = h / factor;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * w + (x * factor + dx)) * 4;
          const e = rgbe[i + 3] ? Math.pow(2, rgbe[i + 3] - 136) : 0;
          r += rgbe[i] * e; g += rgbe[i + 1] * e; b += rgbe[i + 2] * e;
        }
      }
      const n = factor * factor;
      r /= n; g /= n; b /= n;
      const m = Math.max(r, g, b), o = (y * W + x) * 4;
      if (m < 1e-32) continue;
      const exp = Math.ceil(Math.log2(m));
      const scale = 256 / Math.pow(2, exp);
      out[o] = Math.min(255, r * scale); out[o + 1] = Math.min(255, g * scale); out[o + 2] = Math.min(255, b * scale); out[o + 3] = exp + 128;
    }
  }
  const header = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`, 'ascii');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, Buffer.concat([header, Buffer.from(out)]));
  console.log(`environment: ${kb(fs.statSync(src).size)} → ${kb(fs.statSync(dst).size)} (${w}x${h} → ${W}x${H})`);
}

await models();
await textures();
downsampleHDR(`${SRC}/environments/old_room_1k.hdr`, `${OUT}/environments/old_room.hdr`, 4);
console.log(`public/ total: ${kb(dirSize(OUT))}`);
