// brama — holoface.js
// Sfondo dello stato "dentro": un volto olografico raymarched (SDF, asset-free),
// stilizzato come android femminile — testa ovale, capelli a caschetto, occhi
// grandi con iride/pupilla, labbra e collo slanciato — che segue il cursore con
// la testa (yaw/pitch/roll) e con lo sguardo (occhi indipendenti). Quando il
// puntatore è fermo (o su touch) prende vita da sola: ondeggio, battiti di
// ciglia, micro-espressioni. Un solo contesto WebGL nuovo (oltre a vertigine.js,
// che viene messo in pausa da intro.js).
// Nessun Math.random non seedato: la schedulazione di blink/espressioni usa un
// PRNG seedato (mulberry32); l'ondeggio idle è somma di seni deterministica su uTime.

import * as THREE from 'three';

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const clampN = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutQuad = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

// PRNG deterministico (mulberry32) — seed fisso: la schedulazione di blink ed
// espressioni segue sempre la stessa sequenza pseudo-casuale, riproducibile.
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

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform vec2  uRes;
uniform vec2  uHead;       // yaw, pitch (radianti, smorzati)
uniform vec2  uGaze;       // -1..1, smorzato piu' veloce della testa
uniform float uReveal;     // 0..1 materializzazione legata allo scroll
uniform vec2  uFaceCenter; // centro del volto in uv-space (dipende dal layout)
uniform float uFaceFov;    // "zoom" del volto (piu' alto = piu' piccolo)
uniform float uRoll;       // leggero tilt della testa (curiosita'/idle)
uniform float uBlink;      // 0 occhi aperti .. 1 chiusi
uniform float uSmile;      // 0..1 sorriso lieve
uniform float uBrowL;      // 0..1 sopracciglio sinistro alzato
uniform float uBrowR;      // 0..1 sopracciglio destro alzato

const int MAX_STEPS = __MAX_STEPS__;

float hash11(float x){ return fract(sin(x*127.1)*43758.5453123); }
float hash21(vec2 p){
  p = fract(p*vec2(123.34,456.21));
  p += dot(p, p+45.32);
  return fract(p.x*p.y);
}

float sdSphere(vec3 p, float r){ return length(p) - r; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){
  vec3 pa = p-a, ba = b-a;
  float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
  return length(pa - ba*h) - r;
}
// ellissoide (approssimazione di IQ, sufficientemente precisa per shading+normali)
float sdEllipsoid(vec3 p, vec3 r){
  float k0 = length(p/r);
  float k1 = length(p/(r*r));
  return k0*(k0-1.0)/max(k1, 1e-5);
}
float sdRoundBox(vec3 p, vec3 b, float r){
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}
float smin(float a, float b, float k){
  float h = clamp(0.5+0.5*(b-a)/k, 0.0, 1.0);
  return mix(b,a,h) - k*h*(1.0-h);
}
float smax(float a, float b, float k){ return -smin(-a,-b,k); }

mat2 rot2(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }

