// ─────────────────────────────────────────────────────────────────────────────
// MONDI · engine.js — il motore della home v2.
// Contratto vincolante: site/content-notes/mondi-architettura.md (§1, §3, §6).
//
// Responsabilità (solo dell'engine — gli ambienti NON toccano nulla di questo):
//   renderer unico · camera unica · scroll Lenis + timeline a segmenti ·
//   sotto-fasi approach/dwell/exit · transizioni "varco a velo" (lib/veil.js) ·
//   opera-plane INTERO per ogni mondo · lifecycle cold→warm→live→parked→dispose ·
//   caption-sync (DOM .mondo-caption) · eventi 'mondi:phase' · tier qualità +
//   auto-retrocessione · resize · FPS meter ?debug=1 · fallback hook.
//
// API PUBBLICA (per index.astro):
//   startMondi(options)  → Promise<controller|null>   null = usare il fallback
//   createMondi(options) → Promise<controller>        (non fa i check supporto)
//   detectSupport() / detectTier() / segmentOf(G) / ORDER / WEIGHTS / CHAIN
//
// options = {
//   canvas:  '#mondi-canvas' | HTMLCanvasElement,
//   track:   '#mondi-track'  | HTMLElement,
//   worlds:  [heroNS, vertigineNS, …]   ← 10 moduli nell'ordine di ORDER.
//            Ogni voce può essere: il namespace del modulo (import * as m),
//            il default export, oppure { module, preload, opera:{sources,transparent} }.
//            Voci mancanti/null → mondo segnaposto (solo opera-plane + fog).
//   onPhase: ({slug,index,p,phase}) => {}   (opzionale, oltre all'evento DOM)
//   snap:    true|false (default: true su desktop, false su touch)
//   debug:   true|false (default: ?debug=1 nell'URL)
// }
//
// controller = {
//   lenis, renderer, camera, quality, state,          // state: oggetto live
//   goTo(slugOrIndex), destroy()
// }
//
// Eventi emessi su window:
//   'mondi:phase'  detail {slug,index,p,phase} — a ogni cambio segmento o fase.
// CSS custom properties su <html> (per fade del wordmark hero, ecc.):
//   --mondi-g (0..1 viaggio intero) · --mondi-hero-p (0..1 nel segmento hero).
// Ascolta: 'vg:menu' {detail:{open}} → lenis.stop()/start().
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import Lenis from 'lenis';
import { prngFor } from './lib/prng.js';
import { fitDistance, createTextureCache } from './lib/fit.js';
import { createVeil } from './lib/veil.js';

// ── COSTANTI DEL VIAGGIO ────────────────────────────────────────────────────

export const ORDER = [
  'soglia',
  'vertigine',
  'abbandono',
  'fuga',
  'ti-devo-lasciare',
  'pugno-nel-tempo',
  'depressione',
  'la-casa-di-mike',
  'lu',
  'avventura-di-una-vita',
];

export const HERO_WEIGHT = 0.8;
export const CODA_WEIGHT = 0.24;
/** Pesi in unità-scroll: hero 0.8 · 9 opere ×1 · coda 0.24 (contratto §1.2). */
export const WEIGHTS = [HERO_WEIGHT, 1, 1, 1, 1, 1, 1, 1, 1, 1, CODA_WEIGHT];
const TOTAL_W = WEIGHTS.reduce((a, b) => a + b, 0);
const CUM = [0];
for (const w of WEIGHTS) CUM.push(CUM[CUM.length - 1] + w);

export const PALETTE = {
  notte: '#050a1a',
  notte2: '#0a1430',
  azzurro: '#4a93e6',
  rosso: '#c8281c',
  carta: '#f4f0e0',
};

/** Catena cromatica vincolante (§4): exit di N ≡ entry di N+1. */
export const CHAIN = {
  'soglia':               { entry: '#050a1a', exit: '#06102c', fog: '#081028' },
  'vertigine':            { entry: '#06102c', exit: '#030308', fog: '#0a1430' },
  'abbandono':            { entry: '#030308', exit: '#0b0a10', fog: '#030308' },
  'fuga':                 { entry: '#0b0a10', exit: '#171008', fog: '#0b0a10' },
  'ti-devo-lasciare':     { entry: '#171008', exit: '#0d0b06', fog: '#120d06' },
  'pugno-nel-tempo':      { entry: '#0d0b06', exit: '#050505', fog: '#0d0b06' },
  'depressione':          { entry: '#050505', exit: '#0d0a08', fog: '#050505' },
  'la-casa-di-mike':      { entry: '#0d0a08', exit: '#061020', fog: '#0d0a08' },
  'lu':                   { entry: '#061020', exit: '#0b0a08', fog: '#061020' },
  'avventura-di-una-vita':{ entry: '#0b0a08', exit: '#050a1a', fog: '#0b0a08' },
};
const CODA_COLOR = '#050a1a';

/** Budget per tier (§2.5 + §6.1). dpr = cap del devicePixelRatio. */
export const BUDGETS = {
  high: { maxParticles: 12000, maxDrawCalls: 40, maxTexSize: 2048, dpr: 2 },
  mid:  { maxParticles: 5000,  maxDrawCalls: 24, maxTexSize: 1408, dpr: 1.5 },
  low:  { maxParticles: 1500,  maxDrawCalls: 14, maxTexSize: 1024, dpr: 1.25 },
};

// candidati texture per slug (il primo che carica vince; §1.6)
const OPERA_BASE = {
  'vertigine': ['Vertigine', 'jpeg'],
  'abbandono': ['Abbandono', 'jpg'],
  'fuga': ['Escape', 'jpg'],
  'ti-devo-lasciare': ['Ti_Devo_Lasciare', 'jpeg'],
  'pugno-nel-tempo': ['Pugno_Nel_Tempo', 'jpeg'],
  'depressione': ['Depressione', 'jpeg'],
  'la-casa-di-mike': ['La_Casa_Di_Mike', 'jpeg'],
  'lu': ['Lu', 'jpeg'],
};

