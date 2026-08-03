// MONDI — ambiente 3: fuga — «il corridoio romano»
// Contratto: site/content-notes/mondi-architettura.md §2 (modulo) e §4.3 (scheda).
// Roma di notte: colonnato di arcate in prospettiva centrale serrata, pozze di
// luce ocra-sodio, UN solo glifo ESC rosso lontano (rosso raro). Il tempo del
// mondo si FERMA nel dwell (worldTime a rate 0) e riparte in exit, dove il
// corridoio si piega verso l'alto e le luci diventano striate.
// Nessun Math.random: solo ctx.prng. Nessuna allocazione in update.

import * as THREE from 'three';

export const preload = ['/viaggio/fuga-reticolo.webp'];

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ss = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

// Texture radiale procedurale per le pozze di luce sodio.
function makeGlowTexture(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g2 = c.getContext('2d');
  const grad = g2.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [off, col] of stops) grad.addColorStop(off, col);
  g2.fillStyle = grad;
  g2.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Glifo ESC: keycap disegnato su canvas (parte dell'opera: il tasto di fuga).
function makeEscTexture() {
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 128;
  const g2 = c.getContext('2d');
  g2.clearRect(0, 0, 192, 128);
  g2.strokeStyle = '#c8281c';
  g2.lineWidth = 5;
  g2.shadowColor = '#c8281c';
  g2.shadowBlur = 10;
  g2.beginPath();
  if (g2.roundRect) g2.roundRect(18, 18, 156, 92, 14);
  else g2.rect(18, 18, 156, 92);
  g2.stroke();
  g2.fillStyle = '#c8281c';
  g2.font = '600 42px "JetBrains Mono", monospace';
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';
  g2.fillText('ESC', 96, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const DUST_VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aSpeed;
  attribute float aSize;
  uniform float uTime;
  uniform float uDpr;
  uniform float uFade;
  varying float vA;
  void main() {
    vec3 pos = position;
    // deriva lenta nell'aria delle pozze di luce (congelata quando uTime si ferma)
    pos.x += sin(uTime * 0.4 + aSeed * 6.28) * 0.12;
    pos.y += sin(uTime * 0.27 + aSeed * 12.56) * 0.09;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float dist = max(0.8, -mv.z);
    gl_PointSize = clamp(aSize * uDpr * (9.0 / dist), 1.0, 5.0);
    vA = uFade * (0.08 + 0.10 * (0.5 + 0.5 * sin(uTime * 0.8 + aSeed * 6.28)));
    gl_Position = projectionMatrix * mv;
  }
`;

const DUST_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float m = 1.0 - smoothstep(0.1, 0.5, d);
    gl_FragColor = vec4(vec3(0.54, 0.42, 0.23), m * vA);
  }
`;

export default {
  id: 'fuga',
  colors: {
    entry: '#0b0a10',
    exit: '#171008',
    fog: '#0e0a09',
  },

  async init(ctx) {
    const { scene, prng, quality } = ctx;
    const tier = quality.tier;

    const handle = {
      scene,
      own: [],
      depth: 13,
      cameraHints: { roll: 0 },
      worldTime: 0,
      rate: 1,
      slide: 0,
      lastBend: -1,
      viewport: ctx.viewport,
    };

    scene.background = new THREE.Color('#0e0a09');
    scene.fog = new THREE.Fog('#0e0a09', 3.5, 21);
    handle.fogBase = new THREE.Color('#0e0a09');
    handle.exitCol = new THREE.Color('#171008');
    handle.tmpCol = new THREE.Color();

    const root = new THREE.Group();
    scene.add(root);
    handle.root = root;

    // ── 1. Arcate: silhouette d'arco estruse, instanced, prospettiva serrata ──
    const shape = new THREE.Shape();
    shape.moveTo(-2.3, -2.4);
    shape.lineTo(2.3, -2.4);
    shape.lineTo(2.3, 2.9);
    shape.lineTo(-2.3, 2.9);
    shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-1.4, -2.4);
    hole.lineTo(-1.4, 0.8);
    hole.absarc(0, 0.8, 1.4, Math.PI, 0, true);
    hole.lineTo(1.4, -2.4);
    hole.closePath();
    shape.holes.push(hole);
    const archGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false });
    archGeo.translate(0, 0, -0.2);
    const archMat = new THREE.MeshBasicMaterial({ color: 0x070408 });
    const nArch = tier === 'low' ? 24 : 34;
    const arches = new THREE.InstancedMesh(archGeo, archMat, nArch);
    arches.frustumCulled = false;
    // parametri base per il ripiegamento in exit (ricomposti solo quando serve)
    const base = {
      x: new Float32Array(nArch),
      z: new Float32Array(nArch),
      rz: new Float32Array(nArch),
      sc: new Float32Array(nArch),
    };
    const dummy = new THREE.Object3D();
    let z = 13.8;
    for (let i = 0; i < nArch; i++) {
      base.x[i] = (prng() - 0.5) * 0.22;
      base.z[i] = z;
      base.rz[i] = (prng() - 0.5) * 0.05;
      base.sc[i] = 0.96 + prng() * 0.14;
      z -= (13.8 - -3.6) / nArch + (prng() - 0.5) * 0.14;
      dummy.position.set(base.x[i], 0, base.z[i]);
      dummy.rotation.set(0, 0, base.rz[i]);
      dummy.scale.setScalar(base.sc[i]);
      dummy.updateMatrix();
      arches.setMatrixAt(i, dummy.matrix);
    }
    root.add(arches);
    handle.arches = arches;
    handle.base = base;
    handle.dummy = dummy;
    handle.own.push(archGeo, archMat);

    // ── 2. Pozze di luce ocra-sodio: 2 sprite additivi caldi ──────────────────
    const poolTex = makeGlowTexture(128, [
      [0, 'rgba(235,180,105,0.95)'],
      [0.4, 'rgba(201,141,63,0.45)'],
      [1, 'rgba(138,106,58,0)'],
    ]);
    handle.pools = [];
    const poolDefs = [
      { x: 0.85, y: -1.7, z: 6.5, s: 2.2, ph: 0.0 },
      { x: -0.75, y: -1.7, z: 2.2, s: 1.8, ph: 2.4 },
    ];
    for (const def of poolDefs) {
      const mat = new THREE.SpriteMaterial({
        map: poolTex,
        color: 0xc9903f,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(def.x, def.y, def.z);
      sp.scale.set(def.s, def.s * 0.6, 1);
      root.add(sp);
      handle.pools.push({ sp, mat, def });
      handle.own.push(mat);
    }
    handle.own.push(poolTex);

    // ── 3. UN glifo ESC rosso — piccolo, lontano, uno solo ────────────────────
    const escTex = makeEscTexture();
    const escGeo = new THREE.PlaneGeometry(0.5, 0.33);
    const escMat = new THREE.MeshBasicMaterial({
      map: escTex,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const esc = new THREE.Mesh(escGeo, escMat);
    esc.position.set(-1.05, 1.35, -2.6);
    esc.rotation.y = 0.2;
    root.add(esc);
    handle.escMat = escMat;
    handle.own.push(escTex, escGeo, escMat);

    // ── 4. Ink `fuga-reticolo`: card di fondale lontana ───────────────────────
    handle.inkMat = null;
    try {
      const tex = await ctx.loadTexture(ctx.assets.ink('fuga-reticolo'));
      const img = tex.image;
      const aspect = img && img.width ? img.width / img.height : 1.4;
      const h = 3.0;
      const inkGeo = new THREE.PlaneGeometry(h * aspect, h);
      const inkMat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        fog: false,
      });
      const ink = new THREE.Mesh(inkGeo, inkMat);
      ink.position.set(0, 0.5, -4.2);
      root.add(ink);
      handle.inkMat = inkMat;
      handle.own.push(inkGeo, inkMat); // texture del loader condiviso: non si dispone qui
    } catch (e) {
      handle.inkMat = null;
    }

    // ── 5. Pulviscolo caldo nelle pozze di luce ───────────────────────────────
    const nDust = tier === 'high' ? 800 : tier === 'mid' ? 500 : 240;
    const dustGeo = new THREE.BufferGeometry();
    const dPos = new Float32Array(nDust * 3);
    const dSeed = new Float32Array(nDust);
    const dSpeed = new Float32Array(nDust);
    const dSize = new Float32Array(nDust);
    for (let i = 0; i < nDust; i++) {
      // addensato attorno alle due pozze, sparso nel resto del corridoio
      const nearPool = prng() < 0.6;
      const def = poolDefs[i % 2];
      if (nearPool) {
        dPos[i * 3] = def.x + (prng() - 0.5) * 1.6;
        dPos[i * 3 + 1] = def.y + prng() * 2.2;
        dPos[i * 3 + 2] = def.z + (prng() - 0.5) * 2.5;
      } else {
        dPos[i * 3] = (prng() - 0.5) * 3.6;
        dPos[i * 3 + 1] = (prng() - 0.5) * 4;
        dPos[i * 3 + 2] = -2 + prng() * 15;
      }
      dSeed[i] = prng();
      dSpeed[i] = 0.5 + prng();
      dSize[i] = 0.5 + prng() * 1.2;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dSeed, 1));
    dustGeo.setAttribute('aSpeed', new THREE.BufferAttribute(dSpeed, 1));
    dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1));
    const dustMat = new THREE.ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uDpr: { value: ctx.viewport.dpr },
        uFade: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.frustumCulled = false;
    root.add(dust);
    handle.dustMat = dustMat;
    handle.own.push(dustGeo, dustMat);

    return handle;
  },

  update(handle, frame) {
    const p = clamp01(frame.progress);
    const dt = frame.dt;

    // il tempo del mondo: corre in approach, si FERMA nel dwell, riparte in exit
    const rateTarget = 1 - ss(0.34, 0.46, p) + 1.25 * ss(0.58, 0.7, p);
    handle.rate = damp(handle.rate, rateTarget, 4, dt);
    handle.worldTime += dt * handle.rate;
    const wt = handle.worldTime;

    // scivolamento del colonnato con la velocità di scroll (rush in approach)
    const slideTarget = clamp(frame.velocity, -1.5, 1.5) * 0.4 * (1 - ss(0.34, 0.5, p));
    handle.slide = damp(handle.slide, slideTarget, 2, dt);
    handle.root.position.z = handle.slide;

    // exit: il corridoio si piega verso l'alto (ricalcolo matrici solo qui)
    const bend = ss(0.6, 0.9, p);
    if (Math.abs(bend - handle.lastBend) > 0.0015) {
      handle.lastBend = bend;
      const { x, z, rz, sc } = handle.base;
      const dummy = handle.dummy;
      const n = handle.arches.count;
      for (let i = 0; i < n; i++) {
        const ahead = Math.max(0, 2.5 - z[i]); // arcate oltre l'opera
        const lift = bend * bend * ahead * ahead * 0.05;
        dummy.position.set(x[i], lift, z[i]);
        dummy.rotation.set(-bend * ahead * 0.035, 0, rz[i]);
        dummy.scale.setScalar(sc[i]);
        dummy.updateMatrix();
        handle.arches.setMatrixAt(i, dummy.matrix);
      }
      handle.arches.instanceMatrix.needsUpdate = true;
    }

    // pozze di sodio: pulsano su worldTime (in dwell smettono di pulsare: il
    // tempo è fermo); in exit diventano striate in verticale
    const streak = ss(0.6, 0.85, p);
    const die = ss(0.86, 0.985, p);
    for (let i = 0; i < handle.pools.length; i++) {
      const { sp, mat, def } = handle.pools[i];
      mat.opacity = (0.13 + 0.06 * Math.sin(wt * 2.1 + def.ph) + 0.08 * streak) * (1 - die);
      sp.scale.set(def.s * (1 + 0.25 * streak), def.s * 0.6 * (1 + 2.8 * streak), 1);
    }

    // ESC: flicker deterministico su worldTime (congela nel dwell)
    const fl = Math.sin(wt * 13.7) * Math.sin(wt * 3.1);
    handle.escMat.opacity = (0.62 + 0.25 * (fl > 0.55 ? 0.2 : 1)) * (1 - 0.8 * die);

    // fondale d'inchiostro: fisso, svanisce nel varco
    if (handle.inkMat) handle.inkMat.opacity = 0.35 * (1 - ss(0.8, 0.97, p));

    // pulviscolo
    const du = handle.dustMat.uniforms;
    du.uTime.value = wt;
    du.uDpr.value = handle.viewport.dpr;
    du.uFade.value = 1 - 0.7 * die;

    // exit: la notte bruna si scalda verso l'oro di ti-devo-lasciare
    const e = ss(0.68, 0.97, p);
    handle.tmpCol.copy(handle.fogBase).lerp(handle.exitCol, e);
    handle.scene.fog.color.copy(handle.tmpCol);
    handle.scene.background.copy(handle.tmpCol);
  },

  dispose(handle) {
    handle.root.removeFromParent();
    for (const res of handle.own) res.dispose();
    handle.own.length = 0;
  },
};