// distanza + id materiale: 0 pelle (testa/mento/collo), 1 occhi (mandorla,
// iride/pupilla disegnate nello shading), 4 collare luminoso, 5 capelli.
// Testa ovale morbida (non piu' un droide squadrato): cranio+mento a
// ellissoidi fusi, capelli a caschetto + due ciocche laterali fluide.
vec2 mapScene(vec3 sp, vec2 gazeOffset){
  vec3 qp = vec3(abs(sp.x), sp.y, sp.z); // simmetria bilaterale: una meta' sola

  vec3 skullP = sp - vec3(0.0, 0.135, 0.0);
  float skull = sdEllipsoid(skullP, vec3(0.222, 0.235, 0.230));
  vec3 jawP = sp - vec3(0.0, -0.065, 0.018);
  float jaw = sdEllipsoid(jawP, vec3(0.148, 0.118, 0.185));
  float head = smin(skull, jaw, 0.06);

  // collo slanciato, femminile — corto quanto basta per non sembrare un tubo
  float neck = sdCapsule(sp, vec3(0.0, -0.185, -0.008), vec3(0.0, -0.375, -0.022), 0.062);
  head = smin(head, neck, 0.045);

  // naso: un unico rigonfiamento morbido (niente ponte lineare, che a
  // quest'incidenza leggeva come una cucitura/graffio) fuso ampiamente
  // nel viso — basta un accenno di volume per leggere "umano".
  float noseTip = sdSphere(sp - vec3(0.0, 0.008, 0.230), 0.027);
  head = smin(head, noseTip, 0.062);

  // labbra in rilievo (non solo un decalcomania di colore): un piccolo volume
  // morbido fuso nel mento, cosi' prendono luce/ombra come labbra vere.
  float lips = sdEllipsoid(sp - vec3(0.0, -0.086, 0.199), vec3(0.052, 0.017, 0.015));
  head = smin(head, lips, 0.020);

  // incavo a mandorla per gli occhi (scavato nella pelle, bordo morbido: niente
  // bulbi da insetto ne' cornici da occhiali — la "piastra" sotto e' piatta)
  float eyeCut = sdRoundBox(qp - vec3(0.093, 0.145, 0.195), vec3(0.072, 0.046, 0.075), 0.040);
  head = smax(head, -(eyeCut - 0.006), 0.024);

  // capelli: massa posteriore (caschetto) fusa con le ciocche laterali in
  // un'unica chioma, poi fusa anch'essa nella pelle all'attaccatura (smin,
  // non un min secco) cosi' non sembra un casco separato dalla testa.
  float hairBack = sdEllipsoid(sp - vec3(0.0, 0.180, -0.065), vec3(0.272, 0.270, 0.165));
  float lockUpper = sdCapsule(qp, vec3(0.185, 0.255, 0.08), vec3(0.232, -0.01, 0.04), 0.044);
  float lockLower = sdCapsule(qp, vec3(0.232, -0.01, 0.04), vec3(0.245, -0.26, -0.005), 0.023);
  float locks = smin(lockUpper, lockLower, 0.032);
  float hair = smin(hairBack, locks, 0.08);

  float headOnly = head;
  head = smin(head, hair, 0.095);

  float d = head; float id = (hair < headOnly) ? 5.0 : 0.0;

  // piastra piatta sul fondo dell'incavo (bordi morbidi, quasi a mandorla):
  // e' qui che si disegnano iride/pupilla
  float eyePlate = sdRoundBox(qp - vec3(0.093, 0.145, 0.184), vec3(0.050, 0.029, 0.010), 0.028);
  if (eyePlate < d) { d = eyePlate; id = 1.0; }

  // collare luminoso alla base del collo (dettaglio "assistente/AI")
  vec3 cp = sp - vec3(0.0, -0.40, -0.015);
  float ring = length(vec2(length(cp.xz) - 0.095, cp.y)) - 0.011;
  if (ring < d) { d = ring; id = 4.0; }

  return vec2(d, id);
}

vec3 calcNormal(vec3 p, vec2 go){
  vec2 e = vec2(0.0009, 0.0);
  return normalize(vec3(
    mapScene(p+e.xyy, go).x - mapScene(p-e.xyy, go).x,
    mapScene(p+e.yxy, go).x - mapScene(p-e.yxy, go).x,
    mapScene(p+e.yyx, go).x - mapScene(p-e.yyx, go).x
  ));
}

float lineMask(float x, float freq, float w){
  float f = fract(x*freq);
  float d = min(f, 1.0-f);
  return smoothstep(w, 0.0, d);
}

