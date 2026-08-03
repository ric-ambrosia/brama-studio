// brama — IL MONDO: un disegno a pennarello trasformato in ambiente 3D.
// Diorama costruito con gli asset adattati dai disegni (public/viaggio/*):
// pavimento a scacchi, figura coronata, fregio, stelle/pianeti appesi, e
// mini omini che camminano (due pose alternate). Le sezioni del sito vivono
// DENTRO l'ambiente come insegne disegnate; i link DOM (.world-link) vengono
// riproiettati ogni frame sulle tavolette delle insegne. Camera con parallasse
// dal puntatore + deriva lenta. Tutto deterministico (nessun Math.random).
import * as THREE from 'three';

const mondoEl = document.querySelector('.mondo');
const canvas = document.getElementById('mondo');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (mondoEl && canvas && !reduce) init();

function init() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const root = document.documentElement;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    return; // resta il fallback: pannello .hub
  }
  if (!renderer.getContext()) return;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  root.classList.add('world-live'); // le sezioni passano dentro il mondo

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050a1a, 7, 17);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  camera.position.set(0, 1.7, 6.4);

  const INK = '#cfe2ff'; // inchiostro chiaro su notte

  // carica un PNG a inchiostro nero+alpha e lo ricolora (i tratti prendono `color`)
  const texCache = {};
  function inkTexture(url, color = INK) {
    const key = url + color;
    if (texCache[key]) return texCache[key];
    const t = new THREE.Texture();
    t.colorSpace = THREE.SRGBColorSpace;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      t.image = c;
      t.needsUpdate = true;
    };
    img.src = url;
    texCache[key] = t;
    return t;
  }

  function inkPlane(url, w, h, opts = {}) {
    const mat = new THREE.MeshBasicMaterial({
      map: inkTexture(url, opts.color),
      transparent: true,
      depthWrite: false,
      fog: true,
      opacity: opts.opacity ?? 1,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.renderOrder = opts.order ?? 0;
    return m;
  }

  // ---------- pavimento a scacchi fino all'orizzonte ----------
  const floorTex = inkTexture('/viaggio/pavimento-scacchi.png', '#5f7db3');
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(12, 12);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, opacity: 0.5, fog: true, depthWrite: false })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // ---------- quinte del disegno ----------
  const figura = inkPlane('/viaggio/figura-coronata.png', 4.6, 6.9, { order: 1 });
  figura.position.set(-5.2, 3.45, -6.5);
  figura.rotation.y = 0.28;
  scene.add(figura);

  const creatura = inkPlane('/viaggio/creatura-alata.png', 2.6, 2.6, { order: 1, opacity: 0.9 });
  creatura.position.set(4.8, 4.3, -5.5);
  creatura.rotation.y = -0.2;
  scene.add(creatura);

  const fregio = inkPlane('/viaggio/fregio-filigrana.png', 26, 2.2, { order: 0, opacity: 0.55, color: '#8aa7d6' });
  const ft = fregio.material.map;
  ft.wrapS = THREE.RepeatWrapping;
  ft.repeat.set(4, 1);
  fregio.position.set(0, 6.1, -9);
  scene.add(fregio);

  // ---------- elementi appesi (stelle/pianeti/luna/cometa) ----------
  const hangDefs = [
    { url: '/viaggio/appeso-stella.png', x: -3.4, y: 4.6, z: -4.2, s: 0.55, ph: 0.0 },
    { url: '/viaggio/appeso-pianeta.png', x: -1.2, y: 5.2, z: -5.6, s: 0.7, ph: 1.3 },
    { url: '/viaggio/appeso-luna.png', x: 1.4, y: 4.9, z: -4.8, s: 0.5, ph: 2.1 },
    { url: '/viaggio/appeso-cometa.png', x: 3.2, y: 5.4, z: -6.2, s: 0.6, ph: 3.4 },
    { url: '/viaggio/appeso-stella.png', x: 5.6, y: 4.4, z: -3.6, s: 0.4, ph: 4.2 },
  ];
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x9db8e8, transparent: true, opacity: 0.35, fog: true });
  const hangs = hangDefs.map((d) => {
    const g = new THREE.Group();
    const el = inkPlane(d.url, d.s, d.s, { order: 2 });
    el.position.y = -d.s / 2;
    const wireLen = 7.5 - d.y;
    const wire = new THREE.Mesh(new THREE.PlaneGeometry(0.012, wireLen), lineMat);
    wire.position.y = wireLen / 2;
    g.add(wire);
    g.add(el);
    g.position.set(d.x, d.y, d.z);
    scene.add(g);
    return { g, ph: d.ph };
  });

  // ---------- insegne delle sezioni, piantate nel pavimento ----------
  const SIGNS = [
    { x: -3.2, z: 0.3, rot: 0.14 },
    { x: -1.65, z: -0.9, rot: 0.07 },
    { x: 0.0, z: -1.5, rot: 0 },
    { x: 1.65, z: -0.9, rot: -0.07 },
    { x: 3.2, z: 0.3, rot: -0.14 },
  ];
  const signMeshes = SIGNS.map((s) => {
    const m = inkPlane('/viaggio/insegna.png', 1.9, 1.9, { order: 3 });
    m.position.set(s.x, 0.95, s.z);
    m.rotation.y = s.rot;
    scene.add(m);
    return m;
  });
  // punto di ancoraggio del testo: il centro della tavoletta dell'insegna
  // (nell'asset la tavoletta sta a ~56% larghezza, ~48% altezza, leggermente a dx)
  const BOARD_OFFSET = new THREE.Vector3(0.1, 0.05, 0.02);

  const links = Array.from(document.querySelectorAll('.world-link'));

  // ---------- omini che camminano ----------
  const walkTexA = inkTexture('/viaggio/omino-1.png');
  const walkTexB = inkTexture('/viaggio/omino-2.png');
  const walkers = [
    { z: 1.9, h: 0.62, speed: 0.55, dir: 1, x0: -7, ph: 0 },
    { z: 0.0, h: 0.55, speed: 0.4, dir: -1, x0: 5, ph: 2.2 },
    { z: -2.6, h: 0.48, speed: 0.32, dir: 1, x0: -3, ph: 4.1 },
  ].map((w) => {
    const mat = new THREE.MeshBasicMaterial({ map: walkTexA, transparent: true, depthWrite: false, fog: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w.h, w.h), mat);
    m.position.set(w.x0, w.h / 2, w.z);
    m.renderOrder = 4;
    scene.add(m);
    return { ...w, m, mat };
  });

  // ---------- input & camera ----------
  let px = 0, py = 0;
  addEventListener('pointermove', (e) => {
    px = (e.clientX / innerWidth) * 2 - 1;
    py = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  function getP() {
    const n = parseFloat(getComputedStyle(root).getPropertyValue('--p'));
    return Number.isFinite(n) ? n : 0;
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  let cx = 0, cy = 0;
  const start = performance.now();
  const V = new THREE.Vector3();
  let raf = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const p = getP();
    const on = p > 0.02;
    canvas.style.visibility = on ? 'visible' : 'hidden';
    if (!on) { links.forEach((l) => (l.style.opacity = '0')); return; }

    const t = (now - start) / 1000;

    // camera: parallasse dal puntatore + deriva lenta (da sola su touch)
    const drift = Math.sin(t * 0.1) * 0.4;
    const tx = coarse ? drift : px * 0.65 + drift * 0.3;
    const ty = coarse ? 0 : -py * 0.35;
    cx = lerp(cx, tx, 0.04);
    cy = lerp(cy, ty, 0.04);
    camera.position.x = cx;
    camera.position.y = 1.7 + cy * 0.5;
    camera.lookAt(cx * 0.35, 1.35, -1.5);

    // appesi che oscillano appena
    for (const h of hangs) h.g.rotation.z = Math.sin(t * 0.7 + h.ph) * 0.07;
    // creatura che veleggia
    creatura.position.y = 4.3 + Math.sin(t * 0.5) * 0.18;
    creatura.rotation.z = Math.sin(t * 0.4) * 0.05;

    // omini: camminata (pose alternate + passo + bob)
    for (const w of walkers) {
      const span = 15;
      let x = w.x0 + ((t * w.speed * w.dir) % span);
      if (w.dir > 0 && x > 7.5) x -= span;
      if (w.dir < 0 && x < -7.5) x += span;
      w.m.position.x = x;
      w.m.position.y = w.h / 2 + Math.abs(Math.sin(t * 4 + w.ph)) * 0.015;
      w.m.scale.x = w.dir; // di profilo nel verso di marcia
      const stepA = Math.sin(t * 5.2 + w.ph) > 0;
      const want = stepA ? walkTexA : walkTexB;
      if (w.mat.map !== want) { w.mat.map = want; w.mat.needsUpdate = true; }
    }

    renderer.render(scene, camera);

    // link DOM riproiettati sulle tavolette delle insegne
    const showLinks = p > 0.5;
    for (let i = 0; i < links.length && i < signMeshes.length; i++) {
      const m = signMeshes[i];
      V.copy(BOARD_OFFSET).applyMatrix4(m.matrixWorld);
      V.project(camera);
      const sx = (V.x * 0.5 + 0.5) * innerWidth;
      const sy = (-V.y * 0.5 + 0.5) * innerHeight;
      const vis = showLinks && V.z < 1;
      links[i].style.opacity = vis ? '1' : '0';
      links[i].style.pointerEvents = vis ? 'auto' : 'none';
      links[i].style.transform = `translate(-50%, -50%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
    }
  }
  raf = requestAnimationFrame(frame);

  addEventListener('pagehide', () => {
    if (raf) cancelAnimationFrame(raf);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
    renderer.dispose();
  });
}
