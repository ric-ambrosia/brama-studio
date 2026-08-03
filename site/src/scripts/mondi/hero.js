// ─────────────────────────────────────────────────────────────────────────────
// MONDI · hero.js — ambiente "soglia" (segmento 0)
// Vortice della v1 (deploy/vertigine.js) portato su GPU come imbuto 3D di
// Points + farfalla di vetro iridescente (identità ButterflyGlass/Ink v1).
// Contratto: content-notes/mondi-architettura.md §2 e §5.
//
// - Nessun Math.random: SOLO ctx.prng (seedato dall'engine) e noise derivato.
// - update() non alloca: tutti i temporanei sono pre-allocati in init.
// - Draw calls: backdrop 1 + points 1 + claw 1 + core 1 + corpo 1 + ali 2 = 7.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

// Nessuna texture esterna da precaricare (la texture delle ali è baked in init).
export const preload = [];

// ── PARAMETRI ESPOSTI (tunabili dall'integratore senza toccare il resto) ────
export const PARAMS = {
  railDepth: 12,                 // D del binario camera dichiarato dal mondo (§2.4)
  ramp: { durationS: 2.6 },      // startup spin-up v1 (easeInOutCubic)
  vortex: {
    counts: { high: 10000, mid: 5000, low: 2000 },
    shardShare: 0.28,            // 28% schegge rosse, 72% water (v1)
    foamShare: 0.18,             // quota di water color schiuma (v1)
    maxRadius: 5.2,              // raggio esterno dell'imbuto (unità mondo)
    depth: 7.0,                  // profondità dell'imbuto (z −1.2 → −8.2)
    depthOpen: 4.5,              // profondità extra quando il varco si apre (p>0.8)
    swirl: 2.6,                  // avvitamento angolare verso il centro (rad)
    tilt: -0.24,                 // inclinazione "ciotola vista in scorcio" (v1 squash)
    clawArms: 9,                 // bracci claw-streak (v1)
    clawSpin: 0.55,              // velocità rotazione oraria dei bracci
    coreColor: 0xd2ebf8,         // core celeste v1
    speedBoostClick: 2.2,        // spinta al click (v1: +4 su base 6 → qui scala ridotta)
    speedBoostMax: 4.0,
    boostDecay: 0.012,           // decadimento per-frame @60fps (identico feeling v1)
    shockDecay: 2.2,             // decadimento esponenziale ampiezza shockwave (1/s)
    pointerForce: 1.0,           // moltiplicatore deflessione pointer
  },
  butterfly: {
    scale: 0.6,                  // scala complessiva (≈0.9u di apertura alare)
    camDistance: 3.4,            // distanza dell'ancora davanti alla camera
    driftAmp: [0.45, 0.3, 0.22], // ampiezze Lissajous (≤ ±0.6u, §5.2)
    pointerRange: [0.6, 0.45],   // spostamento max verso il pointer (x, y)
    followLambda: 3.0,           // damping inseguimento posizione
    pointerLambda: 2.5,          // damping virata verso il pointer (§5.2)
    flapBaseHz: 0.9,             // frequenza base battito (§5.2)
    corePos: [0, 0.15, -6.8],    // punto del core in cui si invola
  },
  colors: {
    blues: [0x0a1a3d, 0x142a66, 0x1f49a8, 0x2c6fd1, 0x4a93e6, 0x7fb9f0], // v1
    foam: 0xf0f4ff,
    reds: [0xa31818, 0xc8281c, 0xe64a2a, 0x7a1010],                       // v1
    backdropInner: 0x040817,
    backdropOuter: 0x101f42,
    irid: [0x4a93e6, 0x8b6de7, 0xd7b36a], // azzurro → viola → oro tenue
  },
};

const TWO_PI = Math.PI * 2;

