import * as THREE from 'three';

// Textures drawn at runtime with the 2D canvas API: notes, the portrait,
// the family photo, tally marks, the night sky and particle sprites.
// Everything story-related is generated here, so no external images are needed.

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Deterministic pseudo-random so textures look the same every run.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function paperBackground(ctx, w, h, seed = 1) {
  const r = rng(seed);
  ctx.fillStyle = '#d9cfb6';
  ctx.fillRect(0, 0, w, h);
  // stains and grain
  for (let i = 0; i < 18; i++) {
    const x = r() * w, y = r() * h, rad = 20 + r() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(120,90,50,${0.05 + r() * 0.08})`);
    g.addColorStop(1, 'rgba(120,90,50,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(70,45,20,0.45)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);
}

export function noteTexture(lines, seed = 3) {
  const [c, ctx] = canvas(512, 640);
  paperBackground(ctx, 512, 640, seed);
  ctx.fillStyle = '#2a2420';
  ctx.font = '500 54px "Caveat", cursive';
  ctx.textBaseline = 'top';
  const r = rng(seed + 7);
  lines.forEach((line, i) => {
    ctx.save();
    ctx.translate(48 + r() * 10, 70 + i * 74);
    ctx.rotate((r() - 0.5) * 0.05);
    ctx.fillText(line, 0, 0);
    ctx.restore();
  });
  return toTexture(c);
}

export function portraitTextures() {
  const w = 384, h = 512;
  const [c, ctx] = canvas(w, h);
  const [e, ectx] = canvas(w, h);

  const r = rng(11);
  const cx = w / 2, headY = h * 0.38;

  // dark oil-paint background with brush strokes
  const bg = ctx.createRadialGradient(cx * 0.8, h * 0.3, 10, cx, h * 0.5, h * 0.75);
  bg.addColorStop(0, '#3a2c1e');
  bg.addColorStop(1, '#0b0705');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = `rgba(${30 + r() * 40},${22 + r() * 25},${14 + r() * 15},0.1)`;
    ctx.save();
    ctx.translate(r() * w, r() * h);
    ctx.rotate(-0.6 + r() * 0.3);
    ctx.fillRect(0, 0, 6 + r() * 14, 1 + r() * 3);
    ctx.restore();
  }

  ctx.filter = 'blur(3px)';
  // coat and shoulders
  ctx.fillStyle = '#0a0705';
  ctx.beginPath();
  ctx.moveTo(cx - 30, headY + 70);
  ctx.quadraticCurveTo(cx - 150, h * 0.66, cx - 170, h);
  ctx.lineTo(cx + 170, h);
  ctx.quadraticCurveTo(cx + 150, h * 0.66, cx + 30, headY + 70);
  ctx.fill();
  // pale collar
  ctx.fillStyle = '#3d362c';
  ctx.beginPath();
  ctx.moveTo(cx - 34, headY + 78);
  ctx.lineTo(cx, headY + 120);
  ctx.lineTo(cx + 34, headY + 78);
  ctx.fill();
  // neck
  ctx.fillStyle = '#4a3828';
  ctx.fillRect(cx - 22, headY + 40, 44, 45);
  // head: shaded from the upper left
  const skin = ctx.createRadialGradient(cx - 22, headY - 20, 5, cx, headY, 75);
  skin.addColorStop(0, '#9a7a5c');
  skin.addColorStop(0.6, '#5e4532');
  skin.addColorStop(1, '#22170f');
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(cx, headY, 52, 68, 0, 0, Math.PI * 2);
  ctx.fill();
  // hair, parted, falling to the sides
  ctx.fillStyle = '#120c08';
  ctx.beginPath();
  ctx.moveTo(cx - 58, headY + 30);
  ctx.quadraticCurveTo(cx - 66, headY - 70, cx, headY - 74);
  ctx.quadraticCurveTo(cx + 66, headY - 70, cx + 58, headY + 30);
  ctx.quadraticCurveTo(cx + 48, headY - 30, cx + 10, headY - 48);
  ctx.quadraticCurveTo(cx - 40, headY - 36, cx - 58, headY + 30);
  ctx.fill();
  ctx.filter = 'blur(2px)';
  // features: deep eye sockets, nose shadow, thin mouth
  for (const dx of [-21, 21]) {
    const g = ctx.createRadialGradient(cx + dx, headY + 2, 1, cx + dx, headY + 2, 15);
    g.addColorStop(0, 'rgba(8,5,3,0.95)');
    g.addColorStop(1, 'rgba(8,5,3,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx + dx - 16, headY - 14, 32, 32);
  }
  ctx.fillStyle = 'rgba(20,12,8,0.5)';
  ctx.beginPath();
  ctx.moveTo(cx + 2, headY + 8);
  ctx.lineTo(cx + 9, headY + 30);
  ctx.lineTo(cx, headY + 32);
  ctx.fill();
  ctx.strokeStyle = 'rgba(25,14,10,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 13, headY + 44);
  ctx.quadraticCurveTo(cx, headY + 42, cx + 13, headY + 44);
  ctx.stroke();
  ctx.filter = 'none';

  // craquelure and yellowed varnish
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 140; i++) {
    let x = r() * w, y = r() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (r() - 0.5) * 30;
      y += (r() - 0.5) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(120,90,30,0.12)';
  ctx.fillRect(0, 0, w, h);
  // emissive map: only the pupils glow
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, w, h);
  for (const dx of [-21, 21]) {
    const g = ectx.createRadialGradient(cx + dx, headY + 2, 0, cx + dx, headY + 2, 6);
    g.addColorStop(0, '#fff');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ectx.fillStyle = g;
    ectx.fillRect(0, 0, w, h);
  }
  return { map: toTexture(c), emissiveMap: toTexture(e) };
}

export function familyPhotoTexture(scratchLevel = 1) {
  const w = 512, h = 384;
  const [c, ctx] = canvas(w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#b9a37f');
  bg.addColorStop(1, '#6e5a40');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  // the house behind them
  ctx.fillStyle = '#4d3d2b';
  ctx.fillRect(60, 60, 390, 200);
  ctx.beginPath();
  ctx.moveTo(40, 70); ctx.lineTo(255, 10); ctx.lineTo(470, 70); ctx.fill();
  ctx.fillStyle = '#2e2419';
  ctx.fillRect(230, 150, 50, 110);
  // three figures: two adults, one child
  const people = [
    { x: 150, hgt: 230 },
    { x: 255, hgt: 160 },
    { x: 360, hgt: 220 },
  ];
  for (const p of people) {
    ctx.fillStyle = '#2b2118';
    ctx.fillRect(p.x - 32, h - p.hgt + 40, 64, p.hgt);
    ctx.fillStyle = '#8a7255';
    ctx.beginPath();
    ctx.arc(p.x, h - p.hgt + 22, 24, 0, Math.PI * 2);
    ctx.fill();
  }
  // the scratched-out face: always the adult on the left
  const r = rng(5 + scratchLevel);
  ctx.strokeStyle = 'rgba(235,225,205,0.95)';
  ctx.lineCap = 'round';
  const fx = people[0].x, fy = h - people[0].hgt + 22;
  for (let i = 0; i < 26 * scratchLevel; i++) {
    ctx.lineWidth = 1 + r() * 3;
    ctx.beginPath();
    ctx.moveTo(fx - 30 + r() * 60, fy - 30 + r() * 60);
    ctx.lineTo(fx - 30 + r() * 60, fy - 30 + r() * 60);
    ctx.stroke();
  }
  // age: vignette and grain
  const v = ctx.createRadialGradient(w / 2, h / 2, 80, w / 2, h / 2, 330);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(40,25,10,0.7)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(255,240,210,${r() * 0.06})`;
    ctx.fillRect(r() * w, r() * h, 1, 1);
  }
  return toTexture(c);
}

