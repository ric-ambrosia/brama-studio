// MONDI · ambiente 4 — «ti devo lasciare» / Lasciarti andare (order 4)
// «Pulviscolo d'oro nel vuoto caldo»: due correnti di polvere dorata che
// viaggiano intrecciate lungo il binario, si sfiorano attorno all'opera e,
// nell'uscita, si lasciano per sempre. L'oro si raffredda nel bruno-pirite
// del mondo successivo (pugno-nel-tempo).
// Contratto: site/content-notes/mondi-architettura.md §2, §4.4.
// Catena cromatica: entry #171008 (exit di fuga) → exit #0d0b06 (entry di pugno).

import * as THREE from 'three';

export const preload = ['/viaggio/lasciarti-mano.webp'];

// Particelle per tier (cap ulteriore da ctx.quality.maxParticles)
const COUNTS = { high: 6000, mid: 3000, low: 1200 };

function sstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Simplex 3D (Ashima/IQ, public domain) — noise seedato via uSeed, solo GPU.
const GLSL_SNOISE = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

// Vertex: due eliche in controfase attorno al binario (aSide 0/1), disco di
// pulviscolo attorno a ciascuna corrente, wander curl-ish lentissimo su GPU.
// uFlowT è una FASE ACCUMULATA in JS (mai time*speed con speed variabile:
// eviterebbe salti quando la velocità cambia).
const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform float uFlowT;
uniform float uSplit;
uniform float uDensity;
uniform float uCool;
uniform float uPointScale;
uniform float uFogNear;
uniform float uFogFar;
uniform float uSeed;
attribute vec4 aSeed;  // x: param 0..1 lungo il binario, y: raggio 0..1, z: theta0, w: size
attribute float aSide; // 0 | 1 — a quale delle due correnti appartiene
varying float vAlpha;
varying vec3 vColor;
${GLSL_SNOISE}
const float Z_FRONT = 15.0;
const float Z_BACK = -9.0;
void main() {
  float L = Z_FRONT - Z_BACK;
  float u = fract(aSeed.x + uFlowT / L);
  float z = Z_FRONT - u * L;
  float side = aSide * 2.0 - 1.0;
  // treccia: due eliche opposte, il raggio si apre attorno all'opera (z≈0)
  float widen = smoothstep(2.6, 0.4, abs(z));
  float rb = 0.55 + 1.35 * widen;
  float ang = z * 0.62 + uTime * 0.12 + aSide * 3.14159265;
  vec3 center = vec3(cos(ang) * rb, sin(ang) * rb * 0.55, z);
  // separazione definitiva (exit): le correnti si lasciano
  center.x += side * uSplit * (1.9 + 0.06 * (Z_FRONT - z));
  center.y += side * uSplit * 0.35;
  // disco di pulviscolo attorno alla corrente
  float th = aSeed.z + uTime * (0.05 + 0.10 * aSeed.y);
  float rr = aSeed.y * aSeed.y * (0.5 + 0.5 * widen);
  vec3 pos = center + vec3(cos(th) * rr, sin(th * 1.3) * rr * 0.8, (aSeed.y - 0.5) * 0.6);
  // wander lentissimo (curl-ish: tre campi simplex indipendenti)
  float nt = uTime * 0.06 + uSeed;
  pos.x += snoise(vec3(pos.y * 0.35, pos.z * 0.35, nt + aSide * 7.3)) * 0.34;
  pos.y += snoise(vec3(pos.z * 0.35, pos.x * 0.35, nt + 3.1)) * 0.30;
  pos.z += snoise(vec3(pos.x * 0.35, pos.y * 0.35, nt + 5.7)) * 0.22;
  // corridoio di esclusione davanti all'opera (quad a z=0, halfW 1.2):
  // la polvere resta CORNICE ai lati, mai velo bokeh sopra la tela
  float guard = smoothstep(4.5, 1.4, abs(pos.z - 0.2));
  float minX = 1.55 * guard;
  float ax = abs(pos.x);
  pos.x += (pos.x >= 0.0 ? 1.0 : -1.0) * max(0.0, minX - ax);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.5);
  gl_PointSize = clamp(aSeed.w * uPointScale / dist, 1.0, 20.0);
  float endFade = smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.95, 1.0, u));
  float fogFade = 1.0 - smoothstep(uFogNear, uFogFar, dist);
  vAlpha = uDensity * endFade * fogFade;
  // oro #d7a94b → bruno-pirite #6b5a2e (raffreddamento verso il mondo dopo)
  vec3 gold = vec3(0.843, 0.663, 0.294) * (0.85 + 0.3 * aSeed.y);
  vec3 pyrite = vec3(0.42, 0.353, 0.18);
  vColor = mix(gold, pyrite, uCool * (0.35 + 0.65 * aSeed.y));
}
`;

const DUST_FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.08, d) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

// Cono di luce morbida dall'alto — god-ray finto, additivo.
const CONE_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  vY = position.y;
  gl_Position = projectionMatrix * mv;
}
`;

