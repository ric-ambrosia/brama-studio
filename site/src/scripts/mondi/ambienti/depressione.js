// MONDI · ambiente 6 — «depressione» (order 6)
// «La crepa d'oro nel nero»: ossidiana e oro, kintsugi. Quasi cecità: fog
// nera pesante, l'unica guida è una crepa di luce dorata che serpeggia sul
// pavimento nero specchiante e conduce all'opera. Nel dwell l'opera si
// accende della sua stessa doratura (bordo emissivo + luce bassa dal
// pavimento + riflesso fake). Nell'exit la crepa si allarga in luce e i toni
// scaldano verso il legno de la-casa-di-mike. L'azzurro qui NON entra.
// Contratto: site/content-notes/mondi-architettura.md §2, §4.6.
// Catena cromatica: entry #050505 (exit di pugno) → exit #0d0a08 (entry di la-casa-di-mike).

import * as THREE from 'three';

export const preload = [
  '/images/gen/Depressione-600.webp', // riflesso fake (caricata da questo modulo)
  '/viaggio/depressione-occhio.webp',
];

const DUST = { high: 800, mid: 500, low: 250 };
const FLOOR_DROP = 0.32; // aria tra il bordo basso dell'opera e il pavimento

function sstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

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
  return { w: 2.4, h: 2.0 };
}

// — pavimento d'ossidiana: gradiente nero + alone dorato sotto l'opera nel
// dwell; semitrasparente lì dove deve affiorare il riflesso fake —
const FLOOR_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}
`;

const FLOOR_FRAG = /* glsl */ `
uniform float uGlow;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uFogColor;
varying vec3 vW;
void main() {
  float d2 = vW.x * vW.x + vW.z * vW.z;
  vec3 base = mix(vec3(0.010, 0.008, 0.006), vec3(0.028, 0.022, 0.013), exp(-d2 * 0.02));
  // alone caldo basso: la doratura dell'opera tocca il pavimento
  vec3 col = base + vec3(0.36, 0.27, 0.11) * (uGlow * exp(-d2 * 0.5) * 0.5);
  float alpha = 0.93 - 0.45 * uGlow * exp(-d2 * 0.35);
  float f = smoothstep(uFogNear, uFogFar, distance(vW, cameraPosition));
  col = mix(col, uFogColor, f);
  alpha = mix(alpha, 1.0, f);
  gl_FragColor = vec4(col, alpha);
}
`;

// — crepa dorata: nastro emissivo serpeggiante, impulsi che corrono VERSO
// l'opera (l'unica guida nel buio: buca parzialmente la fog) —
const CRACK_VERT = /* glsl */ `
uniform float uWide;
attribute vec2 aLat;
attribute float aSide;
attribute float aWidth;
attribute float aAlong;
varying float vAcross;
varying float vAlong;
varying vec3 vW;
void main() {
  vec3 pos = position;
  pos.x += aLat.x * aSide * aWidth * uWide;
  pos.z += aLat.y * aSide * aWidth * uWide;
  vAcross = aSide;
  vAlong = aAlong;
  vW = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}
`;

const CRACK_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uFogNear;
uniform float uFogFar;
varying float vAcross;
varying float vAlong;
varying vec3 vW;
void main() {
  float core = pow(max(1.0 - vAcross * vAcross, 0.0), 1.6);
  float puls = 0.55 + 0.45 * sin(vAlong * 26.0 - uTime * 2.4);
  float a = core * (0.35 + 0.65 * puls * puls) * uIntensity;
  float f = smoothstep(uFogNear, uFogFar, distance(vW, cameraPosition));
  a *= 1.0 - 0.55 * f; // la guida resta visibile anche nella quasi-cecità
  vec3 col = vec3(0.843, 0.663, 0.294) * (0.7 + 0.9 * core * puls);
  gl_FragColor = vec4(col, a);
}
`;

// — bordo emissivo dell'opera (cornice kintsugi), acceso SOLO nel dwell —
const FRAME_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAME_FRAG = /* glsl */ `
uniform float uGlow;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 d = abs(vUv - 0.5) * 2.0;
  float rim = max(d.x, d.y);
  // filo kintsugi SOTTILE: una vena di luce, non una cornice barocca
  float band = smoothstep(0.955, 0.982, rim) * (1.0 - smoothstep(0.99, 1.0, rim));
  float breathe = 0.85 + 0.15 * sin(uTime * 1.1);
  float a = band * uGlow * breathe * 0.75;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(0.843, 0.663, 0.294) * (0.8 + 0.6 * band), a);
}
`;

