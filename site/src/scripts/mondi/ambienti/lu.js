/**
 * MONDI · ambiente 8 — lu — «macro di vetro e fibra»
 * Contratto: content-notes/mondi-architettura.md §2 e §4.8.
 *
 * Lu è piccolo: il mondo è in scala macro, intimo. Sfere di vetro sospese e
 * 12 filamenti di fibra ottica i cui impulsi azzurri corrono lungo la via e,
 * nel dwell, convergono tutti insieme sull'opera con un respiro di ~4s.
 * In exit gli impulsi si spengono e i micro-glint si disperdono come lucciole
 * nel buio caldo del meccanismo finale.
 *
 * Draw call (high): sfere instanced 1 + fibre fuse 1 + glint 1 + ink 1 = 4.
 * Particelle ≤ 1k. Nessuna allocazione in update. Unica casualità: ctx.prng.
 */

import * as THREE from 'three';

export const preload = [
  '/images/gen/Lu-1200.webp',
  '/viaggio/lu-mezzaluna.webp',
];

export const depth = 11;

/* ------------------------------------------------------------------ utils */

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function sstep(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
function damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); }

/**
 * Fonde più geometrie indicizzate (position+uv) in una sola, aggiungendo un
 * attributo float `idName` costante per sorgente (per animare per-fibra).
 */
