// P2 — "camera nel mondo": scena Three.js.
// Una camera reale percorre una CatmullRomCurve3 attraverso territori di
// disegno (carta + inchiostro) fino a entrare nella materia delle opere.
// Il filo nero è una TubeGeometry rivelata progressivamente (drawRange).
// Le opere sono piani con shader "torcia": il puntatore accende la materia.

import * as THREE from 'three';
import { WIN, bump, clamp01 } from './timeline.js';
import { hatchTexture, dashTexture, fragmentTextures, cropCanvas } from './doodles.js';

const NAVY = 0x050a1a;
const PAPER = 0xefe9d7; // leggermente più caldo/scuro della carta pura: fa respirare le carte bianche
const PAPER_WALL = 0xf6f2e3;
const INK = 0x0a0a0a;

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

function closestU(curve, target, samples = 900) {
  let best = 0;
  let bd = Infinity;
  const p = new THREE.Vector3();
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    curve.getPointAt(u, p);
    const d = p.distanceToSquared(target);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

// progress -> u sulla curva, con plateau (dwell) davanti alle opere.
// Smoothstep per segmento: pendenza nulla ai bordi = arrivi e ripartenze morbide.
function buildProgressMap(pairs) {
  return (p) => {
    if (p <= pairs[0][0]) return pairs[0][1];
    for (let i = 1; i < pairs.length; i++) {
      if (p <= pairs[i][0]) {
        const [p0, u0] = pairs[i - 1];
        const [p1, u1] = pairs[i];
        const t = (p - p0) / (p1 - p0);
        return u0 + (u1 - u0) * t * t * (3 - 2 * t);
      }
    }
    return pairs[pairs.length - 1][1];
  };
}

const workVert = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const workFrag = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform vec2 uTorch;
uniform float uActive, uTime, uAspect, uMode, uReveal, uFade;
uniform vec3 uFogColor;
uniform float uFogNear, uFogFar;
varying vec2 vUv;
varying float vDepth;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec4 tex = texture2D(uMap, vUv);
  vec2 d = vUv - uTorch;
  d.x *= uAspect;
  float r = length(d);
  float spot = smoothstep(0.40, 0.05, r) * uActive;
  float halo = smoothstep(0.72, 0.12, r) * uActive;

  // la materia dorme nel buio; la vicinanza (uReveal) la solleva appena,
  // la torcia la accende davvero.
  float amb = mix(0.34, 0.58, uReveal);
  vec3 col = tex.rgb * (amb + 0.72 * spot + 0.16 * halo);

  vec2 cell = floor(vUv * 230.0);
  float glint = step(0.986, hash(cell + floor(uTime * 2.2))) * spot;

  if (uMode < 0.5) {
    // VERTIGINE: la luce mette in moto il vortice (shimmer a spirale + fibre)
    float a = atan(d.y, d.x);
    float swirl = 0.5 + 0.5 * sin(a * 3.0 - r * 44.0 + uTime * 1.5);
    col += tex.rgb * swirl * spot * 0.25;
    col += vec3(0.62, 0.80, 1.0) * glint * 0.75;
  } else {
    // ABBANDONO: punti dispersi che si accendono nel raggio largo,
    // e al centro — se la luce lo cerca — lo specchio infinito.
    float pts = step(0.952, hash(floor(vUv * vec2(30.0, 58.0))));
    col += (tex.rgb * 0.9 + vec3(0.25, 0.36, 0.55)) * pts * halo * 0.55;

    vec2 c = vUv - vec2(0.5, 0.52);
    c.x *= uAspect;
    float cr = length(c);
    vec2 tc = uTorch - vec2(0.5, 0.52);
    tc.x *= uAspect;
    float near = smoothstep(0.26, 0.06, length(tc)) * uActive;
    float tun = smoothstep(0.17, 0.02, cr);
    col = mix(col, vec3(0.015, 0.03, 0.07), tun * near * 0.72);
    float rings = smoothstep(0.35, 1.0, 0.5 + 0.5 * sin(cr * 95.0 - uTime * 2.4));
    col += vec3(0.45, 0.66, 0.95) * rings * tun * near * 0.9;
    col += vec3(0.62, 0.80, 1.0) * glint * 0.6;
  }

  float fogF = smoothstep(uFogNear, uFogFar, vDepth);
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, tex.a * uFade);
}`;

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const navy = new THREE.Color(NAVY);
  const paper = new THREE.Color(PAPER);
  const scene = new THREE.Scene();
  scene.background = navy.clone();
  scene.fog = new THREE.Fog(navy.clone(), 6, 26);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 60);

  const disposables = [];
  const fades = []; // { setV(v), v, target }

  // ------------------------------------------------------------------
  // Percorso camera
  // ------------------------------------------------------------------
  const camPts = [
    V3(0, 0.55, 26),
    V3(-1.2, 0.7, 18),
    V3(-3.4, 0.4, 8),
    V3(3.2, 0.9, -2),
    V3(-3.6, 0.5, -12),
    V3(0.4, 0.35, -22),
    V3(3.0, 0.42, -28.6), // arrivo Vertigine (lontano)
    V3(2.05, 0.3, -31.5), // Vertigine da vicino (dwell)
    V3(-1.5, 0.8, -40),
    V3(3.4, 1.1, -50),
    V3(-4.0, 0.7, -58),
    V3(-2.5, 0.3, -64.0), // arrivo Abbandono (lontano)
    V3(-2.9, 0.22, -66.9), // Abbandono da vicino (dwell)
    V3(-0.2, 0.6, -75),
    V3(0, 0.5, -83),
  ];
  const camCurve = new THREE.CatmullRomCurve3(camPts, false, 'centripetal');

  const A = {
    t1in: closestU(camCurve, camPts[2]),
    vFar: closestU(camCurve, camPts[6]),
    vNear: closestU(camCurve, camPts[7]),
    aFar: closestU(camCurve, camPts[11]),
    aNear: closestU(camCurve, camPts[12]),
  };
  const mapU = buildProgressMap([
    [0, 0],
    [0.1, A.t1in],
    [0.36, A.vFar],
    [0.435, A.vNear],
    [0.545, Math.min(1, A.vNear + 0.005)], // dwell: il mondo quasi fermo, si legge
    [0.72, A.aFar],
    [0.8, A.aNear],
    [0.9, Math.min(1, A.aNear + 0.004)],
    [1, 0.985], // la camera non tocca mai la fine della curva (lookAt sempre valido)
  ]);

  // ------------------------------------------------------------------
  // Il filo nero
  // ------------------------------------------------------------------
  const threadPts = [
    V3(-0.4, -0.1, 27),
    V3(-1.6, 0.2, 18),
    V3(-3.0, -0.2, 10),
    V3(2.6, 0.3, 0),
    V3(-3.2, -0.1, -10),
    V3(0.0, -0.2, -18),
    V3(1.6, -0.3, -26),
    V3(3.4, 0.3, -31),
    V3(4.6, 0.4, -36), // passa dietro Vertigine
    V3(-1.0, 0.2, -43),
    V3(3.0, 0.6, -52),
    V3(-3.8, 0.2, -60),
    V3(-4.4, -0.2, -66),
    V3(-1.6, -0.45, -71),
    V3(0.5, 0.1, -77),
    // il nodo finale: il filo si riannoda nella firma
    V3(0.9, 0.6, -81),
    V3(-0.8, 0.9, -82.5),
    V3(-0.6, -0.2, -83.5),
    V3(0.7, 0.15, -84.2),
    V3(0.0, 0.45, -84.8),
  ];
  const threadCurve = new THREE.CatmullRomCurve3(threadPts, false, 'centripetal');
  const THREAD_SEGS = 1600;
  const THREAD_RAD = 8;
  const threadMat = new THREE.MeshBasicMaterial({ color: INK });
  const threadGeo = new THREE.TubeGeometry(threadCurve, THREAD_SEGS, 0.03, THREAD_RAD, false);
  const thread = new THREE.Mesh(threadGeo, threadMat);
  thread.frustumCulled = false;
  threadGeo.setDrawRange(0, 0);
  scene.add(thread);
  disposables.push(threadGeo, threadMat);

  // Ramificazioni: brevi tubi che gemmano dal filo nei territori
  const branches = [];
  function addBranch(anchor, side, lift, win) {
    const u = closestU(threadCurve, anchor, 500);
    const o = threadCurve.getPointAt(u);
    const t = threadCurve.getTangentAt(u);
    const perp = V3(-t.z, 0, t.x).normalize().multiplyScalar(side);
    const p1 = o.clone().addScaledVector(perp, 0.7).add(V3(0, lift * 0.5, 0));
    const p2 = o.clone().addScaledVector(perp, 1.55).add(V3(0, lift, -0.35));
    const curve = new THREE.QuadraticBezierCurve3(o, p1, p2);
    const geo = new THREE.TubeGeometry(curve, 40, 0.017, 6, false);
    geo.setDrawRange(0, 0);
    const m = new THREE.Mesh(geo, threadMat);
    m.frustumCulled = false;
    scene.add(m);
    branches.push({ geo, win, segs: 40 });
    disposables.push(geo);
  }
  addBranch(V3(2.6, 0.3, 0), 1, 0.6, [0.13, 0.2]);
  addBranch(V3(-3.2, -0.1, -10), -1, 0.8, [0.16, 0.23]);
  addBranch(V3(0, -0.2, -18), 1, -0.4, [0.19, 0.26]);
  addBranch(V3(3.0, 0.6, -52), -1, 0.7, [0.6, 0.67]);
  addBranch(V3(-3.8, 0.2, -60), 1, -0.5, [0.635, 0.7]);

  // ------------------------------------------------------------------
  // Territori di carta: pareti, pavimenti, tratteggio
  // ------------------------------------------------------------------
  const wallMat = new THREE.MeshBasicMaterial({ color: PAPER_WALL });
  disposables.push(wallMat);
  function addWall(w, h, pos, rot) {
    const geo = new THREE.PlaneGeometry(w, h);
    const m = new THREE.Mesh(geo, wallMat);
    m.position.copy(pos);
    m.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
    scene.add(m);
    disposables.push(geo);
    return m;
  }
  // pareti laterali (mai attraversate dal percorso)
  addWall(18, 10, V3(-8.5, 0.8, -11), { y: 1.0 });
  addWall(14, 8, V3(8.0, 0.5, -6), { y: -0.9 });
  addWall(20, 11, V3(8.5, 0.8, -53), { y: -1.0 });
  addWall(12, 7, V3(-8.5, 0.6, -49), { y: 0.95 });
  // pavimenti di carta
  addWall(30, 24, V3(0, -2.4, -10), { x: -Math.PI / 2 });
  addWall(30, 26, V3(0, -2.4, -53), { x: -Math.PI / 2 });

  const hatchT = hatchTexture();
  const dashT = dashTexture();
  disposables.push(hatchT, dashT);
  function addInkOverlay(tex, rx, ry, w, h, pos, rot, opacity) {
    const t = tex.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({
      map: t,
      transparent: true,
      opacity,
      color: INK,
      depthWrite: false,
    });
    const geo = new THREE.PlaneGeometry(w, h);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
    scene.add(m);
    disposables.push(t, mat, geo);
  }
  // campo di tratteggio sul pavimento del territorio I, trattini cadenti sul II
  addInkOverlay(hatchT, 7, 5.5, 30, 24, V3(0, -2.38, -10), { x: -Math.PI / 2 }, 0.26);
  addInkOverlay(dashT, 6, 5, 30, 26, V3(0, -2.38, -53), { x: -Math.PI / 2 }, 0.4);
  // tratteggio sulla parete alta del territorio I
  addInkOverlay(hatchT, 4.5, 2.5, 18, 10, V3(-8.45, 0.8, -10.97), { y: 1.0 }, 0.2);

  // Frammenti di disegno sospesi
  const fragTexs = fragmentTextures();
  disposables.push(...fragTexs);
  function addFrag(i, size, pos, rotY, rotZ, color, opacity) {
    const mat = new THREE.MeshBasicMaterial({
      map: fragTexs[i],
      transparent: true,
      opacity,
      color,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(size, size);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.rotation.y = rotY;
    m.rotation.z = rotZ;
    scene.add(m);
    disposables.push(mat, geo);
  }
  addFrag(1, 1.2, V3(1.8, 0.9, 16), -0.25, 0.1, 0x7fa8d9, 0.5); // intro, azzurro pallido
  addFrag(0, 1.0, V3(-2.4, 1.15, 20), 0.2, -0.12, 0x7fa8d9, 0.45);
  addFrag(0, 1.1, V3(0.6, 1.4, -16), 0.2, 0.15, INK, 0.9); // territorio I: la spirale chiama
  addFrag(1, 0.9, V3(-1.4, -0.35, -4.5), -0.15, 0.2, INK, 0.85);
  addFrag(2, 1.0, V3(1.2, 1.2, -58), -0.2, 0.12, INK, 0.9); // territorio II
  addFrag(0, 0.7, V3(-3.6, -0.15, -61.5), 0.3, -0.2, INK, 0.8);

  // Pulviscolo (fibra) nello spazio navy
  const P_COUNT = 240;
  const pPos = new Float32Array(P_COUNT * 3);
  const tmpP = new THREE.Vector3();
  for (let i = 0; i < P_COUNT; i++) {
    camCurve.getPointAt(Math.random(), tmpP);
    pPos[i * 3] = tmpP.x + (Math.random() - 0.5) * 7;
    pPos[i * 3 + 1] = tmpP.y + (Math.random() - 0.5) * 4;
    pPos[i * 3 + 2] = tmpP.z + (Math.random() - 0.5) * 6;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0x4a93e6,
    size: 0.045,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);
  disposables.push(pGeo, pMat);

  // ------------------------------------------------------------------
  // Le opere
  // ------------------------------------------------------------------
  function makeWork(mode, w, h, pos, rotY) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: workVert,
      fragmentShader: workFrag,
      transparent: true,
      uniforms: {
        uMap: { value: null },
        uTorch: { value: new THREE.Vector2(0.5, 0.5) },
        uActive: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: w / h },
        uMode: { value: mode },
        uReveal: { value: 0 },
        uFade: { value: 0 },
        uFogColor: { value: navy.clone() },
        uFogNear: { value: 6 },
        uFogFar: { value: 26 },
      },
    });
    const geo = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    scene.add(mesh);
    disposables.push(geo, mat);
    return { mesh, mat, center: pos.clone() };
  }
  const works = [
    makeWork(0, 3.6, 2.4, V3(2.5, 0.3, -34), -0.1), // Vertigine 150×100
    makeWork(1, 1.47, 3.0, V3(-3, 0.35, -70), 0.12), // Abbandono 50×150
  ];
  // target di sguardo leggermente a sinistra del centro: l'opera vive a destra,
  // il pannello di testo a sinistra.
  const lookOffsets = [V3(-0.45, 0, 0), V3(-0.42, 0, 0)];

  // ------------------------------------------------------------------
  // Caricamento pigro delle texture
  // ------------------------------------------------------------------
  function attachWork(i, tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    works[i].mat.uniforms.uMap.value = tex;
    fades.push({ v: 0, target: 1, setV: (v) => (works[i].mat.uniforms.uFade.value = v) });
    disposables.push(tex);
  }
  function addCard(cnv, w, h, pos, rotY) {
    const tex = new THREE.CanvasTexture(cnv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      color: 0xf4f0e0, // i bianchi della pagina diventano carta
    });
    const geo = new THREE.PlaneGeometry(w, h);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.rotation.y = rotY;
    scene.add(m);
    fades.push({ v: 0, target: 1, setV: (v) => (mat.opacity = v) });
    disposables.push(tex, mat, geo);
  }

  const texLoader = new THREE.TextureLoader();
  const imgLoader = new THREE.ImageLoader();
  let phase2Started = false;

  // fase 1: territorio I + Vertigine (servono subito)
  imgLoader.load('/portfolio/page-14.jpg', (img) => {
    // "Ansia" — l'angoscia che precede la vertigine (Kierkegaard)
    addCard(cropCanvas(img, 1763, 73, 364, 470), 1.9, 2.45, V3(1.7, 0.55, -7.2), -0.3);
    // "Frustrazione" — il labirinto in bianco e nero
    addCard(cropCanvas(img, 1256, 73, 372, 471), 1.5, 1.9, V3(-2.5, 0.85, -13.5), 0.38);
  });
  texLoader.load('/images/Vertigine.jpeg', (t) => attachWork(0, t));

  function loadPhase2() {
    if (phase2Started) return;
    phase2Started = true;
    imgLoader.load('/portfolio/page-16.jpg', (img) => {
      // il disegno a pennarello della pagina contatti: la figura affacciata
      addCard(cropCanvas(img, 1300, 12, 946, 1272), 2.7, 3.63, V3(-2.3, 0.7, -48), 0.32);
    });
    texLoader.load('/images/Abbandono.jpg', (t) => attachWork(1, t));
  }
  const phase2Timer = setTimeout(loadPhase2, 8000);

  // ------------------------------------------------------------------
  // Stato per-frame
  // ------------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const camPos = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const lookState = new THREE.Vector3();
  const bgCol = new THREE.Color();
  const tmpT1 = new THREE.Vector3();
  const tmpT2 = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  let lookInit = false;
  let roll = 0;
  let lastT = 0;
  const state = { active: -1, fresh: false };

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.8 ? 63 : 55;
    camera.updateProjectionMatrix();
  }
  resize();

  function update(timeMs, p, pointer) {
    const dt = Math.min(0.05, lastT ? (timeMs - lastT) / 1000 : 0.016);
    lastT = timeMs;
    const tSec = timeMs * 0.001;

    if (p > 0.28) loadPhase2();

    // --- pesi delle finestre
    const wV = bump(WIN.vert, p);
    const wA = bump(WIN.abb, p);
    const paperW = clamp01(bump(WIN.terr1, p) + bump(WIN.terr2, p));
    const dwell = Math.max(wV, wA);

    // --- camera lungo la curva
    const u = mapU(p);
    camCurve.getPointAt(u, camPos);
    // respiro di camera, si calma davanti alle opere
    const breathe = 1 - dwell * 0.8;
    camPos.x += Math.sin(tSec * 0.43) * 0.06 * breathe;
    camPos.y += Math.sin(tSec * 0.61 + 2) * 0.05 * breathe;
    camera.position.copy(camPos);

    camCurve.getPointAt(Math.min(u + 0.022, 0.999), ahead);
    lookTarget.copy(ahead);
    if (wV > 0.001) lookTarget.lerp(tmpT1.copy(works[0].center).add(lookOffsets[0]), wV);
    if (wA > 0.001) lookTarget.lerp(tmpT1.copy(works[1].center).add(lookOffsets[1]), wA);
    if (!lookInit) {
      lookState.copy(lookTarget);
      lookInit = true;
    } else {
      lookState.lerp(lookTarget, 1 - Math.exp(-dt * 4.5));
    }
    camera.lookAt(lookState);

    // bank sottile nelle curve
    camCurve.getTangentAt(u, tmpT1);
    camCurve.getTangentAt(Math.min(u + 0.008, 1), tmpT2);
    const rollT = THREE.MathUtils.clamp((tmpT1.x * tmpT2.z - tmpT1.z * tmpT2.x) * 14, -0.09, 0.09) * breathe;
    roll += (rollT - roll) * Math.min(1, dt * 3);
    camera.rotateZ(roll);

    // --- mondo: navy <-> carta
    bgCol.copy(navy).lerp(paper, paperW);
    scene.background.copy(bgCol);
    scene.fog.color.copy(bgCol);
    scene.fog.far = 24 + 12 * paperW;
    pMat.opacity = 0.4 * (1 - paperW);

    // --- il filo si disegna poco più avanti della camera
    const frac = clamp01(u * 1.05 + 0.06);
    threadGeo.setDrawRange(0, Math.floor(THREAD_SEGS * frac) * THREAD_RAD * 6);
    for (const b of branches) {
      const f = clamp01((p - b.win[0]) / (b.win[1] - b.win[0]));
      const e = f * f * (3 - 2 * f);
      b.geo.setDrawRange(0, Math.floor(b.segs * e) * 36);
    }

    // --- fade-in di texture caricate
    for (const f of fades) {
      if (f.v !== f.target) {
        f.v = Math.min(f.target, f.v + dt * 1.4);
        f.setV(f.v);
      }
    }

    // --- torcia
    const active = wV > 0.02 || wA > 0.02 ? (wV >= wA ? 0 : 1) : -1;
    const fresh = !!(pointer.has && timeMs - pointer.fresh < 2600);
    let uv = null;
    if (active >= 0) {
      if (fresh) {
        ndc.set(pointer.ndc.x, pointer.ndc.y);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObject(works[active].mesh, false)[0];
        if (hit && hit.uv) uv = hit.uv;
      }
      if (!uv) {
        // autopilota lento: su touch (prima del primo tocco) la luce vaga da sola
        uv = {
          x: 0.5 + 0.3 * Math.sin(tSec * 0.35),
          y: 0.5 + 0.26 * Math.sin(tSec * 0.23 + 1.7),
        };
      }
    }
    for (let i = 0; i < works.length; i++) {
      const un = works[i].mat.uniforms;
      const on = i === active ? 1 : 0;
      un.uActive.value += (on - un.uActive.value) * Math.min(1, dt * 3.2);
      if (i === active && uv) {
        un.uTorch.value.x += (uv.x - un.uTorch.value.x) * Math.min(1, dt * 9);
        un.uTorch.value.y += (uv.y - un.uTorch.value.y) * Math.min(1, dt * 9);
      }
      un.uReveal.value = i === 0 ? wV : wA;
      un.uTime.value = tSec;
      un.uFogColor.value.copy(scene.fog.color);
      un.uFogNear.value = scene.fog.near;
      un.uFogFar.value = scene.fog.far;
    }

    renderer.render(scene, camera);
    state.active = active;
    state.fresh = fresh && active >= 0;
    return state;
  }

  function dispose() {
    clearTimeout(phase2Timer);
    for (const d of disposables) d.dispose && d.dispose();
    renderer.dispose();
  }

  return { update, resize, dispose };
}