// — pulviscolo d'oro raso terra —
const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform float uFade;
uniform float uPointScale;
uniform float uFogNear;
uniform float uFogFar;
attribute vec2 aSeed; // x: fase, y: velocità di risalita
attribute float aSize;
varying float vA;
void main() {
  vec3 pos = position;
  pos.y = -1.35 + mod(pos.y + 1.35 + uTime * (0.03 + aSeed.y * 0.04), 2.2);
  pos.x += sin(uTime * 0.15 + aSeed.x * 20.0) * 0.12;
  pos.z += cos(uTime * 0.11 + aSeed.x * 13.0) * 0.12;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.5);
  gl_PointSize = clamp(aSize * uPointScale / dist, 1.0, 12.0);
  float tw = 0.5 + 0.5 * sin(uTime * (0.4 + aSeed.y) + aSeed.x * 43.0);
  vA = uFade * (0.2 + 0.8 * tw * tw) * (1.0 - smoothstep(uFogNear, uFogFar, dist));
}
`;

const DUST_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.1, d) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(0.843, 0.663, 0.294), a);
}
`;

// Costruisce il nastro della crepa lungo il binario: centri serpeggianti che
// convergono a x=0 davanti all'opera; la larghezza cresce avvicinandosi.
function buildCrackGeometry(prng, floorY) {
  const M = 150;
  const zStart = 15.5;
  const zEnd = -1.6;
  const phi1 = prng() * Math.PI * 2;
  const phi2 = prng() * Math.PI * 2;
  const cx = new Float32Array(M);
  const cz = new Float32Array(M);
  for (let i = 0; i < M; i++) {
    const t = i / (M - 1);
    const z = zStart + (zEnd - zStart) * t;
    const damp = sstep(-0.5, 3.0, z); // converge a 0 davanti all'opera
    cx[i] = (Math.sin(z * 0.42 + phi1) * 0.9 + Math.sin(z * 0.17 + phi2) * 0.55) * damp;
    cz[i] = z;
  }
  const pos = new Float32Array(M * 2 * 3);
  const lat = new Float32Array(M * 2 * 2);
  const side = new Float32Array(M * 2);
  const width = new Float32Array(M * 2);
  const along = new Float32Array(M * 2);
  const indices = [];
  for (let i = 0; i < M; i++) {
    const t = i / (M - 1);
    const iN = Math.min(i + 1, M - 1);
    const iP = Math.max(i - 1, 0);
    // tangente 2D → laterale perpendicolare nel piano del pavimento
    let tx = cx[iN] - cx[iP];
    let tz = cz[iN] - cz[iP];
    const tl = Math.sqrt(tx * tx + tz * tz) || 1;
    tx /= tl; tz /= tl;
    const lx = -tz;
    const lz = tx;
    const w =
      0.045 + 0.09 * sstep(4.0, 0.5, cz[i]) +
      0.02 * Math.abs(Math.sin(cz[i] * 3.0 + phi1));
    for (let s = 0; s < 2; s++) {
      const k = i * 2 + s;
      pos[k * 3 + 0] = cx[i];
      pos[k * 3 + 1] = floorY + 0.012;
      pos[k * 3 + 2] = cz[i];
      lat[k * 2 + 0] = lx;
      lat[k * 2 + 1] = lz;
      side[k] = s === 0 ? -1 : 1;
      width[k] = w;
      along[k] = t;
    }
    if (i < M - 1) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aLat', new THREE.BufferAttribute(lat, 2));
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aWidth', new THREE.BufferAttribute(width, 1));
  geo.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  geo.setIndex(indices);
  return geo;
}

export default {
  id: 'depressione',
  colors: {
    entry: '#050505',
    exit: '#0d0a08',
    fog: '#050505',
  },

  async init(ctx) {
    const { scene, prng, quality, viewport } = ctx;
    const handle = {
      viewport,
      depth: 14, // approccio lungo: si segue la crepa nella quasi-cecità
      cameraHints: { roll: 0 },
      geometries: [],
      materials: [],
    };

    const { w: opW, h: opH } = planeSize(ctx.operaPlane);
    const floorY = -(opH / 2 + FLOOR_DROP);
    handle.floorY = floorY;

    // fog nera pesante, near: si apre nel dwell, scalda nell'exit
    scene.fog = new THREE.Fog(0x050505, 1.2, 7.0);
    scene.background = scene.fog.color;
    handle.fog = scene.fog;
    handle.cBlack = new THREE.Color(0x050505);
    handle.cWarm = new THREE.Color(0x0d0a08);

    // — riflesso fake dell'opera: piano speculare SOTTO il pavimento
    //   semitrasparente (niente RT, texture 600px, affiora solo nel dwell) —
    handle.mirrorMat = null;
    try {
      const mirTex = await ctx.loadTexture('/images/gen/Depressione-600.webp');
      const mirGeo = new THREE.PlaneGeometry(opW, opH);
      const mirMat = new THREE.MeshBasicMaterial({
        map: mirTex,
        color: 0x8a7a5c, // smorza e scalda il riflesso
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
        fog: true,
      });
      const mirror = new THREE.Mesh(mirGeo, mirMat);
      mirror.position.set(0, floorY * 2, 0);
      mirror.scale.y = -1; // immagine speculare
      mirror.renderOrder = 1;
      scene.add(mirror);
      handle.mirrorMat = mirMat;
      handle.geometries.push(mirGeo);
      handle.materials.push(mirMat);
    } catch (e) {
      handle.mirrorMat = null;
    }

    // — pavimento d'ossidiana (sopra il riflesso, semitrasparente) —
    const floorGeo = new THREE.PlaneGeometry(40, 36);
    const floorUni = {
      uGlow: { value: 0 },
      uFogNear: { value: 1.2 },
      uFogFar: { value: 7.0 },
      uFogColor: { value: scene.fog.color },
    };
    const floorMat = new THREE.ShaderMaterial({
      vertexShader: FLOOR_VERT,
      fragmentShader: FLOOR_FRAG,
      uniforms: floorUni,
      transparent: true,
      depthWrite: false,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, floorY, 4);
    floor.renderOrder = 2;
    scene.add(floor);
    handle.floorUni = floorUni;
    handle.geometries.push(floorGeo);
    handle.materials.push(floorMat);

    // — crepa dorata (kintsugi): l'unica guida nel buio —
    const crackGeo = buildCrackGeometry(prng, floorY);
    const crackUni = {
      uTime: { value: 0 },
      uWide: { value: 1 },
      uIntensity: { value: 1 },
      uFogNear: { value: 1.2 },
      uFogFar: { value: 7.0 },
    };
    const crackMat = new THREE.ShaderMaterial({
      vertexShader: CRACK_VERT,
      fragmentShader: CRACK_FRAG,
      uniforms: crackUni,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const crack = new THREE.Mesh(crackGeo, crackMat);
    crack.frustumCulled = false;
    crack.renderOrder = 4;
    scene.add(crack);
    handle.crackUni = crackUni;
    handle.geometries.push(crackGeo);
    handle.materials.push(crackMat);

    // — bordo emissivo dell'opera (spento fuori dal dwell, §1.6) —
    const frameGeo = new THREE.PlaneGeometry(opW + 0.09, opH + 0.09);
    const frameUni = { uGlow: { value: 0 }, uTime: { value: 0 } };
    const frameMat = new THREE.ShaderMaterial({
      vertexShader: FRAME_VERT,
      fragmentShader: FRAME_FRAG,
      uniforms: frameUni,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const frameGlow = new THREE.Mesh(frameGeo, frameMat);
    frameGlow.position.set(0, 0, -0.02); // appena dietro l'operaPlane
    frameGlow.renderOrder = 5;
    scene.add(frameGlow);
    handle.frameUni = frameUni;
    handle.geometries.push(frameGeo);
    handle.materials.push(frameMat);

    // — pulviscolo d'oro raso terra (1 draw call) —
    const nDust = Math.min(
      DUST[quality.tier] || DUST.low,
      quality.maxParticles || DUST.low
    );
    const dPos = new Float32Array(nDust * 3);
    const dSeed = new Float32Array(nDust * 2);
    const dSize = new Float32Array(nDust);
    for (let i = 0; i < nDust; i++) {
      dPos[i * 3 + 0] = (prng() * 2 - 1) * 3.6;
      dPos[i * 3 + 1] = -1.35 + prng() * 2.2;
      dPos[i * 3 + 2] = -2 + prng() * 16;
      dSeed[i * 2 + 0] = prng() * 10;
      dSeed[i * 2 + 1] = prng();
      dSize[i] = 0.5 + prng() * 1.0;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dSeed, 2));
    dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1));
    const dustUni = {
      uTime: { value: 0 },
      uFade: { value: 0.5 },
      uPointScale: { value: 8 },
      uFogNear: { value: 1.2 },
      uFogFar: { value: 7.0 },
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
    dust.renderOrder = 6;
    scene.add(dust);
    handle.dustUni = dustUni;
    handle.geometries.push(dustGeo);
    handle.materials.push(dustMat);

    // — luci: la doratura bassa dal pavimento (solo dwell) + ambiente minimo —
    const low = new THREE.PointLight(0xd7a94b, 0, 6, 2);
    low.position.set(0, floorY + 0.55, 1.7);
    scene.add(low);
    handle.low = low;
    const amb = new THREE.AmbientLight(0x171207, 0.35);
    scene.add(amb);
    handle.amb = amb;

    // — ink "depressione-occhio": fantasma nella fog, SOLO tier high —
    handle.inkMat = null;
    if (quality.tier === 'high') {
      try {
        const tex = await ctx.loadTexture(ctx.assets.ink('depressione-occhio'));
        const img = tex.image;
        const aspect = img && img.width ? img.width / img.height : 1;
        const hgt = 2.0;
        const inkGeo = new THREE.PlaneGeometry(hgt * aspect, hgt);
        const inkMat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          fog: true, // la fog lo fa affiorare solo quando il buio si apre
        });
        const ink = new THREE.Mesh(inkGeo, inkMat);
        ink.position.set(1.7, 0.4, -4.6);
        ink.rotation.y = -0.12;
        ink.renderOrder = 3;
        scene.add(ink);
        handle.inkMat = inkMat;
        handle.geometries.push(inkGeo);
        handle.materials.push(inkMat);
      } catch (e) {
        handle.inkMat = null;
      }
    }

    return handle;
  },

  update(handle, frame) {
    const p = frame.progress;
    const dwellK = sstep(0.30, 0.42, p) * (1 - sstep(0.58, 0.72, p));
    const exitK = sstep(0.72, 1.0, p);
    const warmK = sstep(0.78, 1.0, p);
    const t = frame.time;

    // la quasi-cecità si apre nel dwell e nell'exit la luce dilaga
    handle.fog.far = 7.0 + 6.0 * dwellK + 12.0 * exitK;
    handle.fog.near = 1.2 + 1.4 * exitK;
    // il nero scalda verso i toni legno del mondo dopo
    handle.fog.color.lerpColors(handle.cBlack, handle.cWarm, warmK);
    // scene.background e uFogColor condividono la STESSA istanza Color

    const cu = handle.crackUni;
    cu.uTime.value = t;
    cu.uWide.value = 1 + 2.2 * exitK; // la crepa si allarga in luce
    cu.uIntensity.value = 0.9 - 0.25 * dwellK + 1.5 * exitK;
    cu.uFogNear.value = handle.fog.near;
    cu.uFogFar.value = handle.fog.far;

    handle.floorUni.uGlow.value = dwellK + 0.6 * exitK;
    handle.floorUni.uFogNear.value = handle.fog.near;
    handle.floorUni.uFogFar.value = handle.fog.far;

    // cornice kintsugi: accesa solo nel dwell
    handle.frameUni.uGlow.value = dwellK;
    handle.frameUni.uTime.value = t;

    if (handle.mirrorMat) handle.mirrorMat.opacity = 0.05 + 0.22 * dwellK;

    // luce bassa dal pavimento: l'opera si accende della sua doratura
    handle.low.intensity = 2.4 * dwellK + 0.8 * exitK;
    handle.amb.intensity = 0.35 + 0.3 * dwellK;

    const du = handle.dustUni;
    du.uTime.value = t;
    du.uFade.value = 0.35 + 0.4 * dwellK + 0.3 * exitK;
    du.uPointScale.value = handle.viewport.h * handle.viewport.dpr * 0.008;
    du.uFogNear.value = handle.fog.near;
    du.uFogFar.value = handle.fog.far;

    if (handle.inkMat) handle.inkMat.opacity = 0.25 * (0.25 + 0.75 * dwellK);
  },

  dispose(handle) {
    for (const g of handle.geometries) g.dispose();
    for (const m of handle.materials) m.dispose();
    // le texture del loader condiviso (riflesso, ink) le libera l'engine
    handle.geometries.length = 0;
    handle.materials.length = 0;
  },
};
