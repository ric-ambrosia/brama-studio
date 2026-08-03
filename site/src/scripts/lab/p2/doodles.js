// P2 — texture procedurali "a pennarello": tratti bianchi su trasparente,
// tinte applicate a livello di materiale (inchiostro sui territori carta,
// azzurro pallido nello spazio navy). Più un helper di crop via canvas.

import * as THREE from 'three';

function makeCanvas(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return [c, ctx];
}

const jit = (v, a) => v + (Math.random() - 0.5) * a;

function markerPath(ctx, pts, w, alpha = 0.92) {
  ctx.globalAlpha = alpha;
  ctx.lineWidth = w;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

// Tratteggio diagonale (territorio I: fitto, nervoso). Ripetibile.
export function hatchTexture() {
  const [c, ctx] = makeCanvas(512);
  for (let i = -14; i < 16; i++) {
    const pts = [];
    const x0 = i * 40;
    for (let s = 0; s <= 9; s++) pts.push([jit(x0 + s * 64, 7), jit(s * 64 - 32, 7)]);
    markerPath(ctx, pts, 3.5 + Math.random() * 3.5, 0.55 + Math.random() * 0.35);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Trattini sparsi che cadono (territorio II: rado, senza appigli). Ripetibile.
export function dashTexture() {
  const [c, ctx] = makeCanvas(512);
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const len = 12 + Math.random() * 34;
    const drift = (Math.random() - 0.5) * 14;
    markerPath(
      ctx,
      [
        [x, y],
        [jit(x + drift * 0.4, 3), y + len * 0.5],
        [x + drift, y + len],
      ],
      3 + Math.random() * 3,
      0.5 + Math.random() * 0.4
    );
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Tre frammenti di disegno: spirale, ramificazione, rombi a scacchiera
// (eco della pagina di portfolio). Non ripetibili, usati come "pagine" sospese.
export function fragmentTextures() {
  const out = [];

  // 0 — spirale scarabocchiata (la vertigine che chiama)
  {
    const [c, ctx] = makeCanvas(512);
    const pts = [];
    for (let a = 0; a < Math.PI * 7.4; a += 0.14) {
      const r = 16 + a * 9.5;
      pts.push([jit(256 + Math.cos(a) * r, 5), jit(256 + Math.sin(a) * r * 0.92, 5)]);
    }
    markerPath(ctx, pts, 7, 0.95);
    markerPath(ctx, [[256, 256], [jit(272, 6), jit(238, 6)]], 6, 0.9);
    out.push(new THREE.CanvasTexture(c));
  }

  // 1 — ramificazione del filo
  {
    const [c, ctx] = makeCanvas(512);
    const branch = (x, y, ang, len, w, depth) => {
      const x2 = x + Math.cos(ang) * len;
      const y2 = y + Math.sin(ang) * len;
      markerPath(ctx, [[x, y], [jit((x + x2) / 2, 10), jit((y + y2) / 2, 10)], [x2, y2]], w, 0.9);
      if (depth <= 0) return;
      branch(x2, y2, ang - 0.5 - Math.random() * 0.3, len * 0.66, Math.max(2.4, w * 0.62), depth - 1);
      branch(x2, y2, ang + 0.42 + Math.random() * 0.3, len * 0.6, Math.max(2.4, w * 0.62), depth - 1);
    };
    branch(80, 470, -0.95, 150, 9, 3);
    out.push(new THREE.CanvasTexture(c));
  }

  // 2 — rombi a scacchiera (eco del disegno in chiusura di portfolio)
  {
    const [c, ctx] = makeCanvas(512);
    ctx.save();
    ctx.translate(256, 256);
    ctx.rotate(Math.PI / 4);
    const cell = 52;
    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        if ((i + j) % 2 === 0) {
          ctx.globalAlpha = 0.92;
          ctx.fillRect(i * cell + jit(0, 3), j * cell + jit(0, 3), cell - 5, cell - 5);
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 7;
    ctx.strokeRect(66, 66, 380, 380);
    out.push(new THREE.CanvasTexture(c));
  }

  out.forEach((t) => (t.colorSpace = THREE.SRGBColorSpace));
  return out;
}

// Crop di una regione di un'immagine in un canvas dedicato
// (evita di caricare in GPU l'intera pagina di portfolio per ogni carta).
export function cropCanvas(img, sx, sy, sw, sh) {
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return c;
}
