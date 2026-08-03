// MONDI · ambiente 5 — «pugno nel tempo» (order 5)
// «L'onda d'urto congelata»: 150×150, pirite e oro. Un'esplosione minerale
// ferma a metà: gusci concentrici di cubi di pirite attorno all'opera,
// attraversabili. Lo scroll riavvolge il tempo (approach), lo congela (dwell,
// resta solo un pulse radiale ogni ~5s), lo fa ripartire di colpo (exit)
// mentre tutto si spegne nel nero.
// Contratto: site/content-notes/mondi-architettura.md §2, §4.5.
// Catena cromatica: entry #0d0b06 (exit di ti-devo-lasciare) → exit #050505 (entry di depressione).

import * as THREE from 'three';

export const preload = [];

const CUBES = { high: 120, mid: 88, low: 48 };
const SPARKS = { high: 1000, mid: 600, low: 300 };

function sstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Scintille d'oro quasi congelate: micro-deriva + twinkle. uTime qui è un
// TEMPO ACCUMULATO in JS (rallenta nel dwell senza salti).
const SPARK_VERT = /* glsl */ `
uniform float uTime;
uniform float uFade;
uniform float uPointScale;
attribute float aPhase;
attribute float aSize;
varying float vA;
void main() {
  vec3 pos = position;
  pos.x += sin(uTime * 0.21 + aPhase * 11.0) * 0.05;
  pos.y += cos(uTime * 0.17 + aPhase * 23.0) * 0.05;
  pos.z += sin(uTime * 0.13 + aPhase * 31.0) * 0.05;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.5);
  gl_PointSize = clamp(aSize * uPointScale / dist, 1.0, 14.0);
  float tw = 0.5 + 0.5 * sin(uTime * (0.5 + fract(aPhase) * 0.9) + aPhase * 37.0);
  vA = uFade * (0.2 + 0.8 * tw * tw * tw) * (1.0 - smoothstep(10.0, 18.0, dist));
}
`;

