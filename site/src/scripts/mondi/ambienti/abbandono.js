// MONDI — ambiente 2: abbandono — «il pozzo d'ossidiana»
// Contratto: site/content-notes/mondi-architettura.md §2 (modulo) e §4.2 (scheda).
// Discesa in un pozzo di lastre d'ossidiana che assorbono la luce; in fondo lo
// specchio infinito (emulato a shader, niente RT ricorsivi). Riflessi che si
// spengono lastra dopo lastra con p. Opera portrait sospesa sopra lo specchio.
// Nessun Math.random: solo ctx.prng. Nessuna allocazione in update.

import * as THREE from 'three';

export const preload = ['/viaggio/abbandono-figura.webp'];

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ss = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

// Lastre d'ossidiana: shader proprio (fresnel freddo che si spegne oltre la
// "frontiera" di discesa). cameraPosition è un uniform built-in di three.
const SLAB_VERT = /* glsl */ `
  attribute float aRand;
  varying vec3 vN;
  varying vec3 vWp;
  varying float vRand;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vWp = wp.xyz;
    vRand = aRand;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SLAB_FRAG = /* glsl */ `
  varying vec3 vN;
  varying vec3 vWp;
  varying float vRand;
  uniform vec3 uCold;
  uniform float uReflect;
  uniform float uFrontier;
  uniform vec3 uFog;
  float hash3(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }
  void main() {
    vec3 V = normalize(cameraPosition - vWp);
    vec3 N = normalize(vN);
    // ossidiana: quasi nera, una punta di modellato dall'alto
    float shade = max(dot(N, normalize(vec3(0.25, 0.9, 0.35))), 0.0);
    // grana minerale a due scale: la lastra è roccia, non un pannello liscio
    float grain = hash3(floor(vWp * 9.0)) * 0.55 + hash3(floor(vWp * 33.0)) * 0.45;
    // riflesso freddo di taglio (fresnel), spento oltre la frontiera (z > uFrontier)
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float alive = 1.0 - smoothstep(uFrontier - 1.2, uFrontier + 1.2, vWp.z);
    float glint = fres * (0.25 + 0.75 * vRand) * uReflect * alive * (0.6 + 0.5 * grain);
    vec3 col = vec3(0.034, 0.040, 0.058) * (0.5 + shade * 0.9) * (0.72 + 0.5 * grain)
             + uCold * glint * 0.55;
    // fog manuale (ShaderMaterial non eredita la fog di scena)
    float fogF = smoothstep(4.0, 17.0, length(cameraPosition - vWp));
    col = mix(col, uFog, fogF);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Specchio infinito: cornici concentriche recedenti + collasso finale in un punto.
const MIRROR_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MIRROR_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uRecede;
  uniform float uCollapse;
  uniform float uIntensity;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p /= max(0.06, 1.0 - 0.94 * uCollapse);
    float d = max(abs(p.x), abs(p.y));
    if (d > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    // indice continuo di cornice (log: le cornici si addensano verso il centro)
    float lg = log(max(d, 1e-4)) / log(0.78);
    float rec = fract(lg - uRecede);
    float ring = smoothstep(0.0, 0.10, rec) * (1.0 - smoothstep(0.10, 0.45, rec));
    float depthDim = exp(-lg * 0.30);
    float rim = 1.0 - smoothstep(0.85, 1.0, d);
    // quattro glint d'angolo per cornice (punti luce che si allontanano)
    vec2 q = abs(p);
    float corner = smoothstep(0.14, 0.0, abs(q.x - q.y));
    float glow = ring * depthDim * (0.55 + 0.45 * corner);
    vec3 cold = vec3(0.29, 0.58, 0.90);
    vec3 col = cold * glow * uIntensity * 0.5;
    gl_FragColor = vec4(col, glow * uIntensity * rim);
  }
`;

const DUST_VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aSpeed;
  attribute float aSize;
  uniform float uTime;
  uniform float uRise;
  uniform float uDpr;
  uniform float uFade;
  varying float vA;
  void main() {
    vec3 pos = position;
    // il pulviscolo SALE lentissimo (wrap verticale)
    pos.y = mod(position.y + uRise * aSpeed + 3.0, 6.0) - 3.0;
    pos.x += sin(uTime * 0.3 + aSeed * 6.28) * 0.08;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float dist = max(0.8, -mv.z);
    gl_PointSize = clamp(aSize * uDpr * (10.0 / dist), 1.0, 6.0);
    vA = uFade * (0.10 + 0.12 * (0.5 + 0.5 * sin(uTime * 0.7 + aSeed * 6.28)));
    gl_Position = projectionMatrix * mv;
  }
`;

const DUST_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float m = 1.0 - smoothstep(0.1, 0.5, d);
    gl_FragColor = vec4(vec3(0.18, 0.24, 0.38), m * vA);
  }