const CONE_FRAG = /* glsl */ `
uniform float uOpacity;
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
  float f = abs(dot(normalize(vN), normalize(vV)));
  float edge = smoothstep(0.05, 0.6, f);
  float grad = smoothstep(-3.6, 2.6, vY);
  float a = uOpacity * edge * (0.15 + 0.85 * grad * grad);
  gl_FragColor = vec4(vec3(0.95, 0.87, 0.66), a);
}
`;

// Dimensioni reali dell'operaPlane (creato dall'engine) senza mai toccarlo.
function planeSize(mesh) {
  const par = mesh && mesh.geometry && mesh.geometry.parameters;
  if (par && par.width) {
    return { w: par.width * mesh.scale.x, h: par.height * mesh.scale.y };
  }
  if (mesh && mesh.geometry) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox;
    return {
      w: (b.max.x - b.min.x) * mesh.scale.x,
      h: (b.max.y - b.min.y) * mesh.scale.y,
    };
  }
  return { w: 2.4, h: 1.7 };
}

// 3 archi di gesso: nastri curvi in UN'unica BufferGeometry (1 draw call),
// bianco-gesso matte, letti dalla luce radente.
function buildArcsGeometry(prng) {
  const positions = [];
  const indices = [];
  const zBases = [8.6, 4.7, 1.4];
  const vA = new THREE.Vector3();
  const vTan = new THREE.Vector3();
  const vLat = new THREE.Vector3();
  const vZ = new THREE.Vector3(0, 0, 1);
  const q = new THREE.Quaternion();
  for (let a = 0; a < 3; a++) {
    const z0 = zBases[a] + (prng() - 0.5) * 0.8;
    const sway = (prng() - 0.5) * 1.6;
    const height = 2.3 + prng() * 0.9;
    const span = 2.9 + prng() * 0.8;
    const width = 0.16 + prng() * 0.1;
    const twist = 0.5 + prng() * 0.5;
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector3(
        (t - 0.5) * 2 * span + sway * Math.sin(t * Math.PI),
        -2.3 + Math.sin(t * Math.PI) * (height + 2.3),
        z0 + Math.sin(t * Math.PI * 2 + a) * 0.55
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const N = 48;
    const base = positions.length / 3;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      curve.getPoint(t, vA);
      curve.getTangent(t, vTan);
      vLat.crossVectors(vTan, vZ).normalize();
      // lieve torsione del nastro lungo la curva
      q.setFromAxisAngle(vTan, Math.sin(t * Math.PI * 3 + a * 2.1) * twist);
      vLat.applyQuaternion(q);
      const w = width * (0.55 + 0.45 * Math.sin(t * Math.PI));
      positions.push(
        vA.x - vLat.x * w, vA.y - vLat.y * w, vA.z - vLat.z * w,
        vA.x + vLat.x * w, vA.y + vLat.y * w, vA.z + vLat.z * w
      );
      if (i < N) {
        const k = base + i * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export default {
  id: 'ti-devo-lasciare',
  colors: {
    entry: '#171008',
    exit: '#0d0b06',
    fog: '#0f0b06',
  },

  async init(ctx) {
    const { scene, prng, quality, viewport } = ctx;
    const handle = {
      viewport,
      flowT: 0,
      seedPhase: prng() * Math.PI * 2,
      depth: 12, // la camera entra da z=+12 (convenzione §2.4)
      cameraHints: { roll: 0 },
      meshes: [],
      materials: [],
      geometries: [],
    };

    scene.fog = new THREE.Fog(0x0f0b06, 3.5, 17);
    scene.background = scene.fog.color;

    // — pulviscolo d'oro: due correnti intrecciate (1 draw call) —
    const count = Math.min(
      COUNTS[quality.tier] || COUNTS.low,
      quality.maxParticles || COUNTS.low
    );
    const aSeed = new Float32Array(count * 4);
    const aSide = new Float32Array(count);
    const posZero = new Float32Array(count * 3); // richiesto dal renderer, calcolo in vertex
    for (let i = 0; i < count; i++) {
      aSeed[i * 4 + 0] = prng();
      aSeed[i * 4 + 1] = prng();
      aSeed[i * 4 + 2] = prng() * Math.PI * 2;
      aSeed[i * 4 + 3] = 0.6 + prng() * 1.2;
      aSide[i] = prng() < 0.5 ? 0 : 1;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(posZero, 3));
    dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 4));
    dustGeo.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
    const dustUni = {
      uTime: { value: 0 },
      uFlowT: { value: 0 },
      uSplit: { value: 0 },
      uDensity: { value: 0.4 },
      uCool: { value: 0 },
      uPointScale: { value: 10 },
      uFogNear: { value: 3.5 },
      uFogFar: { value: 17 },
      uSeed: { value: prng() * 100 },
    };
    const dustMat = new THREE.ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      uniforms: dustUni,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.frustumCulled = false;
    dust.renderOrder = 2;
    scene.add(dust);
    handle.dust = dust;
    handle.dustUni = dustUni;
    handle.geometries.push(dustGeo);
    handle.materials.push(dustMat);

    // — cono di luce morbida dall'alto (god-ray finto) —
    const coneGeo = new THREE.ConeGeometry(2.7, 7.2, 40, 1, true);
    const coneUni = { uOpacity: { value: 0.1 } };
    const coneMat = new THREE.ShaderMaterial({
      vertexShader: CONE_VERT,
      fragmentShader: CONE_FRAG,
      uniforms: coneUni,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    // dietro il piano dell'opera: accoglie il quadro come luce di quinta,
    // senza mai velarlo (prima era davanti, a z=0.3)
    cone.position.set(0, 1.4, -1.3);
    cone.renderOrder = 1;
    scene.add(cone);
    handle.coneUni = coneUni;
    handle.meshes.push(cone);
    handle.geometries.push(coneGeo);
    handle.materials.push(coneMat);

    // — archi di gesso (nastri matte, luce radente) —
    const arcsGeo = buildArcsGeometry(prng);
    const arcsMat = new THREE.MeshStandardMaterial({
      color: 0xe8e2d2,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const arcs = new THREE.Mesh(arcsGeo, arcsMat);
    scene.add(arcs);
    handle.arcs = arcs;
    handle.meshes.push(arcs);
    handle.geometries.push(arcsGeo);
    handle.materials.push(arcsMat);

    // — luci: radente calda sui nastri di gesso + ambiente basso —
    const dir = new THREE.DirectionalLight(0xf5e8cd, 1.1);
    dir.position.set(-5, 1.2, 3.2);
    scene.add(dir);
    const amb = new THREE.AmbientLight(0x2a2114, 0.6);
    scene.add(amb);
    handle.dir = dir;
    handle.amb = amb;

    // — ink "lasciarti-mano": UNA card semitrasparente accanto all'opera —
    handle.inkMat = null;
    if (quality.tier !== 'low') {
      try {
        const tex = await ctx.loadTexture(ctx.assets.ink('lasciarti-mano'));
        const img = tex.image;
        const aspect = img && img.width ? img.width / img.height : 0.8;
        const hgt = 1.55;
        const inkGeo = new THREE.PlaneGeometry(hgt * aspect, hgt);
        const inkMat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          fog: true,
        });
        const { w } = planeSize(ctx.operaPlane);
        const ink = new THREE.Mesh(inkGeo, inkMat);
        ink.position.set(w / 2 + 0.95, 0.05, -0.5);
        ink.rotation.y = -0.18;
        ink.renderOrder = 3;
        scene.add(ink);
        handle.ink = ink;
        handle.inkMat = inkMat;
        handle.meshes.push(ink);
        handle.geometries.push(inkGeo);
        handle.materials.push(inkMat);
      } catch (e) {
        handle.inkMat = null; // asset mancante: il mondo vive comunque
      }
    }

    return handle;
  },

  update(handle, frame) {
    const p = frame.progress;
    const dwellK = sstep(0.30, 0.42, p) * (1 - sstep(0.58, 0.72, p));
    const exitK = sstep(0.66, 0.96, p);
    const fadeOut = sstep(0.82, 1.0, p);
    const u = handle.dustUni;

    // fase di flusso ACCUMULATA (insieme in approach, quasi ferme in dwell,
    // via veloci nella separazione)
    const flowSpeed = 0.06 + 0.30 * (1 - dwellK) * (1 - exitK) + 0.55 * exitK;
    handle.flowT += frame.dt * flowSpeed;

    u.uTime.value = frame.time;
    u.uFlowT.value = handle.flowT;
    u.uSplit.value = exitK;
    u.uCool.value = sstep(0.74, 0.98, p);
    u.uDensity.value = (0.30 + 0.70 * sstep(0.02, 0.38, p)) * (1 - 0.45 * fadeOut);
    u.uPointScale.value = handle.viewport.h * handle.viewport.dpr * 0.0085;

    // parallasse leggerissima del pulviscolo (pointer è 0,0 su touch)
    handle.dust.position.x = frame.pointer.x * 0.1;
    handle.dust.position.y = frame.pointer.y * 0.06;

    // il cono accoglie l'opera nel dwell, muore nel varco
    handle.coneUni.uOpacity.value = (0.08 + 0.15 * dwellK) * (1 - fadeOut);

    // luce radente: respira appena, si alza nel dwell, si spegne nel varco
    handle.dir.intensity =
      (0.9 + 0.7 * dwellK) * (1 - 0.9 * fadeOut) *
      (0.96 + 0.04 * Math.sin(frame.time * 0.4 + handle.seedPhase));
    handle.amb.intensity = 0.6 * (1 - 0.7 * fadeOut);

    // gli archi oscillano impercettibilmente
    handle.arcs.rotation.z = Math.sin(frame.time * 0.05 + handle.seedPhase) * 0.02;

    if (handle.inkMat) handle.inkMat.opacity = 0.4 * dwellK;
  },

  dispose(handle) {
    for (const g of handle.geometries) g.dispose();
    for (const m of handle.materials) m.dispose();
    // le texture del loader condiviso le libera l'engine (refcount)
    handle.geometries.length = 0;
    handle.materials.length = 0;
    handle.meshes.length = 0;
  },
};