const SPARK_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.1, d) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(0.9, 0.72, 0.34), a);
}
`;

// Posizione su guscio sferico con corridoio libero attorno al binario
// (la camera passa DENTRO i gusci senza mai urtare un cubo).
function shellPosition(prng, rMin, rMax, out) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const r = rMin + prng() * (rMax - rMin);
    const cosT = prng() * 2 - 1;
    const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
    const phi = prng() * Math.PI * 2;
    const x = r * sinT * Math.cos(phi);
    const y = r * sinT * Math.sin(phi);
    const z = r * cosT;
    const rxy = Math.sqrt(x * x + y * y);
    // corridoio: la camera non deve MAI incrociare un cubo (nemmeno il piano
    // di un cubo grande che clippa l'inquadratura) lungo tutto il binario
    if (z > -4.5 && rxy < 2.15) continue;
    out.set(x, y, z);
    return;
  }
  out.set(rMax, 0, -rMax); // fallback deterministico fuori dal corridoio
}

function buildShell(prng, countTotal, share, rMin, rMax, sizeMul, geo, mat, cA, cB, cTmp) {
  const n = Math.max(4, Math.round(countTotal * share));
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    shellPosition(prng, rMin, rMax, dummy.position);
    dummy.rotation.set(prng() * Math.PI * 2, prng() * Math.PI * 2, prng() * Math.PI * 2);
    const s = (0.10 + prng() * 0.22) * sizeMul;
    dummy.scale.set(s * (0.85 + prng() * 0.5), s * (0.85 + prng() * 0.5), s * (0.85 + prng() * 0.5));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    cTmp.lerpColors(cA, cB, prng());
    mesh.setColorAt(i, cTmp);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

export default {
  id: 'pugno-nel-tempo',
  colors: {
    entry: '#0d0b06',
    exit: '#050505',
    fog: '#0d0b06',
  },

  async init(ctx) {
    const { scene, prng, quality } = ctx;
    const handle = {
      viewport: ctx.viewport,
      depth: 12,
      cameraHints: { roll: 0 },
      exitSpin: 0,
      slowT: 0,   // tempo che si congela nel dwell (deriva cubi)
      sparkT: 0,  // tempo delle scintille (quasi fermo nel dwell)
      pulseT: 0,
      geometries: [],
      materials: [],
    };

    scene.fog = new THREE.Fog(0x0d0b06, 4, 18);
    scene.background = scene.fog.color;

    // — cubi di pirite: 2 InstancedMesh (gusci interni/esterni controrotanti),
    //   matrici STATICHE, ruotano i mesh interi (update senza allocazioni) —
    const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
    const cubeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, // moltiplica instanceColor
      metalness: 0.92,
      roughness: 0.24, // pirite lucida: la luce radente accende le facce
      emissive: 0x2a2110,
      emissiveIntensity: 0.4,
    });
    // pulse radiale (scale+emissive) iniettato nello shader standard:
    // l'onda d'urto viaggia dal centro attraverso i gusci congelati.
    const pulseUni = { uPulseR: { value: -5 }, uPulseAmp: { value: 0 } };
    cubeMat.onBeforeCompile = (shader) => {
      shader.uniforms.uPulseR = pulseUni.uPulseR;
      shader.uniforms.uPulseAmp = pulseUni.uPulseAmp;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
uniform float uPulseR;
varying float vPulse;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 pnCen = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float pnD = length(pnCen);
  float pnW = exp(-pow((pnD - uPulseR) * 2.0, 2.0));
  transformed *= 1.0 + 0.30 * pnW;
  vPulse = pnW;
#else
  vPulse = 0.0;
#endif`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform float uPulseAmp;
varying float vPulse;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(0.85, 0.66, 0.28) * (vPulse * uPulseAmp);`);
    };
    cubeMat.customProgramCacheKey = () => 'mondi-pugno-pulse';

    const total = CUBES[quality.tier] || CUBES.low;
    const cGoldA = new THREE.Color(0xcfa24f); // oro battuto
    const cGoldB = new THREE.Color(0x47391c); // pirite bruna in ombra
    const cTmp = new THREE.Color();
    const inner = buildShell(prng, total, 0.55, 2.3, 3.6, 1.25, cubeGeo, cubeMat, cGoldA, cGoldB, cTmp);
    const outer = buildShell(prng, total, 0.45, 4.0, 6.4, 1.0, cubeGeo, cubeMat, cGoldA, cGoldB, cTmp);
    inner.rotation.x = 0.14;
    outer.rotation.x = -0.1;
    scene.add(inner);
    scene.add(outer);
    handle.inner = inner;
    handle.outer = outer;
    handle.cubeMat = cubeMat;
    handle.pulseUni = pulseUni;
    handle.geometries.push(cubeGeo);
    handle.materials.push(cubeMat);

    // — scintille d'oro (1 draw call) —
    const nSparks = Math.min(
      SPARKS[quality.tier] || SPARKS.low,
      quality.maxParticles || SPARKS.low
    );
    const sPos = new Float32Array(nSparks * 3);
    const sPhase = new Float32Array(nSparks);
    const sSize = new Float32Array(nSparks);
    const tmpV = new THREE.Vector3();
    for (let i = 0; i < nSparks; i++) {
      shellPosition(prng, 1.8, 7.0, tmpV);
      sPos[i * 3 + 0] = tmpV.x;
      sPos[i * 3 + 1] = tmpV.y;
      sPos[i * 3 + 2] = tmpV.z;
      sPhase[i] = prng() * 100;
      sSize[i] = 0.5 + prng() * 1.1;
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sparkGeo.setAttribute('aPhase', new THREE.BufferAttribute(sPhase, 1));
    sparkGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
    const sparkUni = {
      uTime: { value: 0 },
      uFade: { value: 0.5 },
      uPointScale: { value: 10 },
    };
    const sparkMat = new THREE.ShaderMaterial({
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      uniforms: sparkUni,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    sparks.frustumCulled = false;
    sparks.renderOrder = 2;
    scene.add(sparks);
    handle.sparkUni = sparkUni;
    handle.geometries.push(sparkGeo);
    handle.materials.push(sparkMat);

    // — luci: chiave dorata + rim fredda (rim solo high/mid) —
    const key = new THREE.DirectionalLight(0xffd98a, 1.9);
    key.position.set(2.5, 3.5, 4);
    scene.add(key);
    handle.key = key;
    handle.rim = null;
    if (quality.tier !== 'low') {
      const rim = new THREE.DirectionalLight(0x8d9db4, 1.0);
      rim.position.set(-3, 1.5, -5);
      scene.add(rim);
      handle.rim = rim;
    }
    const amb = new THREE.AmbientLight(0x171208, 0.7);
    scene.add(amb);
    handle.amb = amb;

    return handle;
  },

  update(handle, frame) {
    const p = frame.progress;
    const appr = sstep(0.0, 0.35, p);
    const dwellK = sstep(0.30, 0.42, p) * (1 - sstep(0.58, 0.72, p));
    const exitK = sstep(0.72, 1.0, p);
    const fadeOut = sstep(0.8, 1.0, p);

    // tempi accumulati: congelamento senza discontinuità
    handle.slowT += frame.dt * (1 - 0.97 * dwellK);
    handle.sparkT += frame.dt * (1 - 0.9 * dwellK);
    // exit: il tempo riparte e accelera
    handle.exitSpin += frame.dt * exitK * (0.5 + 2.2 * exitK);

    // scrub: lo scroll riavvolge (approach) / fa ripartire (exit) i gusci
    const drift = handle.slowT * 0.02;
    handle.inner.rotation.y = -p * 1.35 + drift + handle.exitSpin;
    handle.outer.rotation.y = p * 0.85 - drift * 0.7 - handle.exitSpin * 0.75;
    handle.outer.rotation.z = -p * 0.4;

    // pulse radiale: 1 ogni ~5s, solo nel dwell
    if (dwellK > 0.05) {
      handle.pulseT += frame.dt;
      if (handle.pulseT > 5) handle.pulseT -= 5;
    } else {
      handle.pulseT = 0;
    }
    const pt = handle.pulseT;
    handle.pulseUni.uPulseR.value = pt * 2.4;
    handle.pulseUni.uPulseAmp.value =
      dwellK * sstep(0, 0.15, pt) * (1 - sstep(2.0, 3.0, pt)) * 1.1;

    // luci: salgono entrando, muoiono nel nero del varco
    handle.key.intensity = 2.2 * (0.25 + 0.75 * appr) * (1 - 0.95 * fadeOut);
    if (handle.rim) handle.rim.intensity = 1.0 * (0.2 + 0.8 * appr) * (1 - fadeOut);
    handle.amb.intensity = 0.7 * (1 - 0.85 * fadeOut);
    handle.cubeMat.emissiveIntensity = 0.32 * (1 - 0.9 * fadeOut);

    const su = handle.sparkUni;
    su.uTime.value = handle.sparkT;
    su.uFade.value = (0.35 + 0.65 * appr) * (1 - fadeOut);
    su.uPointScale.value = handle.viewport.h * handle.viewport.dpr * 0.009;
  },

  dispose(handle) {
    handle.inner.dispose(); // libera i buffer di istanza
    handle.outer.dispose();
    for (const g of handle.geometries) g.dispose();
    for (const m of handle.materials) m.dispose();
    handle.geometries.length = 0;
    handle.materials.length = 0;
  },
};
