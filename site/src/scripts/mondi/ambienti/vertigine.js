// MONDI — ambiente 1: vertigine — «il tunnel del vortice»
// Contratto: site/content-notes/mondi-architettura.md §2 (modulo) e §4.1 (scheda).
// Il vortice del quadro diventa un tunnel che ruota ATTORNO alla camera.
// Porting 3D delle idee di deploy/vertigine.js: spirali logaritmiche, specie water/foam,
// schegge rosse controrotanti, claw-streaks a 9 bracci, core celeste, startup ramp.
// Nessun Math.random: solo ctx.prng. Nessuna allocazione in update.

import * as THREE from 'three';

export const preload = [];

// Palette v1 (BLUES del quadro) — §4.1
const BLUES = [0x0a1a3d, 0x142a66, 0x1f49a8, 0x2c6fd1, 0x4a93e6, 0x7fb9f0];
const REDS = [0xa31818, 0xc8281c, 0xe64a2a, 0x7a1010];

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ss = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

// Merge di più BufferGeometry indicizzate (solo position+index: basta per ribbon additive).
function mergeIndexed(geoms) {
  let v = 0;
  let n = 0;
  for (const g of geoms) {
    v += g.attributes.position.count;
    n += g.index.count;
  }
  const pos = new Float32Array(v * 3);
  const idx = v > 65535 ? new Uint32Array(n) : new Uint16Array(n);
  let vo = 0;
  let io = 0;
  for (const g of geoms) {
    pos.set(g.attributes.position.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// Texture radiale procedurale (core/halo) — nessun asset esterno.
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

const POINTS_VERT = /* glsl */ `
  uniform float uAngle;
  uniform float uFlow;
  uniform float uPinch;
  uniform float uRamp;
  uniform float uDpr;
  uniform float uBright;
  attribute float aRadius;
  attribute float aTheta;
  attribute float aZ;
  attribute float aOmega;
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aFoam;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vFoam;
  varying float vA;
  void main() {
    // scorrimento longitudinale verso il core, con wrap (risucchio)
    float zPar = fract(aZ + uFlow);
    float z = 13.0 - zPar * 16.0;
    // imbuto: largo lontano, si stringe entrando nel core
    float funnel = mix(1.0, 0.26, smoothstep(0.55, 0.98, zPar));
    float r = aRadius * funnel * (1.0 - 0.32 * uPinch);
    // v1: accelerazione angolare crescente verso il centro (1 + k^2 * 3)
    float k = 1.0 - clamp(r / 3.4, 0.0, 1.0);
    float th = aTheta + uAngle * aOmega * (1.0 + k * k * 3.0);
    vec3 pos = vec3(cos(th) * r, sin(th) * r * 0.92, z);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float dist = max(0.8, -mv.z);
    gl_PointSize = clamp(aSize * uDpr * (0.55 + k * 1.6) * (26.0 / dist), 1.0, 30.0);
    float fadeIn = smoothstep(0.0, 0.07, zPar);
    float fadeOut = 1.0 - smoothstep(0.90, 0.99, zPar);
    vA = aAlpha * (0.25 + 0.85 * k) * fadeIn * fadeOut * uRamp * uBright;
    vColor = aColor;
    vFoam = aFoam;
    gl_Position = projectionMatrix * mv;
  }
`;

const POINTS_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vFoam;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float m = 1.0 - smoothstep(0.12, 0.5, d);
    // schiuma: cuore bianco come nella v1
    vec3 col = vColor + vFoam * vec3(0.55) * (1.0 - smoothstep(0.0, 0.22, d));
    gl_FragColor = vec4(col, m * vA);
  }
`;

// Claw-streaks v1: 9 bracci a spirale logaritmica (b = 0.36), rotazione oraria, glow additivo.
const CLAW_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uSpin;
  uniform float uGlow;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float phase = a + uSpin - log(max(r, 1e-4)) / 0.36;
    float arm = pow(0.5 + 0.5 * cos(phase * 9.0), 6.0);
    float fade = smoothstep(1.0, 0.18, r) * smoothstep(0.03, 0.14, r);
    float g = arm * fade * uGlow;
    vec3 col = vec3(0.66, 0.88, 0.89) * g;
    gl_FragColor = vec4(col, g);
  }
`;

const CLAW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export default {
  id: 'vertigine',
  colors: {
    entry: '#06102c',
    exit: '#030308',
    fog: '#0a1430',
  },

  async init(ctx) {
    const { scene, prng, quality } = ctx;
    const tier = quality.tier;

    const handle = {
      scene,
      own: [], // disposables propri (geometrie/materiali/texture)
      depth: 12, // D del binario (§2.4)
      cameraHints: { roll: 0 },
      // stato animazione
      angle: 0,
      flow: 0,
      clawSpin: 0,
      speed: 1.6,
      flowSpeed: 0.04,
      shardSpeed: 1,
      shardAngle: 0,
      ramp: 0,
      viewport: ctx.viewport,
    };

    scene.background = new THREE.Color('#0a1430');
    scene.fog = new THREE.Fog('#0a1430', 5, 26);
    handle.fogBase = new THREE.Color('#0a1430');
    handle.exitCol = new THREE.Color('#030308');
    handle.tmpCol = new THREE.Color();

    const root = new THREE.Group();
    scene.add(root);
    handle.root = root;

    // ── 1. Vortice di Points su spirali logaritmiche (imbuto 3D) ──────────────
    const nPoints = tier === 'high' ? 8000 : tier === 'mid' ? 4200 : 1300;
    const N = Math.min(nPoints, Math.max(400, (quality.maxParticles || nPoints) - 200));
    const geo = new THREE.BufferGeometry();
    const aRadius = new Float32Array(N);
    const aTheta = new Float32Array(N);
    const aZ = new Float32Array(N);
    const aOmega = new Float32Array(N);
    const aSize = new Float32Array(N);
    const aColor = new Float32Array(N * 3);
    const aFoam = new Float32Array(N);
    const aAlpha = new Float32Array(N);
    const cTmp = new THREE.Color();
    for (let i = 0; i < N; i++) {
      // raggio con bias verso l'esterno (come lo spawn v1 a 0.95 * maxR)
      aRadius[i] = 0.55 + Math.sqrt(prng()) * 2.85;
      aTheta[i] = prng() * Math.PI * 2;
      aZ[i] = prng();
      aOmega[i] = 0.7 + prng() * 0.9;
      const foam = prng() < 0.18;
      aFoam[i] = foam ? 1 : 0;
      if (foam) cTmp.setHex(0xf0f4ff);
      else cTmp.setHex(BLUES[(prng() * BLUES.length) | 0]);
      aColor[i * 3] = cTmp.r;
      aColor[i * 3 + 1] = cTmp.g;
      aColor[i * 3 + 2] = cTmp.b;
      const s = prng();
      aSize[i] = 0.7 + s * s * 2.6;
      aAlpha[i] = 0.4 + prng() * 0.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aRadius', new THREE.BufferAttribute(aRadius, 1));
    geo.setAttribute('aTheta', new THREE.BufferAttribute(aTheta, 1));
    geo.setAttribute('aZ', new THREE.BufferAttribute(aZ, 1));
    geo.setAttribute('aOmega', new THREE.BufferAttribute(aOmega, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));
    geo.setAttribute('aFoam', new THREE.BufferAttribute(aFoam, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(aAlpha, 1));
    const pMat = new THREE.ShaderMaterial({
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      uniforms: {
        uAngle: { value: 0 },
        uFlow: { value: 0 },
        uPinch: { value: 0 },
        uRamp: { value: 0 },
        uDpr: { value: ctx.viewport.dpr },
        uBright: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, pMat);
    points.frustumCulled = false;
    root.add(points);
    handle.pMat = pMat;
    handle.own.push(geo, pMat);

    // ── 2. Schegge rosse: InstancedMesh di tetraedri controrotanti ────────────
    const nShards = tier === 'high' ? 60 : tier === 'mid' ? 40 : 22;
    const shardGeo = new THREE.TetrahedronGeometry(0.085);
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0xc8281c,
      metalness: 0.3,
      roughness: 0.45,
      emissive: 0x2a0605,
      emissiveIntensity: 1.0,
    });
    const shards = new THREE.InstancedMesh(shardGeo, shardMat, nShards);
    shards.frustumCulled = false;
    const sh = {
      r: new Float32Array(nShards),
      th: new Float32Array(nShards),
      z: new Float32Array(nShards),
      om: new Float32Array(nShards),
      tum: new Float32Array(nShards),
      sc: new Float32Array(nShards),
    };
    for (let i = 0; i < nShards; i++) {
      sh.r[i] = 1.1 + prng() * 1.9;
      sh.th[i] = prng() * Math.PI * 2;
      sh.z[i] = -1 + prng() * 10;
      sh.om[i] = 0.5 + prng() * 0.8;
      sh.tum[i] = 1 + prng() * 3;
      sh.sc[i] = 0.55 + prng() * 1.1;
      shards.setColorAt(i, cTmp.setHex(REDS[(prng() * REDS.length) | 0]));
    }
    shards.instanceColor.needsUpdate = true;
    root.add(shards);
    handle.shards = shards;
    handle.sh = sh;
    handle.dummy = new THREE.Object3D();
    handle.own.push(shardGeo, shardMat);

    // ── 3. Striature di schiuma: 6 ribbon a spirale, merged in 1 draw call ────
    const nRibbons = tier === 'high' ? 6 : tier === 'mid' ? 5 : 3;
    const tubeGeos = [];
    const pts = [];
    for (let j = 0; j < nRibbons; j++) {
      pts.length = 0;
      const a0 = prng() * Math.PI * 2;
      const turns = 3.2 + prng() * 1.4;
      const rBase = 1.35 + j * 0.26 + prng() * 0.2;
      for (let s = 0; s <= 44; s++) {
        const t = s / 44;
        const z = 13 - t * 16;
        const funnel = 1 - 0.74 * ss(0.55, 0.98, t);
        const r = rBase * funnel;
        const a = a0 + t * turns * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.92, z));
      }
      const curve = new THREE.CatmullRomCurve3(pts.slice());
      tubeGeos.push(new THREE.TubeGeometry(curve, 90, 0.014 + prng() * 0.008, 5, false));
    }
    const ribbonGeo = mergeIndexed(tubeGeos);
    const ribbonMat = new THREE.MeshBasicMaterial({
      color: 0xf0f4ff,
      transparent: true,
      opacity: 0.11,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const ribbons = new THREE.Mesh(ribbonGeo, ribbonMat);
    ribbons.frustumCulled = false;
    root.add(ribbons);
    handle.ribbons = ribbons;
    handle.ribbonMat = ribbonMat;
    handle.own.push(ribbonGeo, ribbonMat);

    // ── 4. Claw-streaks: disco shader dietro l'opera ──────────────────────────
    const clawGeo = new THREE.PlaneGeometry(6.6, 6.6);
    const clawMat = new THREE.ShaderMaterial({
      vertexShader: CLAW_VERT,
      fragmentShader: CLAW_FRAG,
      uniforms: {
        uSpin: { value: 0 },
        uGlow: { value: 0.55 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const claw = new THREE.Mesh(clawGeo, clawMat);
    claw.position.set(0, 0, -2.4);
    root.add(claw);
    handle.clawMat = clawMat;
    handle.own.push(clawGeo, clawMat);

    // ── 5. Core celeste + halo (bloom finto: secondo sprite largo) ────────────
    const coreTex = makeGlowTexture(128, [
      [0, 'rgba(255,255,255,1)'],
      [0.25, 'rgba(210,235,248,0.95)'],
      [0.6, 'rgba(210,235,248,0.35)'],
      [1, 'rgba(210,235,248,0)'],
    ]);
    const coreMat = new THREE.SpriteMaterial({
      map: coreTex,
      color: 0xd2ebf8,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const core = new THREE.Sprite(coreMat);
    core.position.set(0, 0, -3.1);
    core.scale.setScalar(1.15);
    root.add(core);
    const haloMat = new THREE.SpriteMaterial({
      map: coreTex,
      color: 0x9fc8ee,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.position.set(0, 0, -3.2);
    halo.scale.setScalar(3.8);
    root.add(halo);
    handle.core = core;
    handle.coreMat = coreMat;
    handle.haloMat = haloMat;
    handle.own.push(coreTex, coreMat, haloMat);

    // ── 6. Luci (2 dinamiche su high/mid, 1 su low) ───────────────────────────
    const coreLight = new THREE.PointLight(0xd2ebf8, 5, 14, 2);
    coreLight.position.set(0, 0, -2.6);
    scene.add(coreLight);
    handle.coreLight = coreLight;
    if (tier !== 'low') {
      const rim = new THREE.DirectionalLight(0x4a93e6, 0.8);
      rim.position.set(3, 4, 8);
      scene.add(rim);
      handle.rimLight = rim;
    }

    return handle;
  },

  update(handle, frame) {
    const p = clamp01(frame.progress);
    const dt = frame.dt;

    // startup ramp (eredità v1, accorciata: si entra già dal varco dell'hero)
    handle.ramp = Math.min(1, handle.ramp + dt / 1.2);
    const r = handle.ramp;
    const ramp = r < 0.5 ? 4 * r * r * r : 1 - Math.pow(-2 * r + 2, 3) / 2;

    // velocità per fase: risucchio in approach, 30% in dwell, riprende in exit
    const rotTarget = 1.7 - 1.2 * ss(0.28, 0.44, p) + 0.85 * ss(0.58, 0.74, p);
    const flowTarget = 0.05 - 0.042 * ss(0.28, 0.44, p) + 0.026 * ss(0.58, 0.74, p);
    const shardTarget = 1 - 0.94 * ss(0.3, 0.44, p) + 1.2 * ss(0.58, 0.74, p);
    handle.speed = damp(handle.speed, rotTarget, 3, dt);
    handle.flowSpeed = damp(handle.flowSpeed, flowTarget, 3, dt);
    handle.shardSpeed = damp(handle.shardSpeed, shardTarget, 3, dt);

    handle.angle += dt * 0.55 * handle.speed * ramp;
    handle.flow += dt * handle.flowSpeed * ramp;
    handle.clawSpin += dt * 0.32 * (0.4 + 0.6 * handle.speed) * ramp;
    handle.shardAngle += dt * 0.42 * handle.shardSpeed * ramp;

    const u = handle.pMat.uniforms;
    u.uAngle.value = handle.angle;
    u.uFlow.value = handle.flow;
    u.uPinch.value = ss(0.06, 0.4, p) * (1 - 0.5 * ss(0.58, 0.8, p));
    u.uRamp.value = ramp;
    u.uDpr.value = handle.viewport.dpr;

    // exit: il blu muore nel nero ossidiana
    const e = ss(0.6, 0.96, p);
    u.uBright.value = 1 - 0.6 * e;
    handle.tmpCol.copy(handle.fogBase).lerp(handle.exitCol, e);
    handle.scene.fog.color.copy(handle.tmpCol);
    handle.scene.background.copy(handle.tmpCol);

    // schegge controrotanti (senso opposto ai points)
    const sh = handle.sh;
    const dummy = handle.dummy;
    const n = handle.shards.count;
    for (let i = 0; i < n; i++) {
      const th = sh.th[i] - handle.shardAngle * sh.om[i];
      const rr = sh.r[i];
      dummy.position.set(Math.cos(th) * rr, Math.sin(th) * rr * 0.92, sh.z[i]);
      const tt = handle.shardAngle * sh.tum[i];
      dummy.rotation.set(tt, tt * 1.31, tt * 0.7);
      dummy.scale.setScalar(sh.sc[i]);
      dummy.updateMatrix();
      handle.shards.setMatrixAt(i, dummy.matrix);
    }
    handle.shards.instanceMatrix.needsUpdate = true;

    // ribbon di schiuma: rotazione solidale al vortice
    handle.ribbons.rotation.z = handle.angle * 0.8;
    handle.ribbonMat.opacity = (0.06 + 0.07 * handle.speed) * ramp * (1 - 0.7 * e);

    // claw disc + core: in dwell l'opera è retroilluminata dal core
    const dwellK = ss(0.36, 0.5, p) * (1 - ss(0.58, 0.75, p));
    handle.clawMat.uniforms.uSpin.value = handle.clawSpin;
    handle.clawMat.uniforms.uGlow.value = (0.4 + 0.35 * dwellK) * ramp * (1 - 0.8 * e);
    const pulse = 1 + Math.sin(frame.time * 1.3) * 0.04;
    handle.core.scale.setScalar((1.15 + 0.55 * dwellK) * pulse);
    handle.coreMat.opacity = (0.85 + 0.15 * dwellK) * ramp * (1 - e);
    handle.haloMat.opacity = (0.2 + 0.3 * dwellK) * ramp * (1 - e);
    handle.coreLight.intensity = (4.5 + 5 * dwellK) * ramp * (1 - 0.85 * e);
    if (handle.rimLight) handle.rimLight.intensity = 0.8 * (1 - 0.8 * e);

    // pointer: tilt d'asse ±3° (solo desktop: su touch pointer è (0,0))
    const tx = frame.pointer.y * 0.052;
    const ty = frame.pointer.x * 0.052;
    handle.root.rotation.x = damp(handle.root.rotation.x, tx, 3, dt);
    handle.root.rotation.y = damp(handle.root.rotation.y, ty, 3, dt);
  },

  dispose(handle) {
    handle.root.removeFromParent();
    handle.coreLight.removeFromParent();
    if (handle.rimLight) handle.rimLight.removeFromParent();
    for (const res of handle.own) res.dispose();
    handle.own.length = 0;
  },
};