// Scratched tally marks. `count` keeps growing with every completed loop.
export function tallyTexture(count) {
  const w = 512, h = 256;
  const [c, ctx] = canvas(w, h);
  ctx.clearRect(0, 0, w, h);
  const r = rng(99);
  ctx.lineCap = 'round';
  let x = 20, y = 30;
  for (let i = 0; i < count; i++) {
    const inGroup = i % 5;
    ctx.strokeStyle = `rgba(30,22,15,${0.75 + r() * 0.2})`;
    ctx.lineWidth = 3 + r() * 2;
    ctx.beginPath();
    if (inGroup < 4) {
      const lx = x + inGroup * 13 + r() * 3;
      ctx.moveTo(lx, y + r() * 4);
      ctx.lineTo(lx + (r() - 0.5) * 6, y + 55 + r() * 6);
    } else {
      ctx.moveTo(x - 6, y + 48);
      ctx.lineTo(x + 50, y + 8);
      x += 78;
      if (x > w - 70) { x = 20; y += 80; }
    }
    ctx.stroke();
  }
  return toTexture(c);
}

export function silhouetteTexture() {
  const w = 256, h = 512;
  const [c, ctx] = canvas(w, h);
  ctx.filter = 'blur(6px)';
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(w / 2, 70, 34, 42, 0, 0, Math.PI * 2); // head
  ctx.fill();
  ctx.beginPath(); // shoulders + long body, slightly hunched
  ctx.moveTo(w / 2 - 30, 105);
  ctx.quadraticCurveTo(w / 2 - 95, 130, w / 2 - 80, 260);
  ctx.lineTo(w / 2 - 60, 500);
  ctx.lineTo(w / 2 + 60, 500);
  ctx.lineTo(w / 2 + 80, 260);
  ctx.quadraticCurveTo(w / 2 + 95, 130, w / 2 + 30, 105);
  ctx.closePath();
  ctx.fill();
  const t = toTexture(c);
  return t;
}