`;

export default {
  id: 'abbandono',
  colors: {
    entry: '#030308',
    exit: '#0b0a10',
    fog: '#04050a',
  },

  async init(ctx) {
    const { scene, prng, quality } = ctx;
    const tier = quality.tier;

    const handle = {
      scene,
      own: [],
      depth: 12,
      cameraHints: { roll: 0 },
      rise: 0,
      recede: 0,
      viewport: ctx.viewport,
    };

    scene.background = new THREE.Color('#04050a');
    scene.fog = new THREE.Fog('#04050a', 3, 19);
    handle.fogBase = new THREE.Color('#04050a');
    handle.exitCol = new THREE.Color('#0b0a10');
    handle.tmpCol = new THREE.Color();

    const root = new THREE.Group();
    scene.add(root);
    handle.root = root;

    // ── 1. Canna del pozzo: quinte d'ossidiana smussate e affusolate ─────────
    // (niente più lastre squadrate che leggevano come detriti: sagoma a scudo
    // con angoli morbidi + bevel, disposte come quinte teatrali)
    const nSlabs = tier === 'high' ? 80 : tier === 'mid' ? 58 : 38;
    const shieldShape = new THREE.Shape();
    {
      const w = 0.72, h = 1.15;
      shieldShape.moveTo(-w * 0.62, -h);
      shieldShape.quadraticCurveTo(w * 0.05, -h * 1.12, w * 0.55, -h * 0.82);
      shieldShape.quadraticCurveTo(w * 1.02, -h * 0.3, w * 0.86, h * 0.35);
      shieldShape.quadraticCurveTo(w * 0.72, h * 0.92, w * 0.1, h);
      shieldShape.quadraticCurveTo(-w * 0.55, h * 1.05, -w * 0.78, h * 0.42);
      shieldShape.quadraticCurveTo(-w * 0.98, -h * 0.28, -w * 0.62, -h);
    }
    const slabGeo = new THREE.ExtrudeGeometry(shieldShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.09,
      bevelSegments: 2,
      curveSegments: 7,
    });
    slabGeo.center();
    const aRand = new Float32Array(nSlabs);
    for (let i = 0; i < nSlabs; i++) aRand[i] = prng();
    slabGeo.setAttribute('aRand', new THREE.InstancedBufferAttribute(aRand, 1));
    const slabMat = new THREE.ShaderMaterial({
      vertexShader: SLAB_VERT,
      fragmentShader: SLAB_FRAG,
      uniforms: {
        uCold: { value: new THREE.Color('#4a93e6') },
        uReflect: { value: 1 },
        uFrontier: { value: 14 },
        uFog: { value: new THREE.Color('#04050a') },
      },
    });
    const slabs = new THREE.InstancedMesh(slabGeo, slabMat, nSlabs);
    slabs.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const ringSize = 6;
    const nRings = Math.ceil(nSlabs / ringSize);
    let idx = 0;
    for (let ri = 0; ri < nRings && idx < nSlabs; ri++) {
      const z = 13 - (ri / Math.max(1, nRings - 1)) * 16; // 13 → −3
      for (let s = 0; s < ringSize && idx < nSlabs; s++) {
        const a = (s / ringSize) * Math.PI * 2 + prng() * 0.6 + ri * 0.35;
        const rr = 2.35 + prng() * 1.0; // mai addosso alla camera
        dummy.position.set(Math.cos(a) * rr, Math.sin(a) * rr, z + (prng() - 0.5) * 0.8);
        dummy.lookAt(0, 0, dummy.position.z); // faccia verso l'asse del pozzo
        dummy.rotateX((prng() - 0.5) * 0.35);
        dummy.rotateZ((prng() - 0.5) * 0.35);
        dummy.scale.set(0.8 + prng() * 0.7, 0.8 + prng() * 0.9, 1);
        dummy.updateMatrix();
        slabs.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }
    root.add(slabs);
    handle.slabMat = slabMat;
    handle.own.push(slabGeo, slabMat);

    // ── 2. Specchio infinito in fondo al pozzo (dietro l'opera) ───────────────
    const mirrorGeo = new THREE.PlaneGeometry(9, 9);
    const mirrorMat = new THREE.ShaderMaterial({
      vertexShader: MIRROR_VERT,
      fragmentShader: MIRROR_FRAG,
      uniforms: {
        uRecede: { value: 0 },
        uCollapse: { value: 0 },
        uIntensity: { value: 0.5 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mirror = new THREE.Mesh(mirrorGeo, mirrorMat);
    mirror.position.set(0, 0, -3.2);
    root.add(mirror);
    handle.mirrorMat = mirrorMat;
    handle.own.push(mirrorGeo, mirrorMat);

    // ── 3. Pulviscolo che sale lentissimo ─────────────────────────────────────
    const nDust = tier === 'high' ? 1000 : tier === 'mid' ? 620 : 300;
    const dustGeo = new THREE.BufferGeometry();
    const dPos = new Float32Array(nDust * 3);
    const dSeed = new Float32Array(nDust);
    const dSpeed = new Float32Array(nDust);
    const dSize = new Float32Array(nDust);
    for (let i = 0; i < nDust; i++) {
      const a = prng() * Math.PI * 2;
      const rr = 0.4 + prng() * 2.2;
      dPos[i * 3] = Math.cos(a) * rr;
      dPos[i * 3 + 1] = (prng() - 0.5) * 6;
      dPos[i * 3 + 2] = -2.5 + prng() * 15;
      dSeed[i] = prng();
      dSpeed[i] = 0.5 + prng();
      dSize[i] = 0.5 + prng() * 1.3;
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
        uRise: { value: 0 },
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

    // ── 4. Lama di luce fredda dall'alto (solo in dwell, sull'opera) ──────────
    const coneGeo = new THREE.ConeGeometry(1.15, 3.4, 24, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x9fc4ee,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(0, 2.3, 0.35);
    root.add(cone);
    handle.coneMat = coneMat;
    handle.own.push(coneGeo, coneMat);

    // ── 5. Ink `abbandono-figura`: silhouette sopra lo specchio (solo high) ───
    handle.inkMat = null;
    if (tier === 'high') {
      try {
        const tex = await ctx.loadTexture(ctx.assets.ink('abbandono-figura'));
        const img = tex.image;
        const aspect = img && img.width ? img.width / img.height : 0.7;
        const h = 2.1;
        const inkGeo = new THREE.PlaneGeometry(h * aspect, h);
        const inkMat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          fog: false,
        });
        const ink = new THREE.Mesh(inkGeo, inkMat);
        ink.position.set(1.0, 0.55, -2.7);
        root.add(ink);
        handle.inkMat = inkMat;
        handle.own.push(inkGeo, inkMat); // la texture è del loader condiviso: non si tocca
      } catch (e) {
        handle.inkMat = null; // senza silhouette il mondo regge comunque
      }
    }

    return handle;
  },

  update(handle, frame) {
    const p = clamp01(frame.progress);
    const dt = frame.dt;
    const t = frame.time;

    // discesa: i riflessi si spengono lastra dopo lastra
    const su = handle.slabMat.uniforms;
    su.uReflect.value = 1 - 0.95 * ss(0.05, 0.5, p);
    su.uFrontier.value = 14 - 18 * ss(0.0, 0.62, p);

    // dwell: buio totale tranne l'opera, una sola lama fredda dall'alto
    const dwellK = ss(0.38, 0.47, p) * (1 - ss(0.58, 0.68, p));
    handle.coneMat.opacity = 0.05 * dwellK * (1 + 0.15 * Math.sin(t * 0.9));

    // specchio: cornici che recedono; exit: collassano in un punto
    const collapse = ss(0.66, 0.94, p);
    handle.recede += dt * (0.14 + collapse * 2.6);
    const mu = handle.mirrorMat.uniforms;
    mu.uRecede.value = handle.recede;
    mu.uCollapse.value = collapse;
    mu.uIntensity.value = (0.4 + 0.5 * ss(0.15, 0.5, p)) * (1 - ss(0.86, 0.985, p));

    // pulviscolo
    handle.rise += dt * 0.055;
    const du = handle.dustMat.uniforms;
    du.uTime.value = t;
    du.uRise.value = handle.rise;
    du.uDpr.value = handle.viewport.dpr;
    du.uFade.value = 1 - 0.75 * ss(0.7, 0.95, p);

    // silhouette d'inchiostro: affiora a metà discesa, svanisce prima del varco
    if (handle.inkMat) {
      const breathe = 1 + 0.08 * Math.sin(t * 0.35);
      handle.inkMat.opacity = 0.3 * ss(0.16, 0.36, p) * (1 - ss(0.58, 0.74, p)) * breathe;
    }

    // roll lieve (≤2°) per la vertigine da discesa; si placa nel dwell
    const rollTarget = 0.028 * Math.sin(t * 0.22 + p * 4.0) * (1 - 0.7 * dwellK);
    handle.cameraHints.roll = damp(handle.cameraHints.roll, rollTarget, 2, dt);

    // exit: il nero si scalda appena verso la notte bruna di fuga
    const e = ss(0.7, 0.97, p);
    handle.tmpCol.copy(handle.fogBase).lerp(handle.exitCol, e);
    handle.scene.fog.color.copy(handle.tmpCol);
    handle.scene.background.copy(handle.tmpCol);
    su.uFog.value.copy(handle.tmpCol);
  },

  dispose(handle) {
    handle.root.removeFromParent();
    for (const res of handle.own) res.dispose();
    handle.own.length = 0;
  },
};
