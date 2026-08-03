/* ============================================================
   lab/p1b — MOTORE DI RICOMPOSIZIONE (three.js)
   Un quadro = una texture suddivisa in frammenti poligonali
   (ogni frammento È un pezzo nitido dell'immagine, via UV).
   Lo stato è guidato da un progress 0→1 (scrub dello scroll):
   0 = frammenti dispersi in aria (deterministici, seed fisso),
   1 = quadro perfettamente ricomposto. Reversibile.

   Pattern per opera:
   - 'shards' → schegge triangolari: griglia warpata con bias
     radiale attorno a un centro (frammenti più piccoli e fitti
     verso il vortice) + jitter; cadono dall'alto come pioggia.
   - 'slabs'  → lastre orizzontali tipo ossidiana con tagli
     jitterati; scivolano in posizione dai lati e dall'alto,
     componendosi dal basso verso l'alto.

   Render on-demand: si disegna un frame solo quando il progress
   cambia (scrub) o al resize. Niente RAF continuo.
   ============================================================ */

import * as THREE from 'three';

const D_MAX = 0.55; // quota del progress dedicata allo stagger dei frammenti

export function webglAvailable() {
  // three ≥ r163 richiede WebGL2
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch (e) {
    return false;
  }
}

/**
 * @param {Object} o
 * @param {HTMLCanvasElement} o.canvas  canvas assoluto, più largo del quadro (aria attorno)
 * @param {HTMLElement} o.frame         elemento che coincide col quadro finale (offsetParent del canvas)
 * @param {string} o.src                texture dell'opera
 * @param {number} o.aspect             larghezza/altezza reale dell'immagine
 * @param {number} o.seed               seed PRNG (deterministico tra reload)
 * @param {Object} o.pattern            config frammentazione (type: 'shards'|'slabs', …)
 * @returns {null | {setProgress, resize, dispose, isReady}}
 */
