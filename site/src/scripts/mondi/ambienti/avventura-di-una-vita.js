/**
 * MONDI · ambiente 9 (finale) — avventura-di-una-vita — «il meccanismo»
 * Contratto: content-notes/mondi-architettura.md §2 e §4.9.
 *
 * Nessuna foto: l'opera È il disegno della clessidra (texture alpha
 * /viaggio/avventura-clessidra.webp, gestita dall'engine come opera-plane) e
 * l'ambiente è il suo meccanismo: una parete di ingranaggi nero-inchiostro con
 * filo d'oro sul bordo, rapporti concatenati (i:i+1 = −r_i/r_{i+1}), due viti
 * di Archimede, fili d'osso, un flusso di sabbia d'oro che cade nel centro
 * della clessidra. Il tempo si SCRUBBA con lo scroll: avanti = gira, fermo =
 * regime minimo, indietro = riavvolge. In exit tutto si arresta, la sabbia
 * resta sospesa a mezz'aria e il mondo dissolve nel blu notte della coda.
 *
 * Draw call (high): ingranaggi fusi 1 + viti 2×(ribbon+albero) 4 + sabbia 1 +
 * fili d'osso 1 + ink `avventura-bussola` 1 = 8 (≤ ~12 di scheda).
 * Particelle ≤ 2k. Nessuna allocazione in update. Unica casualità: ctx.prng.
 */

import * as THREE from 'three';

export const preload = [
  '/viaggio/avventura-clessidra.webp',
  '/viaggio/avventura-bussola.webp',
];

export const depth = 13;

const MAX_GEARS = 10; // taglia fissa degli array uniform

/* ------------------------------------------------------------------ utils */

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function sstep(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
function damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); }