void main(){
  vec2 uv = vUv - 0.5;
  uv.x *= uRes.x / max(uRes.y, 1.0);

  // ---- rumore di glitch a righe, raro e deterministico su uTime ----
  float rowSeed = hash11(floor(vUv.y*90.0) + floor(uTime*1.7)*13.7);
  float glitchOn = step(0.982, rowSeed) * clamp(uReveal*3.0, 0.0, 1.0);
  uv.x += (hash11(floor(uTime*1.7)*4.1) - 0.5) * 0.05 * glitchOn;

  // il volto vive in una zona propria dello schermo: centro e "zoom" arrivano
  // da JS (uFaceCenter/uFaceFov) e dipendono dal layout (di fianco al menu in
  // landscape, sopra al menu in portrait/mobile) — vedi computeLayout() in JS.
  vec2 fuv = (uv - uFaceCenter) * uFaceFov;
  fuv = rot2(uRoll) * fuv; // leggero tilt (curiosita' / idle)

  vec3 ro = vec3(0.0, 0.04, 2.5);
  vec3 rd = normalize(vec3(fuv, -1.0));

  // yaw/pitch: la testa deve girare VERSO il cursore (mouse a sinistra →
  // guarda a sinistra). Ruotare la camera per +angolo fa apparire la scena
  // ruotata dal lato OPPOSTO: si inverte il segno cosi' la testa punta dove
  // punta il mouse (verificato via screenshot, vedi nota in initHoloface).
  float yaw = -uHead.x;
  float pitch = -uHead.y;
  mat2 ry = rot2(yaw);
  ro.xz = ry * ro.xz; rd.xz = ry * rd.xz;
  mat2 rx = rot2(pitch);
  ro.yz = rx * ro.yz; rd.yz = rx * rd.yz;

  vec2 gazeOffset = uGaze;

  // bounding sphere: marcia solo se serve
  float b = dot(ro, rd);
  float c = dot(ro, ro) - 1.55*1.55;
  float h = b*b - c;

  bool hitFace = false;
  float matId = 0.0;
  vec3 hitPos = vec3(0.0);
  vec3 nrm = vec3(0.0, 0.0, 1.0);

  if (h > 0.0) {
    float t = max(-b - sqrt(h), 0.0);
    for (int i = 0; i < MAX_STEPS; i++) {
      vec3 p = ro + rd * t;
      vec2 m = mapScene(p, gazeOffset);
      if (m.x < 0.0007) { hitFace = true; matId = m.y; hitPos = p; break; }
      t += m.x;
      if (t > 4.2) break;
    }
    if (hitFace) nrm = calcNormal(hitPos, gazeOffset);
  }

  vec3 col;

  if (hitFace) {
    float ndotv = clamp(dot(nrm, -rd), 0.0, 1.0);
    vec3 lightDir = normalize(vec3(0.35, 0.55, 0.75));
    float diff = clamp(dot(nrm, lightDir), 0.0, 1.0);

    float fresA = pow(1.0-ndotv, 2.0);
    float fresB = pow(1.0-ndotv, 3.6);

    vec3 base = vec3(0.045, 0.075, 0.14) + vec3(0.05,0.09,0.16)*diff;
    vec3 rim  = vec3(0.16*fresB, 0.55*fresA, 0.95*fresA);

    float wire = max(lineMask(hitPos.y, 5.0, 0.05), lineMask(hitPos.x, 5.0, 0.05));
    wire *= smoothstep(0.05, 0.35, ndotv);

    float scan = 0.88 + 0.12*sin(hitPos.y*46.0 - uTime*2.2);

    col = (base + rim) * scan + vec3(0.35,0.7,1.0)*wire*0.28;
    float frontGate = smoothstep(0.0, 0.08, hitPos.z);

    if (matId > 0.5 && matId < 1.5) {
      // occhi: iride/pupilla seguono uGaze, palpebra chiude dall'alto con uBlink
      float eyeSign = sign(hitPos.x);
      vec2 eyeC = vec2(eyeSign*0.093, 0.145);
      vec2 local = (hitPos.xy - eyeC) / vec2(0.050, 0.029);
      vec2 pupilLocal = local - gazeOffset*0.40;

      float distIris = length(pupilLocal);
      float irisMask = smoothstep(0.62, 0.48, distIris);
      float pupilMask = smoothstep(0.26, 0.15, distIris);
      float scleraMask = smoothstep(1.08, 0.82, length(local));

      float openAmount = 1.0 - uBlink;
      float lidY = mix(-1.3, 1.3, openAmount);
      float lidMask = 1.0 - smoothstep(lidY - 0.10, lidY + 0.10, local.y);
      float lidEdgeGlow = smoothstep(0.10, 0.0, abs(local.y - lidY)) * scleraMask;

      vec3 sclera = vec3(0.50, 0.80, 1.0) * 0.80;
      float shimmer = 0.5 + 0.5*sin(uTime*0.55 + eyeSign*2.1);
      vec3 iris = mix(vec3(0.14,0.38,0.85), vec3(0.38,0.78,1.05), shimmer);
      vec3 pupil = vec3(0.02,0.035,0.07);
      float sparkle = smoothstep(0.085, 0.0, length(pupilLocal - vec2(-0.20,0.24)));

      vec3 eyeCol = sclera;
      eyeCol = mix(eyeCol, iris, irisMask);
      eyeCol = mix(eyeCol, pupil, pupilMask);
      eyeCol += vec3(1.0) * sparkle * 0.9;
      eyeCol += vec3(0.4,0.8,1.0) * lidEdgeGlow * 0.6;

      vec3 lidSkin = base*1.3 + rim*0.4;
      vec3 eyeFinal = mix(lidSkin, eyeCol, scleraMask);
      eyeFinal = mix(lidSkin, eyeFinal, lidMask);
      col = eyeFinal;
    } else if (matId > 3.5 && matId < 4.5) {
      col = vec3(0.3,0.75,1.05) * (1.3 + 0.4*sin(uTime*3.0));
    } else if (matId > 4.5) {
      // capelli: tinta piu' profonda/indaco, "flow lines" al posto del wire
      float flow = lineMask(hitPos.y*7.0 + sin(hitPos.x*3.0 + uTime*0.15)*1.4, 1.0, 0.10);
      vec3 hairBase = vec3(0.03,0.035,0.09) + vec3(0.05,0.06,0.14)*diff;
      vec3 hairRim  = vec3(0.20*fresB, 0.35*fresA, 0.85*fresA);
      col = (hairBase + hairRim) * scan + vec3(0.3,0.45,0.95)*flow*0.35;
    } else {
      // pelle: sopracciglia (uBrowL/uBrowR alzano ed inarcano) + labbra (uSmile
      // solleva gli angoli). Decorazioni "disegnate" sopra la shading di base.
      float bx = (abs(hitPos.x) - 0.093) / 0.062;
      float browSide = hitPos.x < 0.0 ? uBrowL : uBrowR;
      float browBaseY = 0.208;
      float browY = browBaseY + browSide*0.048 + 0.014*(1.0 - bx*bx);
      float browGlow = smoothstep(0.011, 0.0, abs(hitPos.y - browY))
                      * smoothstep(1.05, 0.80, abs(bx)) * frontGate;
      col = mix(col, vec3(0.55,0.85,1.05)*1.2, browGlow*0.75);

      float mx = clamp(hitPos.x / 0.072, -1.3, 1.3);
      float mouthBaseY = -0.085;
      float mouthY = mouthBaseY - uSmile*0.008 + uSmile*0.040*(mx*mx);
      float lipGlow = smoothstep(0.020, 0.0, abs(hitPos.y - mouthY))
                     * smoothstep(1.15, 0.90, abs(mx)) * frontGate;
      col = mix(col, vec3(0.95,0.55,0.72)*0.95 + rim*0.3, lipGlow*0.8);
    }

    col += rim * 0.5; // chromatic-ish rim boost
  } else {
    float vign = smoothstep(1.15, 0.15, length(uv));
    vec3 bg = mix(vec3(0.020,0.032,0.075), vec3(0.038,0.075,0.185), clamp(0.55-uv.y*0.35,0.0,1.0));

    float grid = lineMask(uv.x, 13.0, 0.018) + lineMask(uv.y, 13.0, 0.018);
    bg += vec3(0.09,0.19,0.34) * grid * 0.10;

    vec2 gv = uv*9.0;
    vec2 gi = floor(gv);
    vec2 gf = fract(gv) - 0.5;
    float hh = hash21(gi);
    float star = 0.0;
    if (hh > 0.87) {
      float tw = 0.5 + 0.5*sin(uTime*1.3 + hh*28.0);
      vec2 jitter = (vec2(hash21(gi+3.1), hash21(gi+7.7)) - 0.5) * 0.5;
      star = smoothstep(0.11, 0.0, length(gf - jitter)) * tw;
    }
    bg += vec3(0.45,0.75,1.0) * star * 0.55;

    col = bg * vign;
  }

  // ---- wipe di materializzazione legato a --p (uReveal) ----
  // la linea di scansione scende dall'alto verso il basso: sopra = gia'
  // risolto, sotto = non ancora raggiunto dallo scan (rumore). edge0<edge1
  // sempre, cosi' smoothstep resta ben definito anche a uReveal=1.
  float sweepY = mix(0.68, -0.68, uReveal);
  float revealed = smoothstep(sweepY - 0.05, sweepY + 0.05, uv.y);
  float edge = smoothstep(0.06, 0.0, abs(uv.y - sweepY));
  float n = hash21(uv*300.0 + uTime*2.0);
  vec3 noiseCol = vec3(n*0.22, n*0.30, n*0.42) * (1.0 - revealed);
  col = mix(noiseCol, col, revealed);
  col += vec3(0.4,0.8,1.0) * edge * 1.1;

  gl_FragColor = vec4(col, 1.0);
}
`;

// ---- sequenza idle: neutra → sorriso lieve → curiosa (sopracciglio alzato,
// leggero tilt) → sguardo di lato → ritorno. Le durate hanno un piccolo jitter
// seedato cosi' il ciclo non sembra un loop meccanico. ----
const IDLE_STATES = [
  { smile: 0.00, browL: 0.00, browR: 0.00, roll: 0.000, lookX: 0.00, lookY: 0.00, dur: 2.6 },
  { smile: 0.85, browL: 0.05, browR: 0.05, roll: 0.012, lookX: 0.10, lookY: 0.03, dur: 2.1 },
  { smile: 0.20, browL: 0.95, browR: 0.30, roll: 0.062, lookX: -0.18, lookY: 0.14, dur: 2.3 },
  { smile: 0.15, browL: 0.10, browR: 0.10, roll: -0.05, lookX: 0.82, lookY: -0.06, dur: 2.0 },
];

export function initHoloface() {
  const canvas = document.getElementById('holoface');
  if (!canvas) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    canvas.style.display = 'none';
    return;
  }

  const isCoarse = matchMedia('(pointer: coarse)').matches || innerWidth < 760;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
  } catch (e) {
    canvas.style.display = 'none';
    return;
  }
  const gl = renderer.getContext && renderer.getContext();
  if (!gl) {
    canvas.style.display = 'none';
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x050a1a, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.Camera(); // non usata: il fragment costruisce i raggi da solo
  const geo = new THREE.PlaneGeometry(2, 2);

  const uniforms = {
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uHead: { value: new THREE.Vector2(0, 0) },
    uGaze: { value: new THREE.Vector2(0, 0) },
    uReveal: { value: 0 },
    uFaceCenter: { value: new THREE.Vector2(0, 0.285) },
    uFaceFov: { value: 2.05 },
    uRoll: { value: 0 },
    uBlink: { value: 0 },
    uSmile: { value: 0 },
    uBrowL: { value: 0 },
    uBrowR: { value: 0 },
  };

  const fragSource = FRAG.replace('__MAX_STEPS__', isCoarse ? '72' : '130');

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: fragSource,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(geo, mat);
  scene.add(quad);

  // ---- layout: di fianco al menu in landscape/desktop, sopra al menu in
  // portrait/mobile (impilati). Un'unica funzione decide sia il posizionamento
  // CSS del pannello .hub (via classi su <html>) sia il centro/fov del volto
  // nello shader, cosi' i due non possono mai divergere. ----
  const faceScreenPx = { x: innerWidth * 0.5, y: innerHeight * 0.24 };
  const root = document.documentElement;

  function computeLayout() {
    const w = innerWidth, hh = innerHeight;
    const aspect = w / Math.max(hh, 1);
    const side = w >= 760 && aspect > 1.05;

    let fracX, fracTop, fov;
    if (side) {
      fracX = 0.225; fracTop = 0.50; fov = 0.62;
    } else {
      fracX = 0.50; fracTop = 0.28; fov = 1.28;
    }

    uniforms.uFaceCenter.value.set((fracX - 0.5) * aspect, 0.5 - fracTop);
    uniforms.uFaceFov.value = fov;
    faceScreenPx.x = fracX * w;
    faceScreenPx.y = fracTop * hh;

    root.classList.toggle('layout-side', side);
    root.classList.toggle('layout-stack', !side);
  }

  function resize() {
    const w = innerWidth, hh = innerHeight;
    renderer.setSize(w, hh, false);
    uniforms.uRes.value.set(w * dpr, hh * dpr);
    computeLayout();
  }
  resize();
  addEventListener('resize', resize);

  // ---- input: il target di rotazione e' relativo alla posizione SCHERMO del
  // volto (faceScreenPx), non al centro della finestra — cosi' quando il volto
  // e' spostato di lato (layout "side") e il cursore e' lontano, la testa gira
  // di piu' (esattamente come guarderebbe un personaggio li' posizionato). ----
  let targetX = 0, targetY = 0;
  let lastMoveAt = performance.now();
  function setTarget(cx, cy) {
    targetX = clampN((cx - faceScreenPx.x) / (innerWidth * 0.5), -1, 1);
    targetY = clampN((faceScreenPx.y - cy) / (innerHeight * 0.5), -1, 1);
    lastMoveAt = performance.now();
  }
  addEventListener('pointermove', (e) => setTarget(e.clientX, e.clientY), { passive: true });
  addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) setTarget(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  // escursione massima di yaw/pitch quando si segue il cursore: piu' ampia di
  // prima cosi' la testa si muove parecchio quando il puntatore e' lontano.
  const HEAD_YAW_MAX = 0.615;   // ~35.2°
  const HEAD_PITCH_MAX = 0.555; // ~31.8°

  // ---- PRNG seedato: schedulazione di blink ed espressioni idle ----
  const rng = mulberry32(0xB2A44A17);

  let nextBlinkAt = 1.3 + rng() * 1.6;
  let blinkStart = -10;
  function blinkEnvelope(t) {
    const closeDur = 0.10, holdDur = 0.045, openDur = 0.16;
    if (t < 0) return 0;
    if (t < closeDur) return easeInOutQuad(t / closeDur);
    if (t < closeDur + holdDur) return 1;
    if (t < closeDur + holdDur + openDur) return 1 - easeInOutQuad((t - closeDur - holdDur) / openDur);
    return 0;
  }
  function updateBlink(elapsed) {
    if (elapsed >= nextBlinkAt) {
      blinkStart = elapsed;
      nextBlinkAt = elapsed + 2.3 + rng() * 3.2;
    }
    return blinkEnvelope(elapsed - blinkStart);
  }

  let idleStateIdx = 0;
  let idleStateElapsed = 0;
  let idleStateDur = IDLE_STATES[0].dur;
  const idleCur = { smile: 0, browL: 0, browR: 0, roll: 0, lookX: 0, lookY: 0 };
  function updateIdleExpression(dt) {
    idleStateElapsed += dt;
    if (idleStateElapsed > idleStateDur) {
      idleStateIdx = (idleStateIdx + 1) % IDLE_STATES.length;
      idleStateElapsed = 0;
      idleStateDur = IDLE_STATES[idleStateIdx].dur * (0.85 + rng() * 0.3);
    }
    const target = IDLE_STATES[idleStateIdx];
    idleCur.smile = lerp(idleCur.smile, target.smile, 0.035);
    idleCur.browL = lerp(idleCur.browL, target.browL, 0.035);
    idleCur.browR = lerp(idleCur.browR, target.browR, 0.035);
    idleCur.roll = lerp(idleCur.roll, target.roll, 0.035);
    idleCur.lookX = lerp(idleCur.lookX, target.lookX, 0.028);
    idleCur.lookY = lerp(idleCur.lookY, target.lookY, 0.028);
  }

  // piccolo ondeggio continuo (idle sway), funzione deterministica del tempo:
  // somma di seni a frequenze incommensurabili, niente rumore casuale.
  function idleSway(t) {
    return {
      x: Math.sin(t * 0.37) * 0.10 + Math.sin(t * 0.131 + 1.7) * 0.05,
      y: Math.sin(t * 0.29 + 0.6) * 0.055 + Math.sin(t * 0.107 + 2.3) * 0.03,
    };
  }

  let headYaw = 0, headPitch = 0, gazeX = 0, gazeY = 0;
  let rollVal = 0, smileVal = 0, browLVal = 0, browRVal = 0;
  let idleBlend = 0;
  let elapsedTime = 0;
  const clock = new THREE.Clock();
  let raf = 0;
  let alive = true;

  function getP() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--p');
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;

    const dt = Math.min(clock.getDelta(), 0.05);
    elapsedTime += dt;

    const p = getP();
    // il wipe di materializzazione (scanline che rivela il volto) parte
    // subito dopo il lampo del nucleo (.vortex-flash, culmine p=0.365) cosi'
    // il volto sembra emergere dalla luce dell'attraversamento.
    const reveal = clamp01((p - 0.36) / 0.30);
    uniforms.uReveal.value = reveal;
    uniforms.uTime.value = elapsedTime;

    // idle: da 1.5s senza pointermove (o sempre, su touch/coarse) la testa
    // prende vita da sola; altrimenti segue il cursore.
    const msSinceMove = performance.now() - lastMoveAt;
    const idleRaw = isCoarse ? 1 : clamp01((msSinceMove - 1500) / 650);
    idleBlend = lerp(idleBlend, idleRaw, 0.045);

    updateIdleExpression(dt);
    const sway = idleSway(elapsedTime);
    const idleTX = clampN(idleCur.lookX + sway.x, -1, 1);
    const idleTY = clampN(idleCur.lookY + sway.y, -1, 1);

    const finalTX = lerp(targetX, idleTX, idleBlend);
    const finalTY = lerp(targetY, idleTY, idleBlend);

    headYaw = lerp(headYaw, finalTX * HEAD_YAW_MAX, 0.08);
    headPitch = lerp(headPitch, finalTY * HEAD_PITCH_MAX, 0.08);
    gazeX = lerp(gazeX, finalTX, 0.22);
    gazeY = lerp(gazeY, finalTY, 0.22);
    uniforms.uHead.value.set(headYaw, headPitch);
    uniforms.uGaze.value.set(gazeX, gazeY);

    rollVal = lerp(rollVal, idleCur.roll * idleBlend, 0.05);
    smileVal = lerp(smileVal, idleCur.smile * idleBlend, 0.045);
    browLVal = lerp(browLVal, idleCur.browL * idleBlend, 0.045);
    browRVal = lerp(browRVal, idleCur.browR * idleBlend, 0.045);
    uniforms.uRoll.value = rollVal;
    uniforms.uSmile.value = smileVal;
    uniforms.uBrowL.value = browLVal;
    uniforms.uBrowR.value = browRVal;

    // qualche blink anche mentre si segue il cursore, non solo in idle.
    uniforms.uBlink.value = updateBlink(elapsedTime);

    if (p > 0.015) {
      renderer.render(scene, camera);
    }
  }
  raf = requestAnimationFrame(frame);

  addEventListener('pagehide', () => {
    alive = false;
    if (raf) cancelAnimationFrame(raf);
    geo.dispose();
    mat.dispose();
    renderer.dispose();
  });
}

initHoloface();