function operaSources(slug, tier) {
  if (slug === 'soglia') return null; // l'hero non ha opera-plane
  if (slug === 'avventura-di-una-vita') {
    return ['/viaggio/avventura-clessidra.webp', '/viaggio/avventura-clessidra.png'];
  }
  const def = OPERA_BASE[slug];
  if (!def) return null;
  const [b, ext] = def;
  const list = [];
  if (tier === 'high') list.push(`/images/gen/${b}-2000.avif`, `/images/gen/${b}-2000.webp`);
  list.push(
    `/images/gen/${b}-1200.avif`,
    `/images/gen/${b}-1200.webp`,
    `/images/thumbs/${b}-1200.jpg`,
    `/images/gen/${b}-600.webp`,
    `/images/thumbs/${b}-600.jpg`,
    `/images/${b}.${ext}`,
  );
  return list;
}

// ── HELPER PURI ─────────────────────────────────────────────────────────────

const DEG2RAD = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

/** Progress globale G (0..1) → { index (0=hero, 1..9 opere, 10=coda), p (0..1) }. */
export function segmentOf(G) {
  return segAtScaled(clamp01(G) * TOTAL_W, { index: 0, p: 0 });
}
function segAtScaled(x, out) {
  for (let i = 0; i < WEIGHTS.length; i++) {
    if (x <= CUM[i + 1] || i === WEIGHTS.length - 1) {
      out.index = i;
      out.p = clamp01((x - CUM[i]) / WEIGHTS[i]);
      return out;
    }
  }
  out.index = WEIGHTS.length - 1;
  out.p = 1;
  return out;
}
// Finestra dwell allargata (0.34–0.66): l'opera resta protagonista e la
// didascalia visibile per ~1/3 del segmento, non un lampo del 16%.
function phaseOf(p) {
  return p <= 0.34 ? 'approach' : p < 0.66 ? 'dwell' : 'exit';
}

function scheduleIdle(fn, timeout = 300) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout });
  else setTimeout(fn, 120);
}

// ── RILEVAMENTO SUPPORTO E TIER (§6) ────────────────────────────────────────

export function detectSupport() {
  const reducedMotion =
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  let webgl2 = false;
  try {
    const c = document.createElement('canvas');
    webgl2 = !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) { webgl2 = false; }
  return { webgl2, reducedMotion };
}

export function detectTier() {
  const mem = navigator.deviceMemory;
  if (mem !== undefined && mem <= 4) return 'low';
  const coarse = matchMedia('(hover: none), (pointer: coarse)').matches;
  if (coarse || matchMedia('(max-width: 820px)').matches) return 'mid';
  return 'high';
}

// ── SHADER DELL'OPERA-PLANE (engine-owned, §1.6) ────────────────────────────

const OPERA_VERT = /* glsl */ `
  uniform float uCurve;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    // curvatura gentile, clampata a 0.03u dal contratto
    float c = clamp(uCurve, 0.0, 0.03);
    p.z += c * sin(uv.x * 3.14159265) * sin(uv.y * 3.14159265);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const OPERA_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D map;
  uniform float uEdge;
  uniform vec3 uEdgeColor;
  uniform float uOpacity;
  uniform float uLift;      // rialzo dei tratti per asset a inchiostro su alpha
  uniform vec3 uLiftColor;  // (clessidra): tratto nero → tinta pergamena/oro
  varying vec2 vUv;
  void main() {
    vec4 tex = texture2D(map, vUv);
    float b = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    // filo emissivo SOTTILE (contratto §1.6): mai una cornice spessa
    float glow = (1.0 - smoothstep(0.0, 0.012, b)) * uEdge;
    vec3 col = tex.rgb + uLiftColor * (tex.a * uLift * (1.0 - dot(tex.rgb, vec3(0.5))));
    col += uEdgeColor * glow;
    gl_FragColor = vec4(col, tex.a * uOpacity);
    #include <colorspace_fragment>
  }
`;

// ── AVVIO CON CHECK DI SUPPORTO (hook per il fallback statico §6.2) ─────────

/**
 * Avvia il motore SOLO se supportato. Con reduced-motion o senza WebGL2
 * ritorna null e NON tocca il DOM (il fallback server-rendered resta visibile).
 * Quando parte aggiunge 'js-mondi' a <html> (il CSS nasconde lo statico).
 */
export async function startMondi(options = {}) {
  const sup = detectSupport();
  if (sup.reducedMotion || !sup.webgl2) return null;
  try {
    return await createMondi(options);
  } catch (err) {
    // qualsiasi fallimento di avvio → fallback statico intatto
    console.error('[mondi] avvio fallito, resto sul fallback statico:', err);
    document.documentElement.classList.remove('js-mondi');
    return null;
  }
}

// ── MOTORE ──────────────────────────────────────────────────────────────────