export function nightSkyTexture() {
  const w = 512, h = 512;
  const [c, ctx] = canvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a1020');
  g.addColorStop(0.6, '#1a2440');
  g.addColorStop(1, '#0b0f18');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // moon glow
  const m = ctx.createRadialGradient(330, 140, 0, 330, 140, 160);
  m.addColorStop(0, 'rgba(210,225,255,0.9)');
  m.addColorStop(0.08, 'rgba(190,205,240,0.5)');
  m.addColorStop(1, 'rgba(120,140,190,0)');
  ctx.fillStyle = m;
  ctx.fillRect(0, 0, w, h);
  // bare tree silhouettes
  const r = rng(42);
  ctx.strokeStyle = '#05070c';
  ctx.lineCap = 'round';
  const branch = (x, y, len, ang, width) => {
    if (len < 6) return;
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
    branch(x2, y2, len * 0.72, ang - 0.3 - r() * 0.3, width * 0.7);
    branch(x2, y2, len * 0.68, ang + 0.3 + r() * 0.3, width * 0.7);
  };
  branch(90, h, 120, -Math.PI / 2, 14);
  branch(450, h, 90, -Math.PI / 2 - 0.1, 10);
  ctx.fillStyle = '#04060a';
  ctx.fillRect(0, h - 40, w, 40);
  return toTexture(c);
}

export function softDotTexture() {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(c);
}

export function footprintsTexture() {
  const w = 256, h = 1024;
  const [c, ctx] = canvas(w, h);
  ctx.clearRect(0, 0, w, h);
  const r = rng(8);
  for (let i = 0; i < 9; i++) {
    const left = i % 2 === 0;
    const x = w / 2 + (left ? -38 : 38);
    const y = h - 70 - i * 110;
    ctx.fillStyle = `rgba(35,25,15,${0.55 - i * 0.04})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 22, 40, (r() - 0.5) * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y + 55, 18, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c);
}