function mergeIndexedWithId(geos, idName) {
  let vTot = 0, iTot = 0;
  for (const g of geos) { vTot += g.getAttribute('position').count; iTot += g.index.count; }
  const pos = new Float32Array(vTot * 3);
  const uv = new Float32Array(vTot * 2);
  const ids = new Float32Array(vTot);
  const IndexArray = vTot > 65535 ? Uint32Array : Uint16Array;
  const idx = new IndexArray(iTot);
  let vo = 0, io = 0;
  geos.forEach((g, gi) => {
    const p = g.getAttribute('position'), u = g.getAttribute('uv'), ix = g.index;
    pos.set(p.array, vo * 3);
    uv.set(u.array, vo * 2);
    ids.fill(gi, vo, vo + p.count);
    for (let k = 0; k < ix.count; k++) idx[io + k] = ix.array[k] + vo;
    vo += p.count; io += ix.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute(idName, new THREE.BufferAttribute(ids, 1));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/* ---------------------------------------------------------------- shaders */

const SPHERE_VERT = /* glsl */ `
  // instanceMatrix è già dichiarato da three.js (USE_INSTANCING) per gli
  // ShaderMaterial su InstancedMesh: NON ridichiararlo.
  attribute float aPhase;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vW;
  varying float vPh;
  void main() {
    vec4 ip = instanceMatrix * vec4(position, 1.0);
    ip.y += sin(uTime * 0.32 + aPhase * 6.2831) * 0.06; // respiro di sospensione
    vec4 wp = modelMatrix * ip;
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vPh = aPhase;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SPHERE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform vec3 uAzz;
  varying vec3 vN;
  varying vec3 vW;
  varying float vPh;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    float fres = pow(1.0 - abs(dot(N, V)), 2.6);
    float hi = pow(max(dot(N, normalize(vec3(0.5, 0.8, 0.6))), 0.0), 28.0);
    float sweep = 0.55 + 0.45 * sin(uTime * 0.4 + vPh * 6.2831 + vW.x * 1.8);
    float d = length(cameraPosition - vW);
    float fade = exp(-d * 0.09);
    vec3 col = uAzz * fres * sweep * uGlow + vec3(0.9, 0.95, 1.0) * hi * 0.5 * uGlow;
    gl_FragColor = vec4(col * fade, 1.0);
  }
`;

const FIBER_VERT = /* glsl */ `
  attribute float aFiber;
  varying vec2 vUvv;
  varying float vF;
  varying vec3 vW;
  void main() {
    vUvv = uv;
    vF = aFiber;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FIBER_FRAG = /* glsl */ `
  uniform float uPulseT;
  uniform float uSync;
  uniform float uAmp;
  uniform float uBase;
  uniform vec3 uAzz;
  varying vec2 vUvv;
  varying float vF;
  varying vec3 vW;
  void main() {
    // fase per-fibra (aurea, non periodica) che si annulla quando uSync -> 1:
    // nel dwell tutti gli impulsi arrivano insieme sull'opera (uv.x = 1).
    float ph = fract(vF * 0.61803) * (1.0 - uSync);
    float f = fract(vUvv.x - uPulseT - ph);
    float head = smoothstep(0.16, 0.0, f);
    float glowLine = 0.09 + 0.05 * sin(vUvv.x * 34.0 + vF * 3.1);
    float d = length(cameraPosition - vW);
    float fade = exp(-d * 0.08);
    vec3 col = uAzz * (glowLine * uBase + head * uAmp * 1.9)
             + vec3(1.0) * head * head * uAmp * 0.45;
    gl_FragColor = vec4(col * fade, 1.0);
  }
`;

const GLINT_VERT = /* glsl */ `
  attribute vec3 aDir;   // direzione di fuga (lucciole, in exit)
  attribute vec2 aTw;    // x: fase twinkle, y: velocità/ampiezza
  uniform float uTime;
  uniform float uScatter;
  uniform float uSize;
  varying float vTw;
  void main() {
    vec3 p = position + aDir * uScatter * (1.1 + aTw.y * 1.6);
    vTw = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.8 + aTw.y * 2.4) + aTw.x * 6.2831));
    vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
    gl_PointSize = min(4.5, uSize * (0.6 + aTw.y) / max(0.6, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const GLINT_FRAG = /* glsl */ `
  uniform vec3 uAzz;
  uniform float uOpacity;
  varying float vTw;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float a = smoothstep(0.5, 0.1, d) * vTw * uOpacity;
    gl_FragColor = vec4(mix(uAzz, vec3(0.92, 0.96, 1.0), vTw * 0.5), a);
  }
`;

/* ----------------------------------------------------------------- module */

export default {
  id: 'lu',
  colors: {
    entry: '#061020', // dalla finestra sul retro di la-casa-di-mike
    exit: '#0b0a08',  // verso il buio meccanico di avventura-di-una-vita
    fog: '#061020',
  },

  async init(ctx) {
    const { scene, prng, quality } = ctx;
    const tier = quality.tier;
    const h = {
      ctx,
      depth,
      group: new THREE.Group(),
      pulseT: 0,
      pulseRate: 0.3,
      sync: 0,
      amp: 0.9,
      scatter: 0,
      exitK: 0,
      cFogBase: new THREE.Color('#061020'),
      cFogExit: new THREE.Color('#0b0a08'),
      disposables: [],
      // suggerimento facoltativo per il veil pass: sensazione di lente macro
      veilHints: { vignette: 0.32, blur: 0.12 },
    };
    scene.add(h.group);

    scene.fog = new THREE.Fog(h.cFogBase.getHex(), 4.5, 14);
    scene.background = new THREE.Color('#061020');
    h.fog = scene.fog;
    h.bg = scene.background;

    /* --- sfere di vetro (InstancedMesh + fresnel, 1 dc) --- */
    const sphereCount = tier === 'high' ? 40 : tier === 'mid' ? 26 : 14;
    const sphereGeo = new THREE.IcosahedronGeometry(1, 3);
    const sphereMat = new THREE.ShaderMaterial({
      vertexShader: SPHERE_VERT,
      fragmentShader: SPHERE_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uGlow: { value: 1 },
        uAzz: { value: new THREE.Color('#4a93e6') },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const spheres = new THREE.InstancedMesh(sphereGeo, sphereMat, sphereCount);
    spheres.frustumCulled = false;
    const phases = new Float32Array(sphereCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < sphereCount; i++) {
      let x, y;
      if (i < 3) {
        // tre sfere-protagoniste che incorniciano la stanza dell'opera:
        // MAI nel volume tra camera e quadro (erano blob traslucidi sul rosso)
        x = (i % 2 === 0 ? 1 : -1) * (2.0 + prng() * 0.5);
        y = (prng() - 0.5) * 1.6;
        dummy.position.set(x, y, [1.2, -1.6, -2.8][i]);
        dummy.scale.setScalar(0.45 + prng() * 0.3);
      } else {
        const ang = prng() * 6.283;
        const r = 1.0 + prng() * 2.2;
        x = Math.cos(ang) * r;
        y = Math.sin(ang) * r * 0.7;
        const z = 10.5 - prng() * 14;
        // corridoio libero: largo davanti al piano dell'opera (z > -0.2),
        // stretto solo dietro — l'opera resta intera e protagonista
        const minX = z > -0.2 ? 1.8 : 0.7;
        if (Math.abs(x) < minX) x = (x >= 0 ? 1 : -1) * (minX + prng() * 0.5);
        dummy.position.set(x, Math.max(-2.2, Math.min(2.2, y)), z);
        dummy.scale.setScalar(0.12 + Math.pow(prng(), 1.6) * 0.5);
      }
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      spheres.setMatrixAt(i, dummy.matrix);
      phases[i] = prng();
    }
    spheres.instanceMatrix.needsUpdate = true;
    sphereGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    h.group.add(spheres);
    h.sphereMat = sphereMat;
    h.disposables.push(sphereGeo, sphereMat);

    /* --- 12 fibre ottiche fuse in una geometria (1 dc) --- */
    const fiberCount = tier === 'low' ? 7 : 12;
    const tubes = [];
    const pA = new THREE.Vector3(), pB = new THREE.Vector3(),
      pC = new THREE.Vector3(), pD = new THREE.Vector3();
    // le fibre NON attraversano mai il volume davanti al quadro: ogni punto
    // di controllo davanti al piano opera (z > -0.2) resta fuori dal corridoio
    // centrale (erano i fasci diagonali che tagliavano la tela rossa)
    const keepOut = (v, minX) => {
      if (v.z > -0.2 && Math.abs(v.x) < minX) {
        v.x = (v.x >= 0 ? 1 : -1) * (minX + prng() * 0.3);
      }
      return v;
    };
    for (let i = 0; i < fiberCount; i++) {
      const a0 = (i / fiberCount) * 6.283 + prng() * 0.5;
      const r0 = 2.2 + prng() * 1.1;
      pA.set(Math.cos(a0) * r0, Math.sin(a0) * r0 * 0.75, 9.5 + prng() * 2.5);
      pB.set(Math.cos(a0 + 0.9) * r0 * 0.7, Math.sin(a0 + 0.9) * r0 * 0.55, 6.0 + prng() * 1.5);
      pC.set(Math.cos(a0 + 1.8) * r0 * 0.45, Math.sin(a0 + 1.8) * r0 * 0.4, 2.8 + prng());
      keepOut(pB, 1.5);
      keepOut(pC, 1.7);
      // approdo: il FIANCO dell'opera, appena dietro il piano (z = −0.25),
      // sullo STESSO lato da cui arriva la fibra (un lato casuale faceva
      // incrociare la curva proprio davanti alla tela)
      const sideD = pC.x >= 0 ? 1 : -1;
      pD.set(
        sideD * (1.35 + prng() * 0.35),
        (prng() - 0.5) * 1.5,
        -0.25 - prng() * 0.1,
      );
      const curve = new THREE.CatmullRomCurve3(
        [pA.clone(), pB.clone(), pC.clone(), pD.clone()],
      );
      tubes.push(new THREE.TubeGeometry(curve, 60, 0.012, 5, false));
    }
    const fiberGeo = mergeIndexedWithId(tubes, 'aFiber');
    for (const g of tubes) g.dispose();
    const fiberMat = new THREE.ShaderMaterial({
      vertexShader: FIBER_VERT,
      fragmentShader: FIBER_FRAG,
      uniforms: {
        uPulseT: { value: 0 },
        uSync: { value: 0 },
        uAmp: { value: 0.9 },
        uBase: { value: 1 },
        uAzz: { value: new THREE.Color('#4a93e6') },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const fibers = new THREE.Mesh(fiberGeo, fiberMat);
    fibers.frustumCulled = false;
    h.group.add(fibers);
    h.fiberMat = fiberMat;
    h.disposables.push(fiberGeo, fiberMat);

    /* --- micro-glint (lucciole in potenza) --- */
    const glintCount = Math.min(
      tier === 'high' ? 1000 : tier === 'mid' ? 600 : 300,
      quality.maxParticles || 12000,
    );
    const gPos = new Float32Array(glintCount * 3);
    const gDir = new Float32Array(glintCount * 3);
    const gTw = new Float32Array(glintCount * 2);
    for (let i = 0; i < glintCount; i++) {
      let gx = (prng() - 0.5) * 6;
      const gz = 10.5 - prng() * 14.5;
      // niente lucciole sospese davanti alla tela: corridoio libero come sopra
      if (gz > -0.2 && Math.abs(gx) < 1.5) gx = (gx >= 0 ? 1 : -1) * (1.5 + prng() * 0.6);
      gPos[i * 3] = gx;
      gPos[i * 3 + 1] = (prng() - 0.5) * 4;
      gPos[i * 3 + 2] = gz;
      // direzione di dispersione (mai davanti all'opera: via dai lati)
      const dx = prng() - 0.5, dy = prng() * 0.7 + 0.1, dz = -(prng() * 0.5);
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      gDir[i * 3] = (dx / len) * (Math.abs(dx) < 0.1 ? 3 : 2);
      gDir[i * 3 + 1] = dy / len;
      gDir[i * 3 + 2] = dz / len;
      gTw[i * 2] = prng();
      gTw[i * 2 + 1] = prng();
    }
    const glintGeo = new THREE.BufferGeometry();
    glintGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
    glintGeo.setAttribute('aDir', new THREE.BufferAttribute(gDir, 3));
    glintGeo.setAttribute('aTw', new THREE.BufferAttribute(gTw, 2));
    const glintMat = new THREE.ShaderMaterial({
      vertexShader: GLINT_VERT,
      fragmentShader: GLINT_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uScatter: { value: 0 },
        uSize: { value: 3.5 },
        uOpacity: { value: 0.7 },
        uAzz: { value: new THREE.Color('#4a93e6') },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const glints = new THREE.Points(glintGeo, glintMat);
    glints.frustumCulled = false;
    h.group.add(glints);
    h.glintMat = glintMat;
    h.disposables.push(glintGeo, glintMat);

    /* --- respiro di luce sull'opera (1 luce dinamica) --- */
    h.breathLight = new THREE.PointLight('#4a93e6', 0.25, 8);
    h.breathLight.position.set(0, 0.4, 1.6);
    scene.add(h.breathLight);

    /* --- ink `lu-mezzaluna`, fioca in fondale (op ≤ 0.3) --- */
    if (tier !== 'low') {
      try {
        const inkPath = ctx.assets && ctx.assets.ink
          ? ctx.assets.ink('lu-mezzaluna') : '/viaggio/lu-mezzaluna.webp';
        const tex = await ctx.loadTexture(inkPath);
        const ar = tex.image && tex.image.width ? tex.image.width / tex.image.height : 1;
        const inkGeo = new THREE.PlaneGeometry(2.8 * ar, 2.8);
        const inkMat = new THREE.MeshBasicMaterial({
          map: tex, transparent: true, opacity: 0.3, depthWrite: false,
        });
        const ink = new THREE.Mesh(inkGeo, inkMat);
        ink.position.set(-1.1, 1.2, -5.5);
        h.group.add(ink);
        h.inkMat = inkMat;
        h.disposables.push(inkGeo, inkMat);
      } catch (e) { /* la mezzaluna è un dono, non un requisito */ }
    }

    return h;
  },

  update(h, frame) {
    const dt = frame.dt;
    const t = frame.time;
    const p = frame.progress;
    const dwell = frame.phase === 'dwell';
    const exiting = frame.phase === 'exit';

    // respiro ~4s (periodo 2π/1.5708)
    const breath = 0.5 + 0.5 * Math.sin(t * 1.5708);

    // impulsi: corrono in avvicinamento, si sincronizzano nel dwell,
    // si spengono nell'exit
    const speed = Math.min(Math.abs(frame.velocity), 1.2);
    const rateTarget = exiting ? 0.1 : dwell ? 0.25 : 0.3 + 0.35 * speed;
    h.pulseRate = damp(h.pulseRate, rateTarget, 2.5, dt);
    h.pulseT += dt * h.pulseRate;
    h.sync = damp(h.sync, dwell ? 1 : 0, 2.5, dt);
    const ampTarget = exiting ? 0.2 : dwell ? 0.55 + 0.5 * breath : 0.9;
    h.amp = damp(h.amp, ampTarget, 3, dt);

    const fu = h.fiberMat.uniforms;
    fu.uPulseT.value = h.pulseT;
    fu.uSync.value = h.sync;
    fu.uAmp.value = h.amp;

    // varco: le luci si staccano e disperdono come lucciole
    const kTarget = exiting ? sstep((p - 0.62) / 0.34) : 0;
    h.exitK = damp(h.exitK, kTarget, 3.5, dt);
    fu.uBase.value = 1 - h.exitK * 0.85;
    h.scatter = damp(h.scatter, h.exitK * 2.4, 2, dt);
    h.glintMat.uniforms.uScatter.value = h.scatter;
    h.glintMat.uniforms.uTime.value = t;
    h.glintMat.uniforms.uSize.value =
      h.ctx.viewport.h * (h.ctx.viewport.dpr || 1) * 0.0035;
    h.glintMat.uniforms.uOpacity.value = 0.7 - h.exitK * 0.25;

    h.sphereMat.uniforms.uTime.value = t;
    h.sphereMat.uniforms.uGlow.value = 1 - h.exitK * 0.6;

    // la stanza respira con gli impulsi
    h.breathLight.intensity = dwell
      ? 0.25 + 0.45 * breath
      : damp(h.breathLight.intensity, 0.18, 2, dt);

    h.fog.color.lerpColors(h.cFogBase, h.cFogExit, h.exitK);
    h.bg.lerpColors(h.cFogBase, h.cFogExit, h.exitK);

    if (h.inkMat) h.inkMat.opacity = 0.3 * (1 - h.exitK * 0.7);
  },

  dispose(h) {
    const scene = h.group.parent;
    if (scene) {
      scene.remove(h.group);
      if (h.breathLight) scene.remove(h.breathLight);
    }
    for (const d of h.disposables) d.dispose();
    h.disposables.length = 0;
    h.group.clear();
  },
};