export async function createMondi(options = {}) {
  // hot-reload / doppio avvio: mai due motori vivi
  if (window.__MONDI__ && typeof window.__MONDI__.destroy === 'function') {
    window.__MONDI__.destroy();
  }

  const docEl = document.documentElement;
  const debug = options.debug ?? new URLSearchParams(location.search).get('debug') === '1';
  const touch = matchMedia('(hover: none), (pointer: coarse)').matches;
  const snapEnabled = options.snap ?? !touch;
  const onPhase = typeof options.onPhase === 'function' ? options.onPhase : null;

  // ---- qualità (oggetto CONDIVISO con gli ambienti: mai sostituirlo) -------
  const tier0 = detectTier();
  const quality = { tier: tier0, ...BUDGETS[tier0] };
  delete quality.dpr; // il cap DPR resta interno all'engine

  // ---- canvas + renderer (§1.1) --------------------------------------------
  let canvas = options.canvas || '#mondi-canvas';
  if (typeof canvas === 'string') canvas = document.querySelector(canvas);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'mondi-canvas';
    document.body.prepend(canvas);
  }
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true, // bordi puliti anche su tier mid (lastre, ingranaggi)
    powerPreference: 'high-performance',
    alpha: false,
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.info.autoReset = false;
  renderer.setClearColor(new THREE.Color(PALETTE.notte), 1);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);

  const cache = createTextureCache({ anisotropy: 4 });
  const veil = createVeil(renderer);

  // ---- track DOM + Lenis (§1.2) --------------------------------------------
  let track = options.track || '#mondi-track';
  if (typeof track === 'string') track = document.querySelector(track);
  if (!track) {
    track = document.createElement('div');
    track.id = 'mondi-track';
    track.style.height = `${200 + 9 * 250 + 60}svh`;
    document.body.appendChild(track);
  }

  const lenis = new Lenis({
    autoRaf: false,
    smoothWheel: true,
    syncTouch: true,
    lerp: touch ? 0.12 : 0.09,
  });

  // ---- stato scroll / camera -----------------------------------------------
  let vw = 1, vh = 1, trackH = 1, docMaxScroll = 1;
  const viewport = { w: 1, h: 1, aspect: 1, dpr: 1 }; // oggetto condiviso (§2.2)

  let sSmooth = 0;          // progress in unità-peso, smoothato (λ 5.5)
  let sTargetPrev = 0;
  let vel = 0;              // segmenti/secondo, con segno
  let timeS = 0;
  let stopT = 0;            // secondi di fermo REALE (delta scroll < 0.5px)
  let prevScrollPos = -1;

  const segSmooth = { index: 0, p: 0 };
  const segRaw = { index: 0, p: 0 };

  // pointer: target grezzo + valore smoothato (λ 3). Su touch resta (0,0).
  const ptrTarget = { x: 0, y: 0 };
  const ptr = { x: 0, y: 0 };
  const zeroPtr = { x: 0, y: 0 };

  // frame condiviso passato agli update (§2.3) — MAI riallocato
  const frame = {
    progress: 0,
    globalProgress: 0,
    phase: 'approach',
    time: 0,
    dt: 0,
    pointer: touch ? zeroPtr : ptr,
    velocity: 0,
    quality,
  };
  const warmFrame = {
    progress: 0, globalProgress: 0, phase: 'approach',
    time: 0, dt: 0.016, pointer: zeroPtr, velocity: 0, quality,
  };

  // pre-allocazioni camera/proiezione
  const _camPos = new THREE.Vector3();
  const _lookT = new THREE.Vector3();
  const _corner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const _bufSize = new THREE.Vector2();

  // ---- normalizzazione mondi -----------------------------------------------
  // Ogni voce può essere: namespace modulo, default export, {module,preload,opera}
  const rawWorlds = Array.isArray(options.worlds) ? options.worlds : [];
  const worlds = ORDER.map((slug, i) => {
    const entry = rawWorlds[i] || null;
    // accetta: namespace del modulo, default export, o { module, preload, opera }
    let mod = null;
    let preload = [];
    if (entry) {
      for (const c of [entry.module, entry.default, entry]) {
        if (!c) continue;
        if (typeof c.init === 'function') { mod = c; break; }
        if (c.default && typeof c.default.init === 'function') { mod = c.default; break; }
      }
      preload =
        entry.preload ||
        (entry.module && entry.module.preload) ||
        (mod && mod.preload) || [];
    }
    if (mod && mod.id && mod.id !== slug) {
      console.warn(`[mondi] worlds[${i}]: id '${mod.id}' ≠ atteso '${slug}'`);
    }
    const colors = { ...CHAIN[slug], ...((mod && mod.colors) || {}) };
    // colore mostrato mentre il mondo carica: mai nero puro — l'entry viene
    // tirato verso il blu notte così nessuna posizione di scroll è un buco.
    const loadingCol = new THREE.Color(colors.entry || PALETTE.notte)
      .lerp(new THREE.Color(PALETTE.notte2), 0.55);
    const operaOpt = (entry && entry.opera) || {};
    const prng = prngFor(slug);
    return {
      loadingCol,
      i, slug, module: mod, preloadUrls: preload, colors,
      state: 'cold',            // cold | loading | live | parked | broken
      scene: null, handle: null, ctx: null,
      plane: null, planeW: 1.8, planeH: 2.4, fitD: 3.2,
      operaSources: operaOpt.sources || operaSources(slug, quality.tier),
      operaTransparent: operaOpt.transparent ?? (slug === 'avventura-di-una-vita'),
      texKeys: [],
      side: prng() < 0.5 ? -1 : 1,   // lato del sorpasso in exit (deterministico)
      prng,
      preloaded2: false,
      errCount: 0,
      initPromise: null,
    };
  });

  const veilColorFor = (a) => worlds[a].colors.exit || CHAIN[worlds[a].slug].exit;
  const preloadKeys = new Set(); // ref delle texture precaricate (rilasciate a destroy)
  /** un mondo è renderizzabile anche se il suo modulo è rotto (resta l'opera) */
  const renderable = (stw) => (stw.state === 'live' || stw.state === 'broken') && !!stw.scene;

  // ---- didascalie (§1.7) ----------------------------------------------------
  const captions = new Map();
  document.querySelectorAll('.mondo-caption, [data-mondo-caption]').forEach((el) => {
    let slug = el.dataset.mondoCaption;
    if (!slug) {
      const href = el.getAttribute('href') || '';
      const m = href.match(/\/opera\/([^/]+)\/?$/);
      if (m) slug = m[1];
    }
    if (slug) {
      captions.set(slug, el);
      el.style.position = 'fixed';
      el.style.pointerEvents = 'none';
    }
  });
  let visibleCaption = null;

  function hideCaption() {
    if (!visibleCaption) return;
    visibleCaption.classList.remove('is-visible');
    visibleCaption.style.pointerEvents = 'none';
    visibleCaption = null;
  }
  function showCaption(stw) {
    const el = captions.get(stw.slug);
    if (!el) return;
    if (visibleCaption && visibleCaption !== el) hideCaption();
    // rect proiettato del piano (solo in dwell, §1.6) — l'<a> copre l'opera
    const hw = stw.planeW / 2, hh = stw.planeH / 2;
    _corner[0].set(-hw, -hh, 0); _corner[1].set(hw, -hh, 0);
    _corner[2].set(-hw, hh, 0);  _corner[3].set(hw, hh, 0);
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (let c = 0; c < 4; c++) {
      _corner[c].project(camera);
      const x = (_corner[c].x * 0.5 + 0.5) * vw;
      const y = (-_corner[c].y * 0.5 + 0.5) * vh;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    // posizione uniforme tra i mondi: colonna destra se c'è spazio (desktop),
    // altrimenti sotto — SEMPRE con margine di sicurezza dal bordo inferiore
    // (la didascalia di Lu usciva troncata dal viewport)
    const spaceRight = vw - maxX;
    const spaceBelow = vh - maxY;
    let pos;
    if (vw > 768 && spaceRight >= 240) pos = 'right';
    else if (spaceBelow >= 150) pos = 'below';
    else { pos = 'below'; maxY = Math.max(minY + 40, vh - 150); }
    if (el.dataset.pos !== pos) el.dataset.pos = pos;
    if (!visibleCaption) {
      el.classList.add('is-visible');
      el.style.pointerEvents = 'auto';
      visibleCaption = el;
    }
    el.style.left = minX.toFixed(1) + 'px';
    el.style.top = minY.toFixed(1) + 'px';
    el.style.width = Math.max(0, maxX - minX).toFixed(1) + 'px';
    el.style.height = Math.max(0, maxY - minY).toFixed(1) + 'px';
  }

  // frazione di viewport occupata dall'opera nel dwell: fit-inside con margine.
  // Su viewport stretti l'asset a inchiostro (clessidra) resta quinta, non
  // soggetto pieno schermo (era murky e sovradimensionato su mobile).
  function fitFraction(stw) {
    const narrow = viewport.aspect < 0.8;
    if (stw.operaTransparent) return narrow ? 0.55 : 0.68;
    return narrow ? 0.78 : 0.8;
  }

  // ---- opera-plane (creato dall'engine, uguale per tutti — §1.6) -----------
  async function buildOperaPlane(stw) {
    if (!stw.operaSources) return; // hero
    let tex = null;
    try {
      const key = cache.keyFor(stw.operaSources, quality.maxTexSize);
      tex = await cache.acquire(stw.operaSources, quality.maxTexSize);
      stw.texKeys.push(key);
    } catch (err) {
      console.warn(`[mondi] texture opera '${stw.slug}' non caricabile`, err);
    }
    const aspect = tex && tex.image ? tex.image.width / tex.image.height : 0.78;
    const w = aspect >= 1 ? 2.4 : 2.4 * aspect;
    const h = aspect >= 1 ? 2.4 / aspect : 2.4;
    const geo = new THREE.PlaneGeometry(w, h, 64, 64);
    let mat;
    if (tex) {
      mat = new THREE.ShaderMaterial({
        vertexShader: OPERA_VERT,
        fragmentShader: OPERA_FRAG,
        uniforms: {
          map: { value: tex },
          uCurve: { value: 0.012 },
          uEdge: { value: 0 },
          uEdgeColor: { value: new THREE.Color(PALETTE.azzurro) },
          uOpacity: { value: 1 },
          // asset a inchiostro su alpha (clessidra): lift alto + tinta chiara,
          // altrimenti il placeholder si legge come riquadro nero
          uLift: { value: stw.operaTransparent ? 1.05 : 0 },
          uLiftColor: { value: new THREE.Color(stw.operaTransparent ? '#e6cd96' : '#c9a96a') },
        },
        // sempre transparent: serve alla dissolvenza d'uscita su viewport
        // stretti (l'opera esce intera, mai tagliata dal bordo)
        transparent: true,
        // le opere ad alpha NON scrivono depth: i pixel trasparenti del quad
        // oscurerebbero l'ambiente dietro (il "rettangolo nero" di avventura)
        depthWrite: !stw.operaTransparent,
        side: THREE.DoubleSide,
      });
    } else {
      mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.notte2) });
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, 0);
    const uniforms = mat.uniforms || null;
    mesh.userData.opera = {
      slug: stw.slug,
      uniforms,
      /** intensità bordo emissivo (0..2) + colore opzionale — unico canale ammesso */
      setEdge(v, hex) {
        if (!uniforms) return;
        uniforms.uEdge.value = clamp(v || 0, 0, 2);
        if (hex) uniforms.uEdgeColor.value.set(hex);
      },
    };
    stw.plane = mesh;
    stw.planeW = w;
    stw.planeH = h;
    stw.fitD = fitDistance(w, h, camera, fitFraction(stw));
    stw.scene.add(mesh);
  }

  // ---- lifecycle (§3) -------------------------------------------------------
  async function initWorld(stw) {
    stw.state = 'loading';
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(stw.colors.fog || PALETTE.notte);
    stw.scene = scene;
    await buildOperaPlane(stw);

    const ctx = {
      scene,
      operaPlane: stw.plane,
      camera,
      loadTexture: async (urlOrList) => {
        const key = cache.keyFor(urlOrList, quality.maxTexSize);
        const t = await cache.acquire(urlOrList, quality.maxTexSize);
        stw.texKeys.push(key);
        return t;
      },
      palette: PALETTE,
      viewport,
      quality,
      prng: stw.prng,
      assets: { ink: (nome) => `/viaggio/${nome}.webp` },
    };
    stw.ctx = ctx;

    let handle = {};
    if (stw.module) {
      try {
        handle = (await stw.module.init(ctx)) || {};
      } catch (err) {
        console.error(`[mondi] init di '${stw.slug}' fallito:`, err);
        stw.state = 'broken';
        stw.handle = {};
        return;
      }
    }
    stw.handle = handle;
    stw.state = 'live';

    // warm-up shader (§1.4): compila + 2-3 update a progress 0, senza render
    scheduleIdle(() => {
      if (stw.state !== 'live' || !stw.scene) return;
      try {
        renderer.compile(stw.scene, camera);
        if (stw.module) {
          warmFrame.time = timeS;
          for (let n = 0; n < 3; n++) stw.module.update(stw.handle, warmFrame);
        }
      } catch (e) { /* il warm-up non deve mai rompere il frame */ }
    });
  }

  function ensureLive(idx, urgent) {
    if (idx < 0 || idx > 9) return;
    const stw = worlds[idx];
    if (stw.state === 'live' || stw.state === 'loading' || stw.state === 'broken') return;
    if (stw.state === 'parked') { stw.state = 'live'; return; }
    // cold → init. MAI durante scroll veloce, salvo urgenza (mondo corrente).
    if (!urgent && Math.abs(vel) > 1.4) return;
    const start = () => { if (stw.state === 'cold') stw.initPromise = initWorld(stw); };
    if (urgent) start();
    else scheduleIdle(start, 200);
  }

  function disposeWorld(stw) {
    if (stw.state === 'cold' || stw.state === 'loading') return;
    try {
      if (stw.module && stw.handle) stw.module.dispose(stw.handle);
    } catch (err) {
      console.error(`[mondi] dispose di '${stw.slug}':`, err);
    }
    if (stw.plane) {
      stw.plane.geometry.dispose();
      if (stw.plane.material) stw.plane.material.dispose();
    }
    // difensivo: geometrie/materiali residui (le texture del cache condiviso
    // NON si toccano qui — le libera il refcount sotto)
    if (stw.scene) {
      stw.scene.traverse((o) => {
        if (o.geometry && o !== stw.plane) o.geometry.dispose();
        if (o.material && o !== stw.plane) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
      stw.scene.clear();
    }
    for (const k of stw.texKeys) cache.release(k);
    stw.texKeys = [];
    stw.scene = null;
    stw.plane = null;
    stw.handle = null;
    stw.ctx = null;
    stw.preloaded2 = false;
    stw.state = 'cold'; // ri-inizializzabile allo scroll-back
  }

  function lifecycle(curIdx, p, phase) {
    for (let j = 0; j <= 9; j++) {
      const stw = worlds[j];
      if (j === curIdx) {
        ensureLive(j, true);
      } else if (j === curIdx + 1) {
        ensureLive(j, false);
      } else if (j === curIdx - 1) {
        // resta renderizzabile nella finestra di varco (p ≤ 0.28),
        // poi parked; oltre p=0.5 del corrente → dispose (§3).
        // Se sta tornando indietro ed era già stato disposto → re-init.
        if (p <= 0.35) {
          if (stw.state === 'parked') stw.state = 'live';
          else if (stw.state === 'cold') ensureLive(j, false);
        } else if (stw.state === 'live') stw.state = 'parked';
        if (p > 0.5 && (stw.state === 'parked' || stw.state === 'live')) disposeWorld(stw);
      } else if (stw.state === 'live' || stw.state === 'parked') {
        disposeWorld(stw);
      }
    }
    // preload N+2 durante il dwell di N (§3): texture nel cache condiviso,
    // ref tenuta dall'engine (preloadKeys) e rilasciata alla destroy.
    if (phase === 'dwell' && curIdx + 2 <= 9) {
      const cur = worlds[curIdx];
      if (!cur.preloaded2) {
        cur.preloaded2 = true;
        const nn = worlds[curIdx + 2];
        const urls = [];
        if (nn.operaSources) urls.push(nn.operaSources);
        for (const u of nn.preloadUrls) urls.push(u);
        scheduleIdle(() => {
          for (const u of urls) {
            const key = cache.keyFor(u, quality.maxTexSize);
            if (preloadKeys.has(key)) continue;
            preloadKeys.add(key);
            cache.acquire(u, quality.maxTexSize).catch(() => { preloadKeys.delete(key); });
          }
        });
      }
    }
  }

  // ---- camera (§1.2, §1.3, §2.4) -------------------------------------------
  function poseCamera(idx, p) {
    const stw = worlds[idx];
    const hints = (stw.handle && stw.handle.cameraHints) || {};
    const par = touch ? 0 : 1;

    if (idx === 0) {
      // hero: binario dritto verso il core del vortice
      const D = clamp(hints.railDepth ?? 12, 3, 16);
      const e = easeInOutCubic(clamp01(p));
      _camPos.set(ptr.x * 0.18 * par, ptr.y * 0.12 * par, D + (1.2 - D) * e);
      _lookT.set(0, 0.1, -7);
    } else {
      const D = clamp(hints.railDepth ?? 12, 8, 16);
      const f = stw.fitD;
      const halfW = stw.planeW / 2;
      const narrow = viewport.aspect < 0.8;
      if (p < 0.34) {
        // avvicinamento: ease-out — l'opera cresce presto, poi si assesta
        const k = clamp01(p / 0.34);
        const t = 1 - Math.pow(1 - k, 2.4);
        _camPos.set(0, 0, f + (D - f) * (1 - t));
        _lookT.set(0, 0, 0);
      } else if (p < 0.66) {
        // dwell: quasi ferma — solo micro-drift ≤ 0.02u
        const drift = Math.sin(timeS * 0.4 + idx * 1.7) * 0.02;
        _camPos.set(Math.sin(timeS * 0.23 + idx) * 0.012, drift * 0.5, f + drift);
        _lookT.set(0, 0, 0);
      } else {
        // attraversamento + varco. Desktop: la camera SUPERA l'opera di lato.
        // Viewport stretti: binario quasi centrale e l'opera dissolve INTERA
        // (mai tagliata dal bordo — mandato "opere sempre intere").
        const e = clamp01((p - 0.66) / 0.34);
        const z = f - Math.pow(e, 1.35) * (f + 3.2);
        const lateral = narrow ? halfW * 0.3 : halfW + 0.9;
        const x = stw.side * lateral * smoothstep(0, 0.75, e);
        _camPos.set(x, 0.12 * e, z);
        const lk = smoothstep(0.15, 1, e);
        _lookT.set(stw.side * halfW * (narrow ? 0.2 : 0.6) * lk, 0, -9 * lk);
      }
      // parallasse pointer (±0.18u, solo desktop)
      _camPos.x += ptr.x * 0.18 * par;
      _camPos.y += ptr.y * 0.12 * par;
    }

    camera.position.copy(_camPos);
    camera.lookAt(_lookT);
    // tilt pointer ±1.2° + roll suggerito dal mondo (clampato ±3°)
    const roll = clamp(hints.roll ?? 0, -3, 3) * DEG2RAD;
    if (roll) camera.rotateZ(roll);
    if (par) {
      camera.rotateX(-ptr.y * 1.2 * DEG2RAD);
      camera.rotateY(-ptr.x * 1.2 * DEG2RAD);
    }
  }

  // ---- update sicuro dei moduli --------------------------------------------
  function updateWorld(stw, p, phase) {
    if (!stw.module || stw.state !== 'live') return;
    frame.progress = p;
    frame.phase = phase;
    try {
      stw.module.update(stw.handle, frame);
    } catch (err) {
      stw.errCount++;
      if (stw.errCount === 1) console.error(`[mondi] update di '${stw.slug}':`, err);
      if (stw.errCount > 30) { stw.state = 'broken'; }
    }
  }

  function renderScene(stw) {
    if (stw.scene) renderer.render(stw.scene, camera);
  }
  /** Su viewport stretti l'opera dissolve intera durante l'attraversamento. */
  function operaFade(stw, p) {
    const op = stw.plane && stw.plane.userData.opera;
    if (!op || !op.uniforms) return;
    let o = 1;
    if (viewport.aspect < 0.8 && p > 0.66) o = 1 - smoothstep(0.68, 0.8, p);
    op.uniforms.uOpacity.value = o;
  }
  function fxVignette(stw) {
    const fx = stw.handle && stw.handle.fx;
    return fx ? clamp(fx.vignette || 0, 0, 0.5) : 0;
  }

  // ---- resize ---------------------------------------------------------------
  function onResize() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    const aspect = vw / vh;
    camera.aspect = aspect;
    camera.fov = aspect < 0.8 ? 58 : 50; // §1.1
    camera.updateProjectionMatrix();
    const dprCap = BUDGETS[quality.tier].dpr;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    renderer.setPixelRatio(dpr);
    renderer.setSize(vw, vh, false);
    renderer.getDrawingBufferSize(_bufSize);
    veil.setSize(_bufSize.x, _bufSize.y);
    viewport.w = vw;
    viewport.h = vh;
    viewport.aspect = aspect;
    viewport.dpr = dpr;
    trackH = Math.max(track.getBoundingClientRect().height, vh + 1);
    // fine corsa REALE del documento (su mobile svh ≠ innerHeight): serve al
    // guard che forza la fase finale quando lo scroll è al massimo.
    const se = document.scrollingElement || document.documentElement;
    docMaxScroll = Math.max(1, se.scrollHeight - vh);
    for (const stw of worlds) {
      if (stw.plane) {
        stw.fitD = fitDistance(stw.planeW, stw.planeH, camera, fitFraction(stw));
      }
    }
  }

  // ---- pointer --------------------------------------------------------------
  function onPointerMove(e) {
    ptrTarget.x = clamp((e.clientX / vw) * 2 - 1, -1, 1);
    ptrTarget.y = clamp((e.clientY / vh) * 2 - 1, -1, 1);
  }

  // ---- snap gentile (§1.2, opzionale, solo desktop) -------------------------
  let snapping = false;
  let snapCooldown = 0;
  const snapEase = (k) => easeInOutCubic(k);
  function maybeSnap() {
    if (!snapEnabled || touch || snapping || menuOpen || snapCooldown > 0) return;
    const i = segRaw.index;
    const p = segRaw.p;
    if (i > 9) return;
    // fermo reale (stopT) O velocità nulla: una sosta in QUALSIASI punto del
    // segmento — anche in zona di transito — viene attratta al dwell più
    // vicino: mai lasciare l'utente davanti a un frame di passaggio vuoto.
    if (Math.abs(vel) >= 0.12 && stopT < 0.3) return;
    let ti = i;
    if (i === 0) {
      if (p <= 0.9) return; // l'hero non si abbandona da solo
      ti = 1;
    } else if (p > 0.85 && i < 9) {
      ti = i + 1; // oltre l'85% il dwell più vicino percettivamente è il prossimo
    }
    if (ti === i && Math.abs(p - 0.5) <= 0.02) return;
    const limit = Math.max(1, trackH - vh);
    const target = ((CUM[ti] + WEIGHTS[ti] * 0.5) / TOTAL_W) * limit;
    const distSeg = Math.abs((CUM[i] + WEIGHTS[i] * p) - (CUM[ti] + WEIGHTS[ti] * 0.5));
    snapping = true;
    lenis.scrollTo(target, {
      duration: clamp(0.5 + distSeg * 1.1, 0.55, 1.1),
      easing: snapEase,
      onComplete: () => { snapping = false; snapCooldown = 1.2; },
    });
  }
  function cancelSnap() {
    if (!snapping) return;
    snapping = false;
    snapCooldown = 0.8;
    lenis.scrollTo(lenis.scroll, { immediate: true });
  }

  // ---- menu -----------------------------------------------------------------
  let menuOpen = false;
  function onMenu(e) {
    menuOpen = !!(e.detail && e.detail.open);
    if (menuOpen) lenis.stop();
    else lenis.start();
  }

  // ---- eventi di fase -------------------------------------------------------
  let lastIdx = -1;
  let lastPhase = '';
  function emitPhase(idx, p, phase) {
    if (idx === lastIdx && phase === lastPhase) return;
    lastIdx = idx;
    lastPhase = phase;
    const slug = idx <= 9 ? worlds[idx].slug : 'coda';
    const detail = { slug, index: idx, p, phase };
    window.dispatchEvent(new CustomEvent('mondi:phase', { detail }));
    if (onPhase) onPhase(detail);
  }

  let cssG = -1;
  let cssHeroP = -1;
  function updateCssVars(G, idx, p) {
    if (Math.abs(G - cssG) > 0.004) {
      cssG = G;
      docEl.style.setProperty('--mondi-g', G.toFixed(3));
    }
    const heroP = idx === 0 ? p : 1;
    if (Math.abs(heroP - cssHeroP) > 0.004) {
      cssHeroP = heroP;
      docEl.style.setProperty('--mondi-hero-p', heroP.toFixed(3));
    }
  }

  // ---- debug ?debug=1 (§1.8) -----------------------------------------------
  let debugEl = null;
  let debugAcc = 0;
  const fpsRing = new Float32Array(30);
  let fpsIdx = 0;
  let fpsFill = 0;
  if (debug) {
    debugEl = document.createElement('div');
    debugEl.id = 'mondi-debug';
    debugEl.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:9999;pointer-events:none;' +
      "font:11px/1.5 'JetBrains Mono',monospace;color:#7fb9f0;" +
      'background:rgba(5,10,26,.72);padding:6px 9px;border-radius:4px;white-space:pre;';
    document.body.appendChild(debugEl);
  }
  function fpsAvg() {
    let sum = 0;
    for (let i = 0; i < fpsFill; i++) sum += fpsRing[i];
    return fpsFill ? fpsFill / sum : 60;
  }
  function updateDebug(idx, p, phase) {
    if (!debugEl) return;
    const info = renderer.info.render;
    const mem = cache.stats();
    let states = '';
    for (const w of worlds) states += w.slug.slice(0, 2) + ':' + w.state[0] + ' ';
    debugEl.textContent =
      `fps ${fpsAvg().toFixed(1)}  tier ${quality.tier}${tierDowngraded ? '↓' : ''}\n` +
      `seg ${idx} ${idx <= 9 ? worlds[idx].slug : 'coda'}  p ${p.toFixed(3)} ${phase}\n` +
      `calls ${info.calls}  tris ${(info.triangles / 1000).toFixed(1)}k\n` +
      `tex ${(mem.bytes / 1048576).toFixed(1)}MB (${mem.count})  glTex ${renderer.info.memory.textures}  geo ${renderer.info.memory.geometries}\n` +
      states;
  }

  // ---- auto-tier (§1.8): media dei primi 90 frame di scroll attivo ---------
  let tierDowngraded = false;
  let tierSamples = 0;
  let tierSum = 0;
  function autoTier(dt) {
    if (tierDowngraded || tierSamples >= 90) return;
    if (Math.abs(vel) < 0.05) return;
    if (dt > 0.04) return; // hitch di init/GC: non è colpa del tier
    tierSamples++;
    tierSum += dt;
    if (tierSamples === 90) {
      const avgFps = 90 / tierSum;
      if (avgFps < 45 && quality.tier !== 'low') {
        const next = quality.tier === 'high' ? 'mid' : 'low';
        console.warn(`[mondi] auto-tier: ${quality.tier} → ${next} (media ${avgFps.toFixed(1)}fps)`);
        quality.tier = next;
        quality.maxParticles = BUDGETS[next].maxParticles;
        quality.maxDrawCalls = BUDGETS[next].maxDrawCalls;
        quality.maxTexSize = BUDGETS[next].maxTexSize;
        tierDowngraded = true; // una sola volta, mai risalire (§1.8)
        onResize();
      }
    }
  }

  // ---- loop -----------------------------------------------------------------
  let rafId = 0;
  let running = false;
  let lastMs = 0;
  let destroyed = false;

  function loop(ms) {
    if (destroyed) return;
    rafId = requestAnimationFrame(loop);
    if (!lastMs) lastMs = ms;
    const dt = clamp((ms - lastMs) / 1000, 0.0001, 0.048); // dt clampato §1.2
    lastMs = ms;
    timeS += dt;
    if (snapCooldown > 0) snapCooldown -= dt;

    lenis.raf(ms);
    renderer.info.reset();

    // fps ring
    fpsRing[fpsIdx] = dt;
    fpsIdx = (fpsIdx + 1) % 30;
    if (fpsFill < 30) fpsFill++;

    // progress
    const limit = Math.max(1, trackH - vh);
    const scrollPos = lenis.scroll || window.scrollY || 0;
    // fermo reale: indipendente da vel (che dopo un jump può restare sporca)
    if (prevScrollPos >= 0 && Math.abs(scrollPos - prevScrollPos) < 0.5) stopT += dt;
    else stopT = 0;
    prevScrollPos = scrollPos;
    let G = clamp01(scrollPos / limit);
    // guard di fine corsa: allo scroll massimo REALE il viaggio DEVE essere in
    // fase finale (coda visibile) — mai un vicolo cieco su mobile.
    if (scrollPos >= Math.min(limit, docMaxScroll) - 8) G = 1;
    const sTarget = G * TOTAL_W;
    sSmooth = damp(sSmooth, sTarget, 6.5, dt); // doppio smoothing (Lenis + camera)
    // clamp del ritardo: dopo un salto lungo il mondo arriva entro ~1s,
    // non 3-8s dietro la scrollbar
    if (sSmooth < sTarget - 0.6) sSmooth = sTarget - 0.6;
    else if (sSmooth > sTarget + 0.6) sSmooth = sTarget + 0.6;
    const rawVel = (sTarget - sTargetPrev) / Math.max(dt, 1e-4);
    sTargetPrev = sTarget;
    vel = damp(vel, rawVel, 6, dt);

    // pointer smoothing (λ 3)
    ptr.x = damp(ptr.x, ptrTarget.x, 3, dt);
    ptr.y = damp(ptr.y, ptrTarget.y, 3, dt);

    segAtScaled(sSmooth, segSmooth);
    segAtScaled(sTarget, segRaw);

    const segIdx = segSmooth.index;         // 0..10
    const wIdx = Math.min(segIdx, 9);       // mondo renderizzato (coda → 9)
    const p = segIdx <= 9 ? segSmooth.p : 1;
    const phase = phaseOf(p);

    lifecycle(wIdx, p, phase);

    // frame condiviso
    frame.globalProgress = G;
    frame.time = timeS;
    frame.dt = dt;
    frame.velocity = vel;

    // ---- finestra di varco (§1.4): unione [0.66,1] di N e [0,0.34] di N+1 --
    // Allargata all'INTERO transito (exit+approach): mentre un mondo svanisce
    // il successivo è già in scena — nessuna posizione di scroll è un frame
    // morto (erano vuote le viewport a cavallo dei confini di mondo).
    let blendA = -1, blendB = -1, blendK = 0, pA = 0, pB = 0;
    if (segIdx <= 9) {
      if (p >= 0.66 && wIdx < 9) {
        blendA = wIdx; blendB = wIdx + 1;
        // curva sub-lineare: il mondo in arrivo si percepisce PRESTO
        blendK = Math.pow((p - 0.66) / 0.34, 0.7) * 0.5;
        pA = p; pB = 0;
      } else if (p <= 0.34 && wIdx >= 1) {
        blendA = wIdx - 1; blendB = wIdx;
        blendK = 0.5 + Math.pow(p / 0.34, 0.7) * 0.5;
        pA = 1; pB = p;
      }
    }

    // dissolvenza di coda: ultimo mondo → blu notte (§1.5)
    let codaAlpha = 0;
    if (segIdx === 9 && p >= 0.72) codaAlpha = ((p - 0.72) / 0.28) * 0.5;
    else if (segIdx === 10) codaAlpha = 0.5 + segSmooth.p * 0.5;

    const cur = worlds[wIdx];
    const bothLive =
      blendA >= 0 && renderable(worlds[blendA]) && renderable(worlds[blendB]);

    // ---- update + render ----------------------------------------------------
    if (bothLive && quality.tier !== 'low') {
      // varco a velo pieno: dual-RT a mezza risoluzione
      const A = worlds[blendA], B = worlds[blendB];
      updateWorld(A, pA, phaseOf(pA));
      updateWorld(B, pB, phaseOf(pB));
      operaFade(A, pA);
      operaFade(B, pB);
      poseCamera(blendA, pA);
      veil.beginA();
      renderScene(A);
      poseCamera(blendB, pB);
      veil.beginB();
      renderScene(B);
      veil.compose(blendK, veilColorFor(blendA), Math.max(fxVignette(A), fxVignette(B)));
    } else if (bothLive) {
      // tier low: velo semplice — una sola scena + quad colore, swap a k=0.5
      const showB = blendK >= 0.5;
      const S = worlds[showB ? blendB : blendA];
      const pS = showB ? pB : pA;
      updateWorld(S, pS, phaseOf(pS));
      operaFade(S, pS);
      poseCamera(showB ? blendB : blendA, pS);
      renderer.setRenderTarget(null);
      renderScene(S);
      const a = showB
        ? 1 - smoothstep(0.52, 0.9, blendK)
        : smoothstep(0.1, 0.48, blendK);
      veil.overlay(veilColorFor(blendA), a, fxVignette(S));
    } else if (renderable(cur)) {
      // scena singola diretta (nessun RT — il caso di gran lunga più frequente)
      updateWorld(cur, p, phase);
      operaFade(cur, p);
      poseCamera(wIdx, p);
      renderer.setRenderTarget(null);
      renderScene(cur);
      const vig = fxVignette(cur);
      if (vig > 0 || codaAlpha > 0) {
        veil.overlay(CODA_COLOR, smoothstep(0.1, 0.9, codaAlpha), vig);
        codaAlpha = 0; // già applicata
      }
    } else {
      // mondo non pronto (init in corso): mostra il VICINO ancora vivo — con
      // scroll rapido l'ingresso non dipende più dal timing dell'init (i frame
      // neri/navy piatti a metà viaggio). Solo in ultima istanza il colore.
      const prevW = wIdx >= 1 ? worlds[wIdx - 1] : null;
      const nextW = wIdx < 9 ? worlds[wIdx + 1] : null;
      const nb = prevW && renderable(prevW) ? prevW
        : nextW && renderable(nextW) ? nextW : null;
      renderer.setRenderTarget(null);
      if (nb) {
        const pN = nb.i < wIdx ? 0.9 : 0.08;
        updateWorld(nb, pN, phaseOf(pN));
        operaFade(nb, pN);
        poseCamera(nb.i, pN);
        renderScene(nb);
      } else {
        renderer.setClearColor(cur.loadingCol, 1);
        renderer.clear();
      }
    }
    if (codaAlpha > 0) veil.overlay(CODA_COLOR, smoothstep(0.1, 0.9, codaAlpha), 0);

    // ---- didascalie: DETERMINISTICHE quando l'opera è piena e ci si ferma ---
    // finestra [0.28, 0.66): apre appena l'opera è quasi centrata e resta
    // finché non inizia l'uscita. Mostra se la velocità è bassa OPPURE dopo
    // 0.8s di fermo reale (dopo un jump la vel smoothata può restare sporca:
    // la didascalia non deve dipendere da quella).
    if (
      segIdx >= 1 && segIdx <= 9 && p >= 0.28 && p < 0.66 &&
      renderable(cur) && cur.plane &&
      (Math.abs(vel) < 0.35 || stopT > 0.8)
    ) {
      showCaption(cur);
    } else {
      hideCaption();
    }

    emitPhase(segIdx, segIdx <= 9 ? p : segSmooth.p, segIdx <= 9 ? phase : 'exit');
    updateCssVars(G, segIdx, segSmooth.p);
    maybeSnap();
    autoTier(dt);

    if (debugEl) {
      debugAcc += dt;
      if (debugAcc > 0.25) {
        debugAcc = 0;
        updateDebug(segIdx, segIdx <= 9 ? p : segSmooth.p, phase);
      }
    }
  }

  function startLoop() {
    if (running || destroyed) return;
    running = true;
    lastMs = 0;
    rafId = requestAnimationFrame(loop);
  }
  function stopLoop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  // ---- listeners ------------------------------------------------------------
  const onVisibility = () => {
    if (document.hidden) stopLoop();
    else startLoop();
  };
  const onContextLost = (e) => {
    e.preventDefault();
    console.error('[mondi] WebGL context perso: torno al fallback statico');
    controller.destroy();
  };
  const cancelers = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  const onCancelInput = () => cancelSnap();

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  if (!touch) window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('vg:menu', onMenu);
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onContextLost);
  for (const ev of cancelers) window.addEventListener(ev, onCancelInput, { passive: true });

  // ---- avvio ----------------------------------------------------------------
  onResize();
  veil.warm();

  // init del mondo al segmento iniziale (reload a metà pagina compreso)
  {
    const limit = Math.max(1, trackH - vh);
    const G0 = clamp01((window.scrollY || 0) / limit);
    sSmooth = G0 * TOTAL_W;
    sTargetPrev = sSmooth;
    segAtScaled(sSmooth, segSmooth);
    const first = Math.min(segSmooth.index, 9);
    const stw = worlds[first];
    stw.initPromise = initWorld(stw);
    await stw.initPromise; // primo frame mai vuoto
    ensureLive(Math.min(first + 1, 9), false);
  }

  // il CSS nasconde il fallback statico e mostra canvas+captions
  docEl.classList.add('js-mondi');
  startLoop();

  // ---- controller -----------------------------------------------------------
  const state = {
    get index() { return segSmooth.index; },
    get p() { return segSmooth.p; },
    get slug() { return segSmooth.index <= 9 ? worlds[segSmooth.index].slug : 'coda'; },
    get phase() { return phaseOf(segSmooth.p); },
    get velocity() { return vel; },
  };

  const controller = {
    lenis,
    renderer,
    camera,
    quality,
    state,
    segmentOf,
    /** scroll fluido al centro (p=0.5) di un mondo, per slug o indice. */
    goTo(slugOrIndex) {
      const idx = typeof slugOrIndex === 'number' ? slugOrIndex : ORDER.indexOf(slugOrIndex);
      if (idx < 0 || idx > 9) return;
      const limit = Math.max(1, trackH - vh);
      lenis.scrollTo(((CUM[idx] + WEIGHTS[idx] * 0.5) / TOTAL_W) * limit, { duration: 1.2 });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('vg:menu', onMenu);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      for (const ev of cancelers) window.removeEventListener(ev, onCancelInput);
      hideCaption();
      for (const stw of worlds) disposeWorld(stw);
      for (const k of preloadKeys) cache.release(k);
      preloadKeys.clear();
      cache.disposeAll();
      veil.dispose();
      lenis.destroy();
      renderer.dispose();
      if (debugEl && debugEl.parentNode) debugEl.parentNode.removeChild(debugEl);
      docEl.classList.remove('js-mondi');
      docEl.style.removeProperty('--mondi-g');
      docEl.style.removeProperty('--mondi-hero-p');
      if (window.__MONDI__ === controller) window.__MONDI__ = null;
    },
  };

  window.__MONDI__ = controller;
  return controller;
}