export function createRecomposer({ canvas, frame, src, aspect, seed, pattern }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch (e) {
    return null;
  }
  renderer.setClearColor(0x000000, 0);

  const W = aspect; // il piano-quadro è alto 1 unità mondo, largo `aspect`
  const H = 1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 12);

  const rng = mulberry32(seed);
  const frags =
    pattern.type === 'slabs' ? slabs(pattern, rng, W, H) : shards(pattern, rng, W, H);

  let ready = false;
  let disposed = false;
  let progress = 0;

  const texture = new THREE.TextureLoader().load(src, () => {
    if (disposed) return;
    ready = true;
    layoutFrags();
    render();
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const baseMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });

  /* ---------- costruzione mesh per frammento ---------- */

  const meshes = [];
  const group = new THREE.Group();

  frags.forEach((f) => {
    const n = f.verts.length; // 3 (scheggia) o 4 (lastra)
    const [cu, cv] = centroid(f.verts);
    const cxw = (cu - 0.5) * W;
    const cyw = (cv - 0.5) * H;

    const tris = n === 3 ? [[0, 1, 2]] : [[0, 1, 2], [0, 2, 3]];
    const pos = new Float32Array(tris.length * 9);
    const uv = new Float32Array(tris.length * 6);
    let pi = 0;
    let ui = 0;
    tris.forEach((t) =>
      t.forEach((vi) => {
        const [u, v] = f.verts[vi];
        pos[pi++] = (u - 0.5) * W - cxw;
        pos[pi++] = (v - 0.5) * H - cyw;
        pos[pi++] = 0;
        uv[ui++] = u;
        uv[ui++] = v;
      })
    );
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(geo, baseMat);

    // contorno: filo di luce azzurra (o scheggia rossa) mentre vola
    const epos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      epos[i * 3] = (f.verts[i][0] - 0.5) * W - cxw;
      epos[i * 3 + 1] = (f.verts[i][1] - 0.5) * H - cyw;
      epos[i * 3 + 2] = 0;
    }
    const egeo = new THREE.BufferGeometry();
    egeo.setAttribute('position', new THREE.BufferAttribute(epos, 3));
    const emat = new THREE.LineBasicMaterial({
      color: f.red ? 0xd83a2e : 0x6fb0ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const line = new THREE.LineLoop(egeo, emat);
    line.position.z = 0.002; // sopra la faccia, evita z-fight
    mesh.add(line);

    mesh.userData = { fx: cxw, fy: cyw, s: f.scatter, d: f.delay, line, emat };
    group.add(mesh);
    meshes.push(mesh);
  });
  scene.add(group);

  /* ---------- stato per-frammento dal progress ---------- */

  function layoutFrags() {
    for (const m of meshes) {
      const { fx, fy, s, d, line, emat } = m.userData;
      const lp = clamp((progress - d) / (1 - D_MAX), 0, 1);
      const ep = outBack(lp); // leggero settle finale (overshoot ~6%)
      const er = 1 - outCubic(lp);
      m.position.set(fx + s.px * (1 - ep), fy + s.py * (1 - ep), s.pz * (1 - ep));
      m.rotation.set(s.rx * er, s.ry * er, s.rz * er);
      const op = lp >= 1 ? 0 : (1 - lp) * 0.8;
      emat.opacity = op;
      line.visible = op > 0.02;
    }
  }

  function render() {
    if (!ready || disposed) return;
    renderer.render(scene, camera);
  }

  function setProgress(p) {
    if (disposed) return;
    p = clamp(p, 0, 1);
    if (Math.abs(p - progress) < 0.0004 && p !== 0 && p !== 1) return;
    progress = p;
    layoutFrags();
    render();
  }

  /* ---------- camera: il frustum copre il canvas, il piano coincide col frame ---------- */

  function resize() {
    if (disposed) return;
    const fw = frame.offsetWidth || 1;
    const fh = frame.offsetHeight || 1;
    const cw = canvas.offsetWidth || 1;
    const ch = canvas.offsetHeight || 1;
    const wpp = H / fh; // unità mondo per pixel (il frame è alto H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // DPR cap 2
    renderer.setSize(cw, ch, false); // lo stile lo governa il CSS (inset %)
    camera.aspect = cw / ch;
    const dist = (ch * wpp) / 2 / Math.tan((camera.fov * Math.PI) / 360);
    const dx = (canvas.offsetLeft + cw / 2 - fw / 2) * wpp;
    const dy = -(canvas.offsetTop + ch / 2 - fh / 2) * wpp;
    camera.position.set(dx, dy, dist);
    camera.updateProjectionMatrix();
    layoutFrags();
    render();
  }
  resize();

  function dispose() {
    if (disposed) return;
    disposed = true;
    meshes.forEach((m) => {
      m.geometry.dispose();
      m.userData.line.geometry.dispose();
      m.userData.emat.dispose();
    });
    baseMat.dispose();
    texture.dispose();
    renderer.dispose();
  }

  return { setProgress, resize, dispose, isReady: () => ready };
}

/* ============================================================
   PATTERN DI FRAMMENTAZIONE
   Coordinate frammento in [0,1]²: u sinistra→destra, v basso→alto
   (stesso spazio delle UV three, texture flipY di default).
   ============================================================ */

/* Schegge triangolari — bias radiale: griglia warpata (celle più
   piccole verso il centro del vortice), vertici jitterati e
   condivisi (tiling perfetto), ogni cella → 2 triangoli. */