// ── noise 1D seedato (value-noise con tabella da prng — niente Math.random) ──
function makeNoise1D(prng) {
  const T = new Float32Array(256);
  for (let i = 0; i < 256; i++) T[i] = prng();
  return function noise(x) {
    const xf = Math.floor(x);
    const xi = xf & 255;
    const f = x - xf;
    const u = f * f * (3 - 2 * f);
    const a = T[xi];
    const b = T[(xi + 1) & 255];
    return a + (b - a) * u; // 0..1
  };
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function easeInOutCubic(k) {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHADERS
// ─────────────────────────────────────────────────────────────────────────────

const VORTEX_VERT = /* glsl */ `
attribute float aSeed;
attribute float aPhase;
attribute float aOmega;
attribute float aPull;
attribute float aSize;
attribute float aStreak;
attribute float aSpecies;   // 0 = water, 1 = shard
attribute vec3  aColor;
attribute float aAlpha;

uniform float uTime;
uniform float uSpeed;       // ramp * boost * apertura
uniform float uMaxR;
uniform float uDepth;
uniform float uSwirl;
uniform float uOpen;        // 0..1 — il varco si apre in profondità
uniform float uPxScale;
uniform vec3  uPointer;     // xy in spazio-gruppo, z = intensità 0..1
uniform vec4  uShock;       // xy epicentro, z età (s), w ampiezza

varying vec3  vColor;
varying float vAlpha;
varying float vAngle;
varying float vStretch;

void main () {
  float isShard = step(0.5, aSpecies);

  // vita ciclica: 1 al bordo (spawn) → 0 al centro (risucchio), poi respawn
  float cyc   = aSeed + uTime * aPull * uSpeed;
  float life  = 1.0 - fract(cyc);
  float cycle = floor(cyc);

  float maxR = uMaxR * (1.0 + uOpen * 0.22);
  float r    = maxR * pow(life, 0.62) * mix(1.0, 0.62, isShard);
  float rn   = r / maxR;

  // spirale log: fase per-ciclo (angolo aureo, mai pop), rotazione base,
  // avvitamento che accelera verso il centro (accelByRadius della v1)
  float theta = aPhase + cycle * 2.399963
              + uTime * aOmega * uSpeed
              + uSwirl * pow(1.0 - life, 1.9) * mix(1.0, 0.7, isShard);

  vec3 pos;
  pos.x = cos(theta) * r;
  pos.y = sin(theta) * r;
  pos.z = -1.2 - uDepth * pow(1.0 - rn, 1.35) + sin(aSeed * 77.7) * 0.4;

  // pointer: attrazione dolce (water) / repulsione (shard) — v1
  vec2  dP = uPointer.xy - pos.xy;
  float d2 = dot(dP, dP) + 0.45;
  float fP = uPointer.z * mix(0.5, -0.85, isShard) / d2;
  pos.xy += dP * clamp(fP, -0.55, 0.55);

  // shockwave radiale (click) con anello in espansione
  vec2  dS   = pos.xy - uShock.xy;
  float dLen = length(dS) + 1e-4;
  float ring = uShock.w * exp(-pow((dLen - uShock.z * 7.0) * 0.9, 2.0));
  pos.xy += (dS / dLen) * ring;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float t = 1.0 - rn;   // energia crescente verso il centro
  vAlpha = aAlpha * (0.22 + t * 0.9)
         * smoothstep(1.0, 0.93, life)
         * smoothstep(0.0, 0.06, life);
  vColor = aColor * (0.75 + t * 0.55);

  // tangente in view space → direzione dello streak (motion blur v1)
  vec3 tang = vec3(-sin(theta), cos(theta), 0.0);
  vec2 tv = (modelViewMatrix * vec4(tang, 0.0)).xy;
  vAngle   = atan(tv.y, tv.x + 1e-5);
  vStretch = 1.0 + aStreak * (0.4 + t * 1.6);

  float size = aSize * (0.55 + t * 1.9) * (1.0 + aStreak * 0.25);
  gl_PointSize = clamp(size * uPxScale / max(-mv.z, 0.1), 1.0, 64.0);
}
`;

const VORTEX_FRAG = /* glsl */ `
precision highp float;
varying vec3  vColor;
varying float vAlpha;
varying float vAngle;
varying float vStretch;

void main () {
  vec2 pc = gl_PointCoord - 0.5;
  float ca = cos(vAngle);
  float sa = sin(vAngle);
  // capsula allungata lungo la tangente
  vec2 q = vec2(ca * pc.x + sa * pc.y, (-sa * pc.x + ca * pc.y) * vStretch);
  float d = length(q) * 2.0;
  float a = exp(-d * d * 2.8);
  if (a < 0.012) discard;
  // nucleo caldo (schiuma) dentro la capsula
  gl_FragColor = vec4(vColor * (a * 1.2 + pow(a, 6.0) * 0.8), vAlpha * a);
}
`;

const CLAW_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uGlow;
uniform float uSpin;
uniform float uArms;
varying vec2 vUv;

void main () {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float ang = atan(p.y, p.x);
  // spirale log oraria (v1: drift negativo, b = 0.36)
  float s = ang + log(max(r, 0.02)) / 0.36 + uTime * uSpin;
  float c = max(cos(s * uArms), 0.0);
  float arm  = pow(c, 10.0);
  float glow = pow(c, 2.0) * 0.16;
  float env = smoothstep(1.0, 0.3, r) * smoothstep(0.045, 0.14, r);
  float v = (arm * 0.85 + glow) * env * uGlow;
  vec3 col = mix(vec3(0.665, 0.882, 0.894), vec3(0.823, 0.956, 0.956), arm);
  gl_FragColor = vec4(col * v, v);
}
`;

const CORE_FRAG = /* glsl */ `
precision highp float;
uniform vec3  uColor;
uniform float uPulse;
varying vec2 vUv;

void main () {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float inner = smoothstep(0.34, 0.10, r);          // disco pieno
  float halo  = exp(-pow(r * 2.1, 2.0)) * 0.42      // alone stretto
              + exp(-pow(r * 1.05, 2.0)) * 0.15;    // bloom largo (fake, niente post)
  float v = (inner * 0.85 + halo) * uPulse;         // niente più bagliore che brucia
  gl_FragColor = vec4(uColor * v, clamp(v, 0.0, 1.0));
}
`;

const BACKDROP_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uInner;
uniform vec3 uOuter;
varying vec2 vUv;

void main () {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p * vec2(1.15, 1.0));
  // v1: più scuro al centro (il vuoto), un filo d'azzurro al bordo, vignetta
  vec3 col = mix(uInner, uOuter, smoothstep(0.15, 1.05, r) * 0.8);
  col *= 1.0 - smoothstep(0.85, 1.5, r) * 0.45;
  gl_FragColor = vec4(col, 1.0);
}
`;

const BODY_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
varying vec3 vView;
varying vec3 vLocal;

void main () {
  // normali per-faccia dai derivativi → sfaccettatura "vetro tagliato" (g-body v1)
  vec3 N = normalize(cross(dFdx(vView), dFdy(vView)));
  vec3 V = normalize(-vView);
  float ndv = abs(dot(N, V));
  float fres = pow(1.0 - ndv, 2.5);

  vec3 base = vec3(0.13, 0.18, 0.30);               // vetro notte (più chiaro)
  vec3 col = base * (0.5 + ndv * 0.8);
  col += vec3(0.32, 0.60, 0.92) * fres * 1.1;       // rim azzurro

  // glint: banda speculare che scorre lungo il corpo (.body-glint v1)
  float gp = fract(uTime * 0.22) * 2.6 - 1.3;
  float band = exp(-pow((vLocal.y - gp) * 7.0, 2.0));
  float spec = pow(max(dot(reflect(-V, N), V), 0.0), 6.0);
  col += vec3(0.86, 0.93, 1.0) * band * (0.25 + spec) * 0.9;

  gl_FragColor = vec4(col, 0.96);
}
`;

const BODY_VERT = /* glsl */ `
varying vec3 vView;
varying vec3 vLocal;
void main () {
  vLocal = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const WING_VERT = /* glsl */ `
uniform float uFold;    // angolo di battito (rad)
uniform float uTime;
varying vec2 vUv;
varying vec3 vView;
varying vec3 vNrm;

void main () {
  vUv = uv;
  vec3 p = position;
  // piega lungo l'apertura: la punta flette più della radice (no rotazione rigida)
  float span = uv.x;
  float a = uFold * (0.8 + 0.45 * span * span);
  float ca = cos(a);
  float sa = sin(a);
  vec3 q = vec3(p.x * ca, p.y, p.x * sa + p.z);
  q.z += sin(uv.y * 3.1416) * 0.045 * uFold;        // curl di corda
  q.z += sin(uTime * 1.7 + uv.x * 5.0) * 0.008;     // micro-tremolio membranale

  vec3 n = normalize(vec3(-sa, 0.0, ca));
  vNrm = normalMatrix * n;
  vec4 mv = modelViewMatrix * vec4(q, 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const WING_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform float uOpacity;
uniform float uTime;
uniform vec3 uIridA;
uniform vec3 uIridB;
uniform vec3 uIridC;
varying vec2 vUv;
varying vec3 vView;
varying vec3 vNrm;

void main () {
  vec4 tex = texture2D(uMap, vUv);
  if (tex.a < 0.015) discard;
  vec3 N = normalize(vNrm);
  vec3 V = normalize(-vView);
  float ndv = abs(dot(N, V));           // double-sided: abs
  float fres = pow(1.0 - ndv, 2.0);

  // bordo morbido: l'alpha bakeata sfuma già, qui si ammorbidisce il gradino
  float edge = smoothstep(0.02, 0.30, tex.a);

  // iridescenza thin-film: interferenza dipendente dall'angolo di vista —
  // il colore CICLA azzurro → viola → oro al variare di ndv (vero effetto
  // lamina sottile, non una tinta fissa)
  float film = ndv * 5.2 + tex.g * 2.2 + uTime * 0.22;
  vec3 shift = vec3(
    0.5 + 0.5 * sin(film),
    0.5 + 0.5 * sin(film + 2.094),
    0.5 + 0.5 * sin(film + 4.188)
  );
  vec3 irid = uIridA * shift.x + uIridB * shift.y + uIridC * shift.z;
  irid *= 0.62; // normalizza la somma dei tre lobi

  // vetro: base texture + iridescenza che vive sul fresnel + rim luminoso
  vec3 col = tex.rgb * 0.95 + irid * (0.4 + fres * 1.25) * (0.5 + tex.r * 0.6);
  col += vec3(0.45, 0.68, 0.98) * fres * fres * 0.85;  // rim azzurro di vetro
  // glint speculare morbido che scorre sulla membrana
  float band = exp(-pow(fract(vUv.x * 0.7 - uTime * 0.06) - 0.5, 2.0) * 34.0);
  col += vec3(0.9, 0.95, 1.0) * band * fres * 0.35;
  float a = tex.a * edge * uOpacity * (0.62 + fres * 0.38);
  gl_FragColor = vec4(col * a * 2.0, a);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// TEXTURE ALI — contorno d'ala REALE a curve di Bézier (niente più schegge
// triangolari): membrana di vetro con gradiente azzurro→viola→oro, venature
// eleganti, bordo luminoso, ocello. Canali: A = sagoma, RGB = tinta vetro
// (G modula l'offset di iridescenza nel fragment).
// ─────────────────────────────────────────────────────────────────────────────

// dominio immagine e mapping su canvas: x 0..170, y −170..100 (radice a x≈4)
const WING_X_MAX = 170;
const WING_Y_MIN = -170;
const WING_Y_MAX = 100;
const WING_Y_RANGE = WING_Y_MAX - WING_Y_MIN; // 270
// proporzioni piano ala nel mondo
const WING_SPAN = 0.95;                              // unità mondo (per scala 1)
const WING_H = (WING_Y_RANGE / WING_X_MAX) * WING_SPAN; // ≈ 1.51
const WING_ROOT_V = 1 - (0 - WING_Y_MIN) / WING_Y_RANGE; // v della radice (y_img = 0)

function bakeWingTexture(size, prng) {
  const cnv = document.createElement('canvas');
  cnv.width = size;
  cnv.height = size;
  const c = cnv.getContext('2d');
  const pad = 0.045;
  const sx = (x) => (pad + (x / WING_X_MAX) * (1 - 2 * pad)) * size;
  const sy = (y) => (pad + ((y - WING_Y_MIN) / WING_Y_RANGE) * (1 - 2 * pad)) * size;

  c.clearRect(0, 0, size, size);

  // — sagome: ala anteriore e posteriore, contorni morbidi a Bézier —
  const foreWing = () => {
    c.beginPath();
    c.moveTo(sx(5), sy(-8));
    // costa (bordo d'attacco) slanciata fino all'apice
    c.bezierCurveTo(sx(48), sy(-58), sx(95), sy(-128), sx(138), sy(-152));
    // apice arrotondato
    c.bezierCurveTo(sx(156), sy(-160), sx(166), sy(-140), sx(163), sy(-116));
    // termen (margine esterno) con curva gentile
    c.bezierCurveTo(sx(160), sy(-88), sx(154), sy(-62), sx(144), sy(-42));
    // margine interno che rientra verso il torace
    c.bezierCurveTo(sx(108), sy(-24), sx(58), sy(-10), sx(6), sy(-5));
    c.closePath();
  };
  const hindWing = () => {
    c.beginPath();
    c.moveTo(sx(5), sy(2));
    c.bezierCurveTo(sx(46), sy(2), sx(92), sy(12), sx(118), sy(34));
    c.bezierCurveTo(sx(132), sy(48), sx(130), sy(68), sx(108), sy(82));
    // coda morbida con lieve smerlo
    c.bezierCurveTo(sx(86), sy(96), sx(54), sy(97), sx(31), sy(85));
    c.bezierCurveTo(sx(13), sy(72), sx(5), sy(42), sx(4), sy(8));
    c.closePath();
  };

  // — riempimento vetro: gradiente lungo l'apertura, azzurro→viola→oro —
  const fillWing = (path, x1, y1) => {
    const grad = c.createLinearGradient(sx(8), sy(0), sx(x1), sy(y1));
    // più saturo: mai grigio-falena, sempre vetro blu/viola con punta d'oro
    grad.addColorStop(0, 'rgba(64, 122, 226, 0.82)');
    grad.addColorStop(0.42, 'rgba(104, 116, 242, 0.74)');
    grad.addColorStop(0.75, 'rgba(158, 132, 238, 0.68)');
    grad.addColorStop(1, 'rgba(238, 204, 148, 0.72)');
    path();
    c.fillStyle = grad;
    c.fill();
  };
  fillWing(foreWing, 150, -120);
  fillWing(hindWing, 115, 72);

  // — luce di radice: il vetro è più denso vicino al corpo —
  const rad = c.createRadialGradient(sx(18), sy(-2), 0, sx(18), sy(-2), sx(95) - sx(0));
  rad.addColorStop(0, 'rgba(190, 220, 255, 0.44)');
  rad.addColorStop(1, 'rgba(190, 220, 255, 0)');
  for (const path of [foreWing, hindWing]) {
    path();
    c.save();
    c.clip();
    c.fillStyle = rad;
    c.fillRect(0, 0, size, size);
    c.restore();
  }

  // — venature: fasci curvi dalla radice al margine + smerli trasversali —
  const veins = (root, tips, bend) => {
    c.strokeStyle = 'rgba(16, 28, 58, 0.55)';
    c.lineWidth = Math.max(1, size / 340);
    c.lineCap = 'round';
    for (const [tx, ty] of tips) {
      const mx = (root[0] + tx) / 2 + bend[0] + (prng() - 0.5) * 4;
      const my = (root[1] + ty) / 2 + bend[1] + (prng() - 0.5) * 4;
      c.beginPath();
      c.moveTo(sx(root[0]), sy(root[1]));
      c.quadraticCurveTo(sx(mx), sy(my), sx(tx), sy(ty));
      c.stroke();
    }
    // smerlo trasversale all'85%: cuce le venature vicino al margine
    c.strokeStyle = 'rgba(18, 30, 60, 0.38)';
    c.lineWidth = Math.max(1, size / 420);
    c.beginPath();
    for (let i = 0; i < tips.length; i++) {
      const px = root[0] + (tips[i][0] - root[0]) * 0.84;
      const py = root[1] + (tips[i][1] - root[1]) * 0.84;
      if (i === 0) c.moveTo(sx(px), sy(py));
      else {
        const qx = root[0] + ((tips[i - 1][0] + tips[i][0]) / 2 - root[0]) * 0.8;
        const qy = root[1] + ((tips[i - 1][1] + tips[i][1]) / 2 - root[1]) * 0.8;
        c.quadraticCurveTo(sx(qx), sy(qy), sx(px), sy(py));
      }
    }
    c.stroke();
  };
  veins([8, -10], [[118, -138], [140, -116], [150, -92], [147, -66], [138, -46]], [-6, -18]);
  veins([8, 8], [[110, 36], [116, 58], [98, 76], [72, 88], [46, 86]], [4, 10]);

  // — bordo del vetro: alone morbido + filo luminoso —
  for (const path of [foreWing, hindWing]) {
    path();
    c.strokeStyle = 'rgba(120, 170, 240, 0.30)';
    c.lineWidth = Math.max(3, size / 80);
    c.stroke();
    path();
    c.strokeStyle = 'rgba(218, 236, 255, 0.85)';
    c.lineWidth = Math.max(1.2, size / 300);
    c.stroke();
  }

  // — ocello sul posteriore + lunule chiare presso l'apice —
  const dot = (x, y, r, fill) => {
    c.beginPath();
    c.arc(sx(x), sy(y), Math.max(1.5, (r / WING_X_MAX) * size * 0.91), 0, TWO_PI);
    c.fillStyle = fill;
    c.fill();
  };
  dot(80, 60, 9, 'rgba(18, 28, 54, 0.55)');
  dot(80, 60, 5.2, 'rgba(228, 240, 255, 0.8)');
  c.beginPath();
  c.arc(sx(80), sy(60), Math.max(2, (7 / WING_X_MAX) * size * 0.91), 0, TWO_PI);
  c.strokeStyle = 'rgba(216, 182, 112, 0.65)';
  c.lineWidth = Math.max(1, size / 400);
  c.stroke();
  dot(136, -128, 3.2, 'rgba(240, 246, 255, 0.75)');
  dot(148, -106, 2.6, 'rgba(240, 246, 255, 0.7)');
  dot(155, -84, 2.2, 'rgba(240, 246, 255, 0.6)');

  // — composito finale: alone sfocato sotto + dettaglio sopra —
  // (bordi morbidi da membrana, non il taglio netto di una forma vettoriale)
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const oc = out.getContext('2d');
  oc.filter = `blur(${Math.max(1.5, size / 300)}px)`;
  oc.drawImage(cnv, 0, 0);
  oc.filter = 'none';
  oc.globalAlpha = 0.9;
  oc.drawImage(cnv, 0, 0);

  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// ─────────────────────────────────────────────────────────────────────────────
// GEOMETRIE
// ─────────────────────────────────────────────────────────────────────────────

function buildVortexGeometry(count, prng, colors) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3); // placeholder (posizione è nel vertex shader)
  const seed = new Float32Array(count);
  const phase = new Float32Array(count);
  const omega = new Float32Array(count);
  const pull = new Float32Array(count);
  const size = new Float32Array(count);
  const streak = new Float32Array(count);
  const species = new Float32Array(count);
  const col = new Float32Array(count * 3);
  const alpha = new Float32Array(count);

  const shardN = Math.round(count * PARAMS.vortex.shardShare);
  const cBlues = PARAMS.colors.blues.map((h) => new THREE.Color(h));
  const cReds = PARAMS.colors.reds.map((h) => new THREE.Color(h));
  const cFoam = new THREE.Color(PARAMS.colors.foam);

  for (let i = 0; i < count; i++) {
    const isShard = i < shardN;
    seed[i] = prng() * 64;
    phase[i] = prng() * TWO_PI;
    // v1: omega 0.00022/0.00015 + rnd·0.00018 per-ms → qui rad/s scalati
    omega[i] = (isShard ? 0.15 : 0.22) + prng() * 0.18;
    // v1: pull con shards più lente (×0.55) che "aleggiano" di più
    pull[i] = (0.05 + prng() * 0.09) * (isShard ? 0.55 : 1.0);
    let ci;
    if (isShard) {
      species[i] = 1;
      ci = cReds[Math.floor(prng() * cReds.length)];
      size[i] = 0.022 + Math.pow(prng(), 2) * 0.06;
      streak[i] = 0.4 + prng() * 1.0;
      alpha[i] = 0.7 + prng() * 0.3;
    } else {
      species[i] = 0;
      ci = prng() < PARAMS.vortex.foamShare ? cFoam : cBlues[Math.floor(prng() * cBlues.length)];
      size[i] = 0.012 + Math.pow(prng(), 2) * 0.042;
      streak[i] = 1.2 + prng() * 3.6;
      alpha[i] = 0.45 + prng() * 0.5;
    }
    col[i * 3] = ci.r;
    col[i * 3 + 1] = ci.g;
    col[i * 3 + 2] = ci.b;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aOmega', new THREE.BufferAttribute(omega, 1));
  geo.setAttribute('aPull', new THREE.BufferAttribute(pull, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aStreak', new THREE.BufferAttribute(streak, 1));
  geo.setAttribute('aSpecies', new THREE.BufferAttribute(species, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  // bounding sphere generosa: la posizione vera vive nel vertex shader
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -4), 16);
  return geo;
}

function buildBodyGeometry() {
  // corpo definito: addome affusolato → torace → collo → testa (non più la
  // lastra scura a 5 lati: 16 segmenti radiali, silhouette snella)
  const profile = [
    new THREE.Vector2(0.001, -0.62),  // punta coda
    new THREE.Vector2(0.014, -0.52),
    new THREE.Vector2(0.024, -0.38),  // addome
    new THREE.Vector2(0.032, -0.22),
    new THREE.Vector2(0.038, -0.06),
    new THREE.Vector2(0.046, 0.10),   // torace
    new THREE.Vector2(0.042, 0.24),
    new THREE.Vector2(0.024, 0.36),   // collo
    new THREE.Vector2(0.030, 0.44),   // testa
    new THREE.Vector2(0.024, 0.52),
    new THREE.Vector2(0.001, 0.56),   // apice
  ];
  return new THREE.LatheGeometry(profile, 16);
}

/** Antenna: polilinea curva dalla testa, uno slancio in avanti e in fuori. */
function buildAntennaGeometry(side) {
  const N = 14;
  const pos = new Float32Array(N * 3);
  const p0 = [side * 0.012, 0.52, 0.015];
  const p1 = [side * 0.11, 0.74, 0.10];
  const p2 = [side * 0.22, 0.82, 0.02];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const d = t * t;
    pos[i * 3] = a * p0[0] + b * p1[0] + d * p2[0];
    pos[i * 3 + 1] = a * p0[1] + b * p1[1] + d * p2[1];
    pos[i * 3 + 2] = a * p0[2] + b * p1[2] + d * p2[2];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return geo;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULO
// ─────────────────────────────────────────────────────────────────────────────

export default {
  id: 'soglia',
  colors: {
    entry: '#050a1a',
    exit: '#06102c',
    fog: '#081028',
  },

  async init(ctx) {
    const { scene, prng, quality } = ctx;
    const P = PARAMS;
    const noise = makeNoise1D(prng);

    if (!scene.fog) scene.fog = new THREE.Fog(0x081028, 8, 30);
    if (!scene.background) scene.background = new THREE.Color(0x050a1a);

    const disposables = [];
    const track = (r) => { disposables.push(r); return r; };

    // vertex comune ai quad shader (backdrop, claw, core): passa solo la uv
    const QUAD_VERT = /* glsl */ `
      varying vec2 vUv;
      void main () {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    // ── fondale: gradiente radiale blu notte + vignetta ──────────────────────
    const backdropMat = track(new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: BACKDROP_FRAG,
      uniforms: {
        uInner: { value: new THREE.Color(P.colors.backdropInner) },
        uOuter: { value: new THREE.Color(P.colors.backdropOuter) },
      },
      depthWrite: false,
      fog: false,
    }));
    const backdrop = new THREE.Mesh(track(new THREE.PlaneGeometry(120, 70)), backdropMat);
    backdrop.position.set(0, 0, -15);
    backdrop.renderOrder = -10;
    backdrop.frustumCulled = false;
    scene.add(backdrop);

    // ── gruppo vortice (inclinato: ciotola in scorcio, come l'ovale v1) ──────
    const vortexGroup = new THREE.Group();
    vortexGroup.rotation.x = P.vortex.tilt;
    scene.add(vortexGroup);

    const counts = P.vortex.counts;
    const count = Math.min(
      counts[quality.tier] ?? counts.low,
      quality.maxParticles ?? counts.high
    );

    const vortexMat = track(new THREE.ShaderMaterial({
      vertexShader: VORTEX_VERT,
      fragmentShader: VORTEX_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 0 },
        uMaxR: { value: P.vortex.maxRadius },
        uDepth: { value: P.vortex.depth },
        uSwirl: { value: P.vortex.swirl },
        uOpen: { value: 0 },
        uPxScale: { value: 600 },
        uPointer: { value: new THREE.Vector3(0, 0, 0) },
        uShock: { value: new THREE.Vector4(0, 0, 10, 0) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }));
    const points = new THREE.Points(track(buildVortexGeometry(count, prng, P.colors)), vortexMat);
    points.frustumCulled = false;
    points.renderOrder = 1;
    vortexGroup.add(points);

    // ── claw-streaks: disco shader con i 9 bracci spiraliformi della v1 ──────
    const clawMat = track(new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: CLAW_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uGlow: { value: 0 },
        uSpin: { value: P.vortex.clawSpin },
        uArms: { value: P.vortex.clawArms },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }));
    const claw = new THREE.Mesh(track(new THREE.PlaneGeometry(7.5, 7.5)), clawMat);
    claw.position.set(0, 0, -2.4);
    claw.renderOrder = 2;
    vortexGroup.add(claw);

    // ── core celeste con alone (disco + doppio bloom fake, 1 draw call) ──────
    const coreMat = track(new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: CORE_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(P.vortex.coreColor) },
        uPulse: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }));
    const core = new THREE.Mesh(track(new THREE.PlaneGeometry(2.6, 2.6)), coreMat);
    core.position.set(0, 0, -7.2);
    core.renderOrder = 3;
    vortexGroup.add(core);

    // ── FARFALLA ─────────────────────────────────────────────────────────────
    const fly = new THREE.Group();
    scene.add(fly);

    const bodyMat = track(new THREE.ShaderMaterial({
      vertexShader: BODY_VERT,
      fragmentShader: BODY_FRAG,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      fog: false,
    }));
    const body = new THREE.Mesh(track(buildBodyGeometry()), bodyMat);
    body.renderOrder = 10;
    fly.add(body);

    const wingTexSize = quality.tier === 'high' ? 1024 : 512;
    const wingTex = track(bakeWingTexture(wingTexSize, prng));
    const wingSegs = quality.tier === 'high' ? 24 : 14;

    const wingGeo = track(new THREE.PlaneGeometry(WING_SPAN, WING_H, wingSegs, wingSegs));
    // radice ala su x=0 (u=0), giunzione verticale sul torace
    wingGeo.translate(WING_SPAN / 2, (0.5 - WING_ROOT_V) * WING_H, 0);

    const mkWingMat = () => track(new THREE.ShaderMaterial({
      vertexShader: WING_VERT,
      fragmentShader: WING_FRAG,
      uniforms: {
        uMap: { value: wingTex },
        uFold: { value: 0 },
        uTime: { value: 0 },
        uOpacity: { value: 1 },
        uIridA: { value: new THREE.Color(P.colors.irid[0]) },
        uIridB: { value: new THREE.Color(P.colors.irid[1]) },
        uIridC: { value: new THREE.Color(P.colors.irid[2]) },
      },
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }));

    const wingMatR = mkWingMat();
    const wingMatL = mkWingMat();
    const wingR = new THREE.Mesh(wingGeo, wingMatR);
    const wingL = new THREE.Mesh(wingGeo, wingMatL);
    wingL.scale.x = -1; // specchiata: il battito si riflette da solo
    wingR.position.x = 0.03;
    wingL.position.x = -0.03;
    wingR.renderOrder = 11;
    wingL.renderOrder = 11;
    fly.add(wingR);
    fly.add(wingL);

    // antenne: due archi sottili di luce azzurra dalla testa
    const antMat = track(new THREE.LineBasicMaterial({
      color: 0x9fc6f0,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }));
    const antR = new THREE.Line(track(buildAntennaGeometry(1)), antMat);
    const antL = new THREE.Line(track(buildAntennaGeometry(-1)), antMat);
    antR.renderOrder = 12;
    antL.renderOrder = 12;
    fly.add(antR);
    fly.add(antL);

    fly.scale.setScalar(P.butterfly.scale);

    // ── stato + pre-allocazioni (update non alloca MAI) ──────────────────────
    const state = {
      t0: -1,
      boost: 1,
      shockAge: 10,
      shockAmp: 0,
      flapPhase: prng() * TWO_PI,
      // Lissajous seedata (deriva idle §5.2)
      lisA: 0.19 + prng() * 0.07,
      lisB: 0.13 + prng() * 0.06,
      lisC: 0.09 + prng() * 0.05,
      lisP1: prng() * TWO_PI,
      lisP2: prng() * TWO_PI,
      lisP3: prng() * TWO_PI,
      px: 0,
      py: 0,
      roll: 0,
      pitch: 0,
      started: false,
      // click → shock (coordinate già in spazio-gruppo del vortice)
      pendingShock: null,
      camHalfH: 1,
      camAspect: 1.6,
      camZ: 10,
    };

    const tmp = {
      fwd: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      anchor: new THREE.Vector3(),
      target: new THREE.Vector3(),
      corePos: new THREE.Vector3(...P.butterfly.corePos),
      euler: new THREE.Euler(),
      quat: new THREE.Quaternion(),
    };

    // click/tap → shockwave + speedBoost (feeling v1). Ignora click su UI.
    const onPointerDown = (e) => {
      if (e.target && e.target.closest && e.target.closest('a, button, [role="button"]')) return;
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = -((e.clientY / window.innerHeight) * 2 - 1);
      state.pendingShock = {
        x: nx * state.camHalfH * state.camAspect,
        y: ny * state.camHalfH,
      };
      state.boost = Math.min(state.boost + P.vortex.speedBoostClick, P.vortex.speedBoostMax);
    };
    window.addEventListener('pointerdown', onPointerDown, { passive: true });

    const handle = {
      // canale ammesso verso l'engine (§2.4)
      cameraHints: { railDepth: P.railDepth, roll: 0 },
      scene,
      camera: ctx.camera,
      viewport: ctx.viewport,
      noise,
      vortex: { group: vortexGroup, points, mat: vortexMat, claw, clawMat, core, coreMat, backdrop, backdropMat },
      fly: { group: fly, body, bodyMat, wingL, wingR, wingMatL, wingMatR, wingTex, antMat },
      state,
      tmp,
      disposables,
      onPointerDown,
    };
    return handle;
  },

  update(handle, frame) {
    const P = PARAMS;
    const S = handle.state;
    const T = handle.tmp;
    const cam = handle.camera;
    const vw = handle.viewport;
    const noise = handle.noise;
    const t = frame.time;
    const dt = frame.dt;
    const p = frame.progress;

    // ── rampa di avvio v1 (2.6s easeInOutCubic) + decadimento boost ──────────
    if (S.t0 < 0) S.t0 = t;
    const ramp = easeInOutCubic(Math.min((t - S.t0) / P.ramp.durationS, 1));
    const decay = 1 - Math.pow(1 - P.vortex.boostDecay, dt * 60);
    S.boost += (1 - S.boost) * decay;

    // fasi scroll della farfalla (§5.2)
    const lift = smoothstep(0, 0.4, p);          // si alza, punta al core
    const kFly = smoothstep(0.4, 0.8, p);        // s'invola verso il core
    const kEnd = smoothstep(0.8, 1.0, p);        // scompare, il vortice si apre

    // ── dati camera per pointer/shock (camera READ-ONLY) ─────────────────────
    const fovRad = (cam.fov * Math.PI) / 360;
    const distVortex = Math.max(cam.position.z + 2.4, 0.5); // piano claw a z≈−2.4
    S.camHalfH = Math.tan(fovRad) * distVortex;
    S.camAspect = vw.aspect;
    S.camZ = cam.position.z;

    // ── vortice ──────────────────────────────────────────────────────────────
    const V = handle.vortex;
    const speed = ramp * S.boost * (1 + kFly * 0.4 + kEnd * 0.9);
    const u = V.mat.uniforms;
    u.uTime.value = t;
    u.uSpeed.value = speed;
    u.uOpen.value = kEnd;
    u.uDepth.value = P.vortex.depth + P.vortex.depthOpen * kEnd;
    u.uPxScale.value = (vw.h * vw.dpr * 0.5) / Math.tan(fovRad);

    // pointer → deflessione del flusso (0,0 su touch → forza nulla)
    const nx = frame.pointer.x;
    const ny = frame.pointer.y;
    const pStrength = Math.min(1, (Math.abs(nx) + Math.abs(ny)) * 6) * P.vortex.pointerForce;
    u.uPointer.value.set(nx * S.camHalfH * S.camAspect, ny * S.camHalfH, pStrength);

    // shockwave: consuma il click, poi invecchia e decade
    if (S.pendingShock) {
      u.uShock.value.x = S.pendingShock.x;
      u.uShock.value.y = S.pendingShock.y;
      S.shockAge = 0;
      S.shockAmp = 1;
      S.pendingShock = null;
    }
    S.shockAge += dt;
    S.shockAmp *= Math.exp(-P.vortex.shockDecay * dt);
    u.uShock.value.z = S.shockAge;
    u.uShock.value.w = S.shockAmp;

    V.clawMat.uniforms.uTime.value = t;
    V.clawMat.uniforms.uGlow.value = ramp * (1 - kEnd * 0.35);
    V.coreMat.uniforms.uPulse.value =
      ramp * (0.68 + 0.07 * Math.sin(t * 1.3) + (noise(t * 0.5) - 0.5) * 0.07) + kEnd * 0.9;

    // ── farfalla ─────────────────────────────────────────────────────────────
    const F = handle.fly;
    const B = P.butterfly;

    // ancora davanti alla camera (robusto rispetto al binario dell'engine)
    T.fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    T.right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    T.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    T.anchor.copy(cam.position).addScaledVector(T.fwd, B.camDistance);

    // deriva Lissajous seedata + virata dolce verso il pointer (λ=2.5)
    // su viewport portrait la deriva orizzontale si stringe: la farfalla resta
    // il fulcro ottico, mai addossata al bordo
    const nar = Math.min(1, Math.max(0.45, vw.aspect) / 0.9);
    const dx = Math.sin(t * S.lisA * TWO_PI + S.lisP1) * B.driftAmp[0] * nar;
    const dy = Math.sin(t * S.lisB * TWO_PI + S.lisP2) * B.driftAmp[1];
    const dz = Math.sin(t * S.lisC * TWO_PI + S.lisP3) * B.driftAmp[2];
    const txp = nx * B.pointerRange[0];
    const typ = ny * B.pointerRange[1];
    const kPtr = 1 - Math.exp(-B.pointerLambda * dt);
    S.px += (txp - S.px) * kPtr;
    S.py += (typ - S.py) * kPtr;

    T.target
      .copy(T.anchor)
      .addScaledVector(T.right, dx + S.px)
      .addScaledVector(T.up, dy + S.py + lift * 0.5)
      .addScaledVector(T.fwd, dz * 0.5);

    // involo: dal volo ancorato alla camera → il core del vortice
    if (kFly > 0) T.target.lerp(T.corePos, easeInOutCubic(kFly));

    if (!S.started) {
      F.group.position.copy(T.target);
      S.started = true;
    }
    const kMove = 1 - Math.exp(-B.followLambda * dt);
    F.group.position.lerp(T.target, kMove);

    // orientamento: frontale alla camera + bank nella virata + pitch verso il
    // core. Yaw/roll CONTENUTI: entrambe le coppie d'ali devono restare
    // leggibili in ogni momento del ciclo (mai un lato quasi di taglio)
    const rollTarget = Math.max(-0.38, Math.min(0.38, (txp - S.px) * 1.2));
    S.roll += (rollTarget - S.roll) * kPtr;
    const pitchTarget = -0.18 - lift * 0.3 - kFly * 0.85;
    S.pitch += (pitchTarget - S.pitch) * kMove;
    T.euler.set(S.pitch, S.px * 0.3, S.roll);
    T.quat.setFromEuler(T.euler);
    F.group.quaternion.copy(cam.quaternion).multiply(T.quat);

    // scala e dissolvenza (rimpicciolisce involandosi, scompare nel core)
    const scl = B.scale * (0.82 + 0.18 * nar) * (1 - 0.72 * easeInOutCubic(kFly)) * (1 - 0.85 * kEnd);
    F.group.scale.setScalar(Math.max(scl, 0.001));
    const opacity = 1 - kEnd;
    F.wingMatL.uniforms.uOpacity.value = opacity;
    F.wingMatR.uniforms.uOpacity.value = opacity;
    F.antMat.opacity = 0.75 * opacity;
    F.group.visible = opacity > 0.01;

    // battito organico: 0.9Hz base × noise seedato; pointer vicino → lento e ampio
    const pointerDist = Math.hypot(nx, ny);
    const calm = 1 - smoothstep(0.12, 0.7, pointerDist);
    const freq = B.flapBaseHz * (1 - 0.3 * calm) * (1 + kFly * 1.15);
    S.flapPhase += TWO_PI * freq * (0.8 + 0.4 * noise(t * 0.33)) * dt;
    // ampiezza contenuta (~45° max): al picco del battito le ali non si
    // presentano mai di taglio alla camera — restano sempre leggibili
    const amp = (0.36 + 0.26 * calm) * (1 + kFly * 0.25);
    const fold = Math.sin(S.flapPhase) * amp + 0.12 + (noise(t * 0.47 + 7.3) - 0.5) * 0.1;
    F.wingMatL.uniforms.uFold.value = fold;
    F.wingMatR.uniforms.uFold.value = fold;
    F.wingMatL.uniforms.uTime.value = t;
    F.wingMatR.uniforms.uTime.value = t;
    F.bodyMat.uniforms.uTime.value = t;
  },

  dispose(handle) {
    window.removeEventListener('pointerdown', handle.onPointerDown);
    const V = handle.vortex;
    const F = handle.fly;
    handle.scene.remove(V.group, V.backdrop, F.group);
    for (const r of handle.disposables) {
      if (r && typeof r.dispose === 'function') r.dispose();
    }
    handle.disposables.length = 0;
  },
};