/** Sagoma ingranaggio: denti trapezoidali parametrici + foro centrale. */
function gearShape(teeth, rOut, toothH, rHole) {
  const shape = new THREE.Shape();
  const rBase = rOut - toothH;
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const pts = [
      [a0, rBase],
      [a0 + step * 0.22, rBase],
      [a0 + step * 0.34, rOut],
      [a0 + step * 0.66, rOut],
      [a0 + step * 0.78, rBase],
    ];
    for (let k = 0; k < pts.length; k++) {
      const x = Math.cos(pts[k][0]) * pts[k][1];
      const y = Math.sin(pts[k][0]) * pts[k][1];
      if (i === 0 && k === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, rHole, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

/** Elicoide (vite di Archimede): nastro che avvolge un asse verticale (Y). */
function helicoidGeometry(turns, height, rOut, rIn) {
  const lengthSegs = Math.round(turns * 22);
  const radialSegs = 2;
  const verts = (lengthSegs + 1) * (radialSegs + 1);
  const pos = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  const idx = new (verts > 65535 ? Uint32Array : Uint16Array)(lengthSegs * radialSegs * 6);
  let vi = 0;
  for (let i = 0; i <= lengthSegs; i++) {
    const u = i / lengthSegs;
    const a = u * turns * Math.PI * 2;
    const y = (u - 0.5) * height;
    for (let j = 0; j <= radialSegs; j++) {
      const vv = j / radialSegs;
      const r = rIn + (rOut - rIn) * vv;
      pos[vi * 3] = Math.cos(a) * r;
      pos[vi * 3 + 1] = y;
      pos[vi * 3 + 2] = Math.sin(a) * r;
      uv[vi * 2] = u; uv[vi * 2 + 1] = vv;
      vi++;
    }
  }
  let ii = 0;
  for (let i = 0; i < lengthSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * (radialSegs + 1) + j;
      const b = a + radialSegs + 1;
      idx[ii++] = a; idx[ii++] = b; idx[ii++] = a + 1;
      idx[ii++] = b; idx[ii++] = b + 1; idx[ii++] = a + 1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return geo;
}

/* ---------------------------------------------------------------- shaders */

const GEAR_VERT = /* glsl */ `
  attribute float aGear;
  uniform float uAngles[${MAX_GEARS}];
  uniform vec3 uCenters[${MAX_GEARS}];
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    int gi = int(aGear + 0.5);
    float a = uAngles[gi];
    float c = cos(a), s = sin(a);
    vec3 p = vec3(c * position.x - s * position.y, s * position.x + c * position.y, position.z);
    vec3 n = vec3(c * normal.x - s * normal.y, s * normal.x + c * normal.y, normal.z);
    vec4 w = modelMatrix * vec4(p + uCenters[gi], 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const GEAR_FRAG = /* glsl */ `
  uniform vec3 uGold;
  uniform float uRim;
  uniform vec3 uFog;
  uniform vec2 uFogRange;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    // nero-inchiostro con una traccia calda sulle facce rivolte alla luce
    // (base alzata: le silhouette devono leggersi sul fondo, non sparire)
    float lam = 0.5 + 0.5 * dot(N, normalize(vec3(0.4, 0.7, 0.55)));
    vec3 col = mix(vec3(0.05, 0.04, 0.028), vec3(0.17, 0.126, 0.075), lam * 0.7);
    // filo di luce dorata sul bordo (fresnel di silhouette)
    float fres = pow(1.0 - abs(dot(N, V)), 2.3);
    col += uGold * fres * uRim;
    // i fianchi estrusi (denti) prendono un riflesso d'oro radente
    col += uGold * (1.0 - abs(N.z)) * 0.06 * uRim;
    float d = length(cameraPosition - vW);
    float fk = smoothstep(uFogRange.x, uFogRange.y, d);
    gl_FragColor = vec4(mix(col, uFog, fk), 1.0);
  }
`;

const SAND_VERT = /* glsl */ `
  attribute vec4 aRand; // x: seme ciclo, y: velocità, z: angolo, w: raggio
  uniform float uSandT;
  uniform float uSize;
  varying float vGlow;
  void main() {
    float f = fract(aRand.x + uSandT * (0.5 + aRand.y * 0.7));
    // clessidra: stretta al collo (f=0.5), larga alle estremità
    float w = 0.025 + 0.24 * pow(abs(f - 0.5) * 2.0, 1.6);
    float ang = aRand.z * 6.2831;
    vec3 p = vec3(
      cos(ang) * w * aRand.w,
      0.95 - f * 2.0,
      sin(ang) * w * aRand.w * 0.35
    );
    vGlow = 0.6 + 0.4 * sin(aRand.x * 40.0 + f * 12.0);
    vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
    gl_PointSize = min(3.5, uSize * (0.5 + aRand.w * 0.8) / max(0.6, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const SAND_FRAG = /* glsl */ `
  uniform vec3 uGold;
  uniform float uOpacity;
  varying float vGlow;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float a = smoothstep(0.5, 0.12, d) * vGlow * uOpacity;
    gl_FragColor = vec4(uGold, a);
  }
`;

/* ----------------------------------------------------------------- module */

export default {
  id: 'avventura-di-una-vita',
  colors: {
    entry: '#0b0a08', // dal buio dove si spengono le lucciole di lu
    exit: '#050a1a',  // dissolvenza nel blu notte della coda
    fog: '#0b0a08',
  },

  async init(ctx) {
    const { scene, prng, quality } = ctx;
    const tier = quality.tier;
    const h = {
      ctx,
      depth,
      group: new THREE.Group(),
      // stato del meccanismo (scrubbing)
      mech: 0,
      pPrev: 0,
      stopK: 0,
      exitK: 0,
      flow: 0.8,
      sandT: 0,
      uAngles: new Float32Array(MAX_GEARS),
      ratios: new Float32Array(MAX_GEARS),
      phase0: new Float32Array(MAX_GEARS),
      gearCount: 0,
      cFogBase: new THREE.Color('#0b0a08'),
      cFogExit: new THREE.Color('#050a1a'),
      disposables: [],
    };
    scene.add(h.group);

    // fog allargata: in approach (camera a z≈13) il meccanismo si intravede
    // già — prima era tutto oltre il far della nebbia = schermo nero
    scene.fog = new THREE.Fog(h.cFogBase.getHex(), 6, 26);
    scene.background = new THREE.Color('#0b0a08');
    h.fog = scene.fog;
    h.bg = scene.background;

    /* --- ingranaggi: parete dietro la clessidra + sentinelle sul binario ---
       Tutti fusi in UNA geometria; ogni vertice porta l'indice del proprio
       ingranaggio (aGear) e la rotazione avviene nel vertex shader. */
    const wallCount = tier === 'high' ? 6 + Math.floor(prng() * 2) : tier === 'mid' ? 5 : 4;
    const fgCount = tier === 'high' ? 2 : 1;
    const radii = [];
    const centers = [];
    // CORONA attorno all'opera: catena di ingranaggi che si toccano lungo un
    // anello di raggio R — mai davanti al quad della clessidra (la parete
    // ricentrata finiva ammassata in colonna proprio sopra l'opera)
    const RING = 2.45;
    let ringAng = Math.PI * 0.72 + prng() * 0.3; // parte in alto a sinistra
    for (let i = 0; i < wallCount; i++) {
      const r = 0.42 + prng() * 0.55;
      if (i > 0) ringAng -= (radii[i - 1] + r) / RING; // denti che ingranano
      radii.push(r);
      centers.push([
        Math.cos(ringAng) * RING,
        Math.sin(ringAng) * RING * 0.92,
        -1.8 - prng() * 0.5,
      ]);
    }
    // sentinelle lungo l'avvicinamento (quinte LATERALI: fuori dal quad opera)
    const fgSpots = [[-3.3, -1.0, 4.6, 0.55], [3.5, 1.2, 7.4, 0.68]];
    for (let i = 0; i < fgCount; i++) {
      radii.push(fgSpots[i][3]);
      centers.push([fgSpots[i][0], fgSpots[i][1], fgSpots[i][2]]);
    }
    h.gearCount = radii.length;

    // rapporti concatenati: i:i+1 = −r_i / r_{i+1} (parete); sentinelle libere
    h.ratios[0] = 1;
    for (let i = 1; i < wallCount; i++) h.ratios[i] = -h.ratios[i - 1] * radii[i - 1] / radii[i];
    for (let i = wallCount; i < h.gearCount; i++) {
      h.ratios[i] = (i % 2 === 0 ? 1 : -1) * (0.5 / radii[i]);
    }
    for (let i = 0; i < h.gearCount; i++) h.phase0[i] = prng() * Math.PI * 2;

    // modulo dente ~costante: denti proporzionali al raggio (ingranano)
    const gearGeos = [];
    let vTot = 0;
    for (let i = 0; i < h.gearCount; i++) {
      const r = radii[i];
      const teeth = Math.max(8, Math.min(20, Math.round(r / 0.055)));
      const shape = gearShape(teeth, r, Math.min(0.14, r * 0.3), r * 0.2);
      let g = new THREE.ExtrudeGeometry(shape, {
        depth: 0.1 + r * 0.05, bevelEnabled: false, curveSegments: 6,
      });
      if (g.index) g = g.toNonIndexed();
      gearGeos.push(g);
      vTot += g.getAttribute('position').count;
    }
    const gPos = new Float32Array(vTot * 3);
    const gNor = new Float32Array(vTot * 3);
    const gId = new Float32Array(vTot);
    let vo = 0;
    gearGeos.forEach((g, gi) => {
      const p = g.getAttribute('position'), n = g.getAttribute('normal');
      gPos.set(p.array, vo * 3);
      gNor.set(n.array, vo * 3);
      gId.fill(gi, vo, vo + p.count);
      vo += p.count;
      g.dispose();
    });
    const gearGeo = new THREE.BufferGeometry();
    gearGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
    gearGeo.setAttribute('normal', new THREE.BufferAttribute(gNor, 3));
    gearGeo.setAttribute('aGear', new THREE.BufferAttribute(gId, 1));

    const uCenters = new Float32Array(MAX_GEARS * 3);
    for (let i = 0; i < h.gearCount; i++) {
      uCenters[i * 3] = centers[i][0];
      uCenters[i * 3 + 1] = centers[i][1];
      uCenters[i * 3 + 2] = centers[i][2];
    }
    const gearMat = new THREE.ShaderMaterial({
      vertexShader: GEAR_VERT,
      fragmentShader: GEAR_FRAG,
      uniforms: {
        uAngles: { value: h.uAngles },
        uCenters: { value: uCenters },
        uGold: { value: new THREE.Color('#d7a94b') },
        uRim: { value: 1.05 },
        uFog: { value: h.fog.color }, // stessa istanza: segue la dissolvenza
        uFogRange: { value: new THREE.Vector2(6, 26) },
      },
    });
    const gears = new THREE.Mesh(gearGeo, gearMat);
    gears.frustumCulled = false; // le posizioni vere vivono in uCenters
    h.group.add(gears);
    h.gearMat = gearMat;
    h.disposables.push(gearGeo, gearMat);

    /* --- due viti di Archimede ai lati della clessidra --- */
    const screwMat = new THREE.MeshStandardMaterial({
      color: '#1a1410', metalness: 0.6, roughness: 0.45,
      emissive: '#2c2110', emissiveIntensity: 0.3,
    });
    const ribbonGeo = helicoidGeometry(5, 3.1, 0.27, 0.05);
    const shaftGeo = new THREE.CylinderGeometry(0.045, 0.045, 3.25, 8);
    h.screws = [];
    // ai fianchi della corona, mai a filo del bordo opera (leggevano come
    // due linee verticali di una "cornice rotta")
    const screwX = [-2.15, 2.2];
    for (let i = 0; i < 2; i++) {
      const grp = new THREE.Group();
      grp.position.set(screwX[i], -0.1, -0.55);
      grp.add(new THREE.Mesh(ribbonGeo, screwMat));
      grp.add(new THREE.Mesh(shaftGeo, screwMat));
      h.group.add(grp);
      h.screws.push(grp);
    }
    h.disposables.push(ribbonGeo, shaftGeo, screwMat);

    /* --- fili d'osso: la trasmissione che lega il meccanismo --- */
    const threadPts = [];
    for (let i = 0; i < wallCount - 1; i++) {
      threadPts.push(
        centers[i][0], centers[i][1], centers[i][2],
        centers[i + 1][0], centers[i + 1][1], centers[i + 1][2],
      );
    }
    for (let i = 0; i < 2; i++) {
      threadPts.push(screwX[i], 2.6, -0.55, screwX[i], 1.55, -0.55);
    }
    const threadGeo = new THREE.BufferGeometry();
    threadGeo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(threadPts), 3));
    const threadMat = new THREE.LineBasicMaterial({
      color: '#f4f0e0', transparent: true, opacity: 0.24, depthWrite: false,
    });
    const threads = new THREE.LineSegments(threadGeo, threadMat);
    h.group.add(threads);
    h.threadMat = threadMat;
    h.disposables.push(threadGeo, threadMat);

    /* --- sabbia d'oro nel centro della clessidra (opera-plane a z=0) --- */
    const sandCount = Math.min(
      tier === 'high' ? 2000 : tier === 'mid' ? 1200 : 600,
      quality.maxParticles || 12000,
    );
    const sPos = new Float32Array(sandCount * 3); // riempita nel vertex shader
    const sRand = new Float32Array(sandCount * 4);
    for (let i = 0; i < sandCount; i++) {
      sRand[i * 4] = prng();
      sRand[i * 4 + 1] = prng();
      sRand[i * 4 + 2] = prng();
      sRand[i * 4 + 3] = 0.2 + prng() * 0.8;
    }
    const sandGeo = new THREE.BufferGeometry();
    sandGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sandGeo.setAttribute('aRand', new THREE.BufferAttribute(sRand, 4));
    const sandMat = new THREE.ShaderMaterial({
      vertexShader: SAND_VERT,
      fragmentShader: SAND_FRAG,
      uniforms: {
        uSandT: { value: 0 },
        uSize: { value: 3 },
        uOpacity: { value: 0.75 },
        uGold: { value: new THREE.Color('#d7a94b') },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const sand = new THREE.Points(sandGeo, sandMat);
    sand.position.set(0, 0, -0.12); // appena DIETRO il disegno: traspare
    // dall'alpha della clessidra senza mai coprire il tratto
    sand.frustumCulled = false;
    h.group.add(sand);
    h.sandMat = sandMat;
    h.disposables.push(sandGeo, sandMat);

    /* --- luci: chiave dorata + tocco d'osso (alzate: il mondo era illeggibile) --- */
    h.ambient = new THREE.AmbientLight('#4a3a24', 1.4);
    scene.add(h.ambient);
    h.key = new THREE.DirectionalLight('#d7a94b', 1.6);
    h.key.position.set(2, 3, 4);
    scene.add(h.key);
    if (tier !== 'low') {
      h.fill = new THREE.PointLight('#f4f0e0', 0.45, 14);
      h.fill.position.set(0, 1.8, 2.5);
      scene.add(h.fill);
    }

    /* --- ink `avventura-bussola`: quadrante di fondo (op ≤ 0.4) --- */
    if (tier !== 'low') {
      try {
        const inkPath = ctx.assets && ctx.assets.ink
          ? ctx.assets.ink('avventura-bussola') : '/viaggio/avventura-bussola.webp';
        const tex = await ctx.loadTexture(inkPath);
        const ar = tex.image && tex.image.width ? tex.image.width / tex.image.height : 1;
        const inkGeo = new THREE.PlaneGeometry(6.5 * ar, 6.5);
        // il tratto nero del disegno sparirebbe sul fondo scuro: si usa l'alpha
        // come maschera e si ricolora il segno in pergamena/oro (leggibile)
        const inkMat = new THREE.ShaderMaterial({
          uniforms: {
            uMap: { value: tex },
            uColor: { value: new THREE.Color('#c3a76d') },
            uOp: { value: 0.8 },
          },
          vertexShader: /* glsl */ `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: /* glsl */ `
            precision mediump float;
            uniform sampler2D uMap;
            uniform vec3 uColor;
            uniform float uOp;
            varying vec2 vUv;
            void main() {
              vec4 t = texture2D(uMap, vUv);
              float m = t.a * (1.0 - dot(t.rgb, vec3(0.333)) * 0.3);
              gl_FragColor = vec4(uColor, m * uOp);
            }
          `,
          transparent: true, depthWrite: false,
        });
        h.dial = new THREE.Mesh(inkGeo, inkMat);
        h.dial.position.set(0.3, 0.2, -6.8);
        h.group.add(h.dial);
        h.inkMat = inkMat;
        h.disposables.push(inkGeo, inkMat);
      } catch (e) { /* il quadrante è ornamento, non struttura */ }
    }

    return h;
  },

  update(h, frame) {
    const dt = frame.dt;
    const t = frame.time;
    const p = frame.progress;
    const dwell = frame.phase === 'dwell';
    const exiting = frame.phase === 'exit';

    // arresto finale: il tempo si ferma davvero (exit → coda)
    const stopTarget = exiting ? sstep((p - 0.66) / 0.26) : 0;
    h.stopK = damp(h.stopK, stopTarget, 3, dt);

    // SCRUBBING: avanti = gira, fermo = regime minimo, indietro = riavvolge
    let dScrub = (p - h.pPrev) * 14;
    h.pPrev = p;
    if (dScrub > 0.25) dScrub = 0.25; else if (dScrub < -0.25) dScrub = -0.25;
    const idle = dwell ? 0.2 : 0.09;
    h.mech += (dScrub + idle * dt) * (1 - h.stopK);

    for (let i = 0; i < h.gearCount; i++) {
      h.uAngles[i] = h.mech * h.ratios[i] + h.phase0[i];
    }

    h.screws[0].rotation.y = h.mech * 2.3;
    h.screws[1].rotation.y = h.mech * -2.7;
    if (h.dial) h.dial.rotation.z = h.mech * 0.02;

    // sabbia: costante nel dwell, sospesa a mezz'aria nell'arresto
    const flowTarget = (1 - h.stopK) *
      (dwell ? 1.0 : 0.7 + Math.min(Math.abs(frame.velocity), 1.5) * 0.35);
    h.flow = damp(h.flow, flowTarget, 2.5, dt);
    h.sandT += dt * h.flow;
    h.sandMat.uniforms.uSandT.value = h.sandT;
    h.sandMat.uniforms.uSize.value =
      h.ctx.viewport.h * (h.ctx.viewport.dpr || 1) * 0.0028;

    // dissolvenza al blu notte della coda
    const kTarget = exiting ? sstep((p - 0.7) / 0.3) : 0;
    h.exitK = damp(h.exitK, kTarget, 3.5, dt);
    h.fog.color.lerpColors(h.cFogBase, h.cFogExit, h.exitK);
    h.bg.lerpColors(h.cFogBase, h.cFogExit, h.exitK);

    // filo d'oro: respira piano nel dwell, si raffredda nell'arresto
    const rimPulse = dwell ? 0.85 + 0.15 * Math.sin(t * 1.2) : 0.85;
    h.gearMat.uniforms.uRim.value = rimPulse * (1 - h.exitK * 0.8);
    h.key.intensity = 1.0 * (1 - h.exitK * 0.7);
    if (h.fill) h.fill.intensity = 0.3 * (1 - h.exitK);
    h.threadMat.opacity = 0.24 * (1 - h.exitK * 0.8);
    h.sandMat.uniforms.uOpacity.value = 0.75 * (1 - h.exitK * 0.55);
    if (h.inkMat) h.inkMat.uniforms.uOp.value = 0.8 * (1 - h.exitK * 0.85);
  },

  dispose(h) {
    const scene = h.group.parent;
    if (scene) {
      scene.remove(h.group);
      if (h.ambient) scene.remove(h.ambient);
      if (h.key) scene.remove(h.key);
      if (h.fill) scene.remove(h.fill);
    }
    for (const d of h.disposables) d.dispose();
    h.disposables.length = 0;
    h.group.clear();
  },
};