function shards(cfg, rng, W, H) {
  const { cols, rows, center = [0.5, 0.5], gamma = 2.1, redRatio = 0.12 } = cfg;
  const cu = center[0];
  const cv = 1 - center[1]; // center è dato dall'alto (come CSS)

  const xs = [];
  const ys = [];
  for (let i = 0; i <= cols; i++) xs.push(warp(i / cols, cu, gamma));
  for (let j = 0; j <= rows; j++) ys.push(warp(j / rows, cv, gamma));

  const V = [];
  for (let j = 0; j <= rows; j++) {
    V.push([]);
    for (let i = 0; i <= cols; i++) {
      let x = xs[i];
      let y = ys[j];
      if (i > 0 && i < cols)
        x += (rng() - 0.5) * 0.55 * Math.min(xs[i + 1] - xs[i], xs[i] - xs[i - 1]);
      if (j > 0 && j < rows)
        y += (rng() - 0.5) * 0.55 * Math.min(ys[j + 1] - ys[j], ys[j] - ys[j - 1]);
      V[j].push([x, y]);
    }
  }

  const out = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = V[j][i];
      const b = V[j][i + 1];
      const c = V[j + 1][i + 1];
      const d = V[j + 1][i];
      const tris = rng() < 0.5 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
      tris.forEach((t) => out.push({ verts: t }));
    }
  }

  let dmax = 0;
  out.forEach((f) => {
    const [u, v] = centroid(f.verts);
    f.dist = Math.hypot((u - cu) * W, (v - cv) * H);
    dmax = Math.max(dmax, f.dist);
  });

  out.forEach((f) => {
    const dn = f.dist / (dmax || 1);
    // il vortice si compone dal centro verso fuori; la pioggia continua ai bordi
    f.delay = D_MAX * clamp(0.72 * dn + 0.28 * rng(), 0, 1);
    f.red = rng() < redRatio; // Vertigine ha schegge di vetro rosse reali
    f.scatter = {
      px: (rng() - 0.5) * 1.15 * W,
      py: (0.5 + rng() * 1.2) * H, // sopra il quadro: cadono come pioggia
      pz: 0.08 + rng() * 0.42, // verso la camera
      rx: (rng() - 0.5) * 3.0,
      ry: (rng() - 0.5) * 3.0,
      rz: (rng() - 0.5) * 4.4,
    };
  });
  return out;
}

/* Lastre orizzontali tipo ossidiana — righe con bordi jitterati
   (condivisi → tiling perfetto), 1–4 tagli verticali per riga;
   si compongono dal basso, arrivando dai lati e dall'alto. */
function slabs(cfg, rng, W, H) {
  const { rows, minSeg = 1, maxSeg = 3, redRatio = 0.08 } = cfg;
  const ys = [0];
  for (let j = 1; j < rows; j++) ys.push(j / rows + (rng() - 0.5) * (0.55 / rows));
  ys.push(1);

  const out = [];
  for (let j = 0; j < rows; j++) {
    const y0 = ys[j];
    const y1 = ys[j + 1];
    const n = minSeg + Math.floor(rng() * (maxSeg - minSeg + 1));
    const cuts = [0];
    for (let k = 1; k < n; k++) cuts.push(k / n + (rng() - 0.5) * (0.5 / n));
    cuts.push(1);
    for (let k = 0; k < n; k++) {
      const x0 = cuts[k];
      const x1 = cuts[k + 1];
      const vm = (y0 + y1) / 2;
      const side = rng() < 0.5 ? -1 : 1;
      out.push({
        verts: [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ],
        delay: D_MAX * clamp(0.78 * vm + 0.22 * rng(), 0, 1), // dal basso verso l'alto
        red: rng() < redRatio,
        scatter: {
          px: side * (0.45 + rng() * 0.85) * W + (rng() - 0.5) * 0.3 * W,
          py: (0.22 + rng() * 0.75) * H,
          pz: 0.05 + rng() * 0.28,
          rx: (rng() - 0.5) * 1.3, // lastre: restano quasi piatte
          ry: (rng() - 0.5) * 2.2,
          rz: (rng() - 0.5) * 0.9,
        },
      });
    }
  }
  return out;
}

/* ---------- utilità ---------- */

/* Mappa [0,1]→[0,1] con derivata → 0 in c: linee di griglia più
   fitte attorno a c (γ > 1 = più bias). Estremi fissi. */
function warp(t, c, g) {
  if (t <= c) return c <= 0 ? 0 : c - c * Math.pow((c - t) / c, g);
  return c + (1 - c) * Math.pow((t - c) / (1 - c), g);
}

function centroid(verts) {
  let u = 0;
  let v = 0;
  verts.forEach((p) => {
    u += p[0];
    v += p[1];
  });
  return [u / verts.length, v / verts.length];
}

const clamp = (t, a, b) => Math.min(Math.max(t, a), b);
const outCubic = (t) => 1 - Math.pow(1 - t, 3);
function outBack(t) {
  const c = 1.1;
  const u = t - 1;
  return 1 + u * u * ((c + 1) * u + c);
}

/* PRNG deterministico (stesso di P1) */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
