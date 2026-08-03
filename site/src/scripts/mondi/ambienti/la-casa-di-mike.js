/**
 * MONDI · ambiente 7 — la-casa-di-mike — «la casa dentro la casa»
 * Contratto: content-notes/mondi-architettura.md §2 e §4.7.
 *
 * Legno, alluminio, vetro: il rifugio. Telai-casa (profilo a capanna) annidati
 * lungo il binario: attraversarli = entrare in casa, soglia dopo soglia, fino
 * alla stanza più interna dove vive l'opera. Un taglio di luce pomeridiana con
 * pulviscolo caldo; in exit la finestra sul retro si apre sul blu freddo di lu.
 *
 * Draw call (high): telai instanced 1 + spigoli alluminio 1 + vetri 3 +
 * lama di luce 1 + pulviscolo 1 + ink `mike-casa` 1 = 8. Particelle ≤ 1.2k.
 * Nessuna allocazione in update. Unica casualità: ctx.prng.
 */

import * as THREE from 'three';

export const preload = [
  '/images/gen/La_Casa_Di_Mike-1200.webp',
  '/viaggio/mike-casa.webp',
];

// Profondità del binario dichiarata al motore (camera entra da z=+depth).
export const depth = 12;

/* ------------------------------------------------------------------ utils */

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function sstep(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
function damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); }

/** Sagoma "casa" (capanna) con foro concentrico — profilo del telaio. */
function houseFrameGeometry() {
  const outer = [
    [-0.5, -0.6], [0.5, -0.6], [0.5, 0.25], [0.0, 0.67], [-0.5, 0.25],
  ];
  const shape = new THREE.Shape();
  outer.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  // Foro: stessa sagoma ristretta verso il baricentro (~larghezza telaio 0.07)
  const cx = 0, cy = 0.03, k = 0.86;
  const hole = new THREE.Path();
  for (let i = outer.length - 1; i >= 0; i--) {
    const x = cx + (outer[i][0] - cx) * k;
    const y = cy + (outer[i][1] - cy) * k;
    if (i === outer.length - 1) hole.moveTo(x, y); else hole.lineTo(x, y);
  }
  hole.closePath();
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false, curveSegments: 4 });
  geo.translate(0, -0.05, -0.05);
  return geo;
}

/* ---------------------------------------------------------------- shaders */

const GLASS_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vW;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const GLASS_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCold;
  uniform vec3 uWarm;
  varying vec3 vN;
  varying vec3 vW;
  varying vec2 vUv;
  void main() {
    vec3 V = normalize(cameraPosition - vW);
    float fres = pow(1.0 - abs(dot(normalize(vN), V)), 3.0);
    // banda speculare lenta che scivola in diagonale (vetro vivo, mai fermo)
    float band = sin((vUv.x + vUv.y) * 5.2 - uTime * 0.22);
    float sheen = smoothstep(0.86, 0.99, band) * 0.30;
    float d = length(cameraPosition - vW);
    float fade = 1.0 - smoothstep(6.0, 14.0, d);
    vec3 col = mix(uCold, uWarm, 0.25 + 0.45 * fres) * (0.5 + fres);
    float a = (0.045 + 0.34 * fres + sheen) * fade;
    gl_FragColor = vec4(col, a);
  }
`;

const SHAFT_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SHAFT_FRAG = /* glsl */ `
  uniform float uInt;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    float across = smoothstep(0.0, 0.42, vUv.x) * smoothstep(1.0, 0.58, vUv.x);
    float along = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
    float d = length(cameraPosition - vW);
    float fade = 1.0 - smoothstep(7.0, 15.0, d);
    float a = across * across * along * uInt * 0.32 * fade;
    gl_FragColor = vec4(uColor, a);
  }
`;

const DUST_VERT = /* glsl */ `
  attribute vec4 aS; // x: freq, y/z: fasi, w: taglia
  uniform float uDriftT;
  uniform float uSize;
  varying float vTw;
  void main() {
    vec3 p = position;
    p.x += sin(uDriftT * aS.x + aS.y) * 0.09;
    p.y += sin(uDriftT * aS.x * 0.63 + aS.z) * 0.07;
    p.z += sin(uDriftT * aS.x * 0.41 + aS.y * 1.7) * 0.07;
    vTw = 0.55 + 0.45 * sin(uDriftT * (0.6 + aS.x) + aS.z * 2.3);
    vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
    gl_PointSize = min(5.0, uSize * aS.w / max(0.6, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const DUST_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vTw;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float a = smoothstep(0.5, 0.12, d) * vTw * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }
`;

/* ----------------------------------------------------------------- module */

export default {
  id: 'la-casa-di-mike',
  colors: {
    entry: '#0d0a08', // dal varco di depressione
    exit: '#061020',  // verso la notte azzurra di lu
    fog: '#0d0a08',
  },

  async init(ctx) {
    const { scene, prng, quality } = ctx;
    const tier = quality.tier;
    const h = {
      ctx,
      depth,
      group: new THREE.Group(),
      // stato animazione (nessuna allocazione in update)
      driftT: 0,
      calm: 1,
      exitK: 0,
      shaftInt: 0.55,
      // colori pre-allocati
      cFogBase: new THREE.Color('#0d0a08'),
      cFogExit: new THREE.Color('#061020'),
      cEdgeWarm: new THREE.Color('#9fb2c8'),
      cEdgeCold: new THREE.Color('#4a93e6'),
      disposables: [],
    };
    scene.add(h.group);

    scene.fog = new THREE.Fog(h.cFogBase.getHex(), 5, 15);
    scene.background = new THREE.Color('#0d0a08');
    h.fog = scene.fog;
    h.bg = scene.background;

    /* --- telai-casa annidati (InstancedMesh, 1 dc) --- */
    const frameCount = tier === 'high' ? 24 : tier === 'mid' ? 16 : 10;
    const frameGeo = houseFrameGeometry();
    const frameMat = new THREE.MeshStandardMaterial({
      color: '#5a4630', roughness: 0.82, metalness: 0.06,
    });
    const frames = new THREE.InstancedMesh(frameGeo, frameMat, frameCount);
    frames.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const matrices = [];
    for (let i = 0; i < frameCount; i++) {
      const t = i / (frameCount - 1);
      const s = 5.0 - 2.3 * t;                    // il rifugio si stringe entrando
      dummy.position.set(
        (prng() - 0.5) * 0.22,
        (prng() - 0.5) * 0.16,
        11.5 - 13.0 * t,                          // da +11.5 a −1.5 (oltre l'opera)
      );
      dummy.rotation.set(0, 0, (prng() - 0.5) * 0.06);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      frames.setMatrixAt(i, dummy.matrix);
      matrices.push(dummy.matrix.clone());
    }
    frames.instanceMatrix.needsUpdate = true;
    h.group.add(frames);
    h.disposables.push(frameGeo, frameMat);

    /* --- spigoli d'alluminio: edges di tutti i telai fusi in 1 dc --- */
    const edgeSrc = new THREE.EdgesGeometry(frameGeo, 25);
    const srcPos = edgeSrc.getAttribute('position');
    const edgePos = new Float32Array(srcPos.count * 3 * frameCount);
    const v = new THREE.Vector3();
    for (let i = 0; i < frameCount; i++) {
      for (let j = 0; j < srcPos.count; j++) {
        v.fromBufferAttribute(srcPos, j).applyMatrix4(matrices[i]);
        const o = (i * srcPos.count + j) * 3;
        edgePos[o] = v.x; edgePos[o + 1] = v.y; edgePos[o + 2] = v.z;
      }
    }
    edgeSrc.dispose();
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePos, 3));
    const edgeMat = new THREE.LineBasicMaterial({
      color: '#9fb2c8', transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    edges.frustumCulled = false;
    h.group.add(edges);
    h.edgeMat = edgeMat;
    h.disposables.push(edgeGeo, edgeMat);

    /* --- 3 lastre di vetro (fresnel, materiale condiviso) --- */
    const glassMat = new THREE.ShaderMaterial({
      vertexShader: GLASS_VERT,
      fragmentShader: GLASS_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uCold: { value: new THREE.Color('#9fb2c8') },
        uWarm: { value: new THREE.Color('#d7b070') },
      },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const glassGeo = new THREE.PlaneGeometry(1, 1.12);
    h.glassMat = glassMat;
    h.disposables.push(glassGeo, glassMat);
    const paneCount = tier === 'low' ? 1 : 3;
    const paneT = [0.24, 0.55, 0.86];
    for (let i = 0; i < paneCount; i++) {
      const t = paneT[i];
      const s = (5.0 - 2.3 * t) * 0.84;
      const pane = new THREE.Mesh(glassGeo, glassMat);
      pane.position.set((prng() - 0.5) * 0.1, 0, 11.5 - 13.0 * t + 0.3);
      pane.rotation.y = (prng() - 0.5) * 0.14;
      pane.scale.setScalar(s);
      h.group.add(pane);
    }

    /* --- taglio di luce pomeridiana (lama additiva) --- */
    const shaftGeo = new THREE.PlaneGeometry(2.3, 8.5);
    const shaftMat = new THREE.ShaderMaterial({
      vertexShader: SHAFT_VERT,
      fragmentShader: SHAFT_FRAG,
      uniforms: {
        uInt: { value: 0.55 },
        uColor: { value: new THREE.Color('#d7b070') },
      },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.set(1.15, 1.0, 1.9);
    shaft.rotation.set(-0.12, 0.3, -0.5);
    h.group.add(shaft);
    h.shaftMat = shaftMat;
    h.disposables.push(shaftGeo, shaftMat);

    /* --- pulviscolo caldo nel taglio di luce --- */
    const dustCount = Math.min(
      tier === 'high' ? 1200 : tier === 'mid' ? 700 : 380,
      quality.maxParticles || 12000,
    );
    const dPos = new Float32Array(dustCount * 3);
    const dS = new Float32Array(dustCount * 4);
    for (let i = 0; i < dustCount; i++) {
      // volume allungato lungo la lama di luce, verso la stanza dell'opera
      const along = prng();
      dPos[i * 3] = 0.9 - along * 1.1 + (prng() - 0.5) * 1.7;
      dPos[i * 3 + 1] = 1.6 - along * 2.4 + (prng() - 0.5) * 1.5;
      dPos[i * 3 + 2] = 3.0 - along * 3.4 + (prng() - 0.5) * 2.0;
      dS[i * 4] = 0.4 + prng() * 1.1;        // frequenza deriva
      dS[i * 4 + 1] = prng() * 6.283;        // fase x
      dS[i * 4 + 2] = prng() * 6.283;        // fase y
      dS[i * 4 + 3] = 0.8 + prng() * 1.8;    // taglia
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    dustGeo.setAttribute('aS', new THREE.BufferAttribute(dS, 4));
    const dustMat = new THREE.ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      uniforms: {
        uDriftT: { value: 0 },
        uSize: { value: 4.0 },
        uColor: { value: new THREE.Color('#e8c890') },
        uOpacity: { value: 0.5 },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.frustumCulled = false;
    h.group.add(dust);
    h.dustMat = dustMat;
    h.disposables.push(dustGeo, dustMat);

    /* --- luci: chiave calda + controluce fredda (accesa solo in exit) --- */
    h.ambient = new THREE.AmbientLight('#3a2c1c', 0.55);
    scene.add(h.ambient);
    h.key = new THREE.DirectionalLight('#e8c088', 1.15);
    h.key.position.set(2.5, 3.5, 4.5);
    scene.add(h.key);
    if (tier !== 'low') {
      h.rim = new THREE.DirectionalLight('#4a93e6', 0);
      h.rim.position.set(-1.2, 0.8, -5);
      scene.add(h.rim);
    }

    /* --- ink `mike-casa`: emblema oltre l'ultima finestra (op ≤ 0.4) --- */
    if (tier !== 'low') {
      try {
        const inkPath = ctx.assets && ctx.assets.ink
          ? ctx.assets.ink('mike-casa') : '/viaggio/mike-casa.webp';
        const tex = await ctx.loadTexture(inkPath);
        const ar = tex.image && tex.image.width ? tex.image.width / tex.image.height : 1;
        const inkGeo = new THREE.PlaneGeometry(2.6 * ar, 2.6);
        const inkMat = new THREE.MeshBasicMaterial({
          map: tex, transparent: true, opacity: 0.12, depthWrite: false,
        });
        const ink = new THREE.Mesh(inkGeo, inkMat);
        ink.position.set(0.2, 0.15, -4.6);
        h.group.add(ink);
        h.inkMat = inkMat;
        h.disposables.push(inkGeo, inkMat);
      } catch (e) { /* senza emblema il mondo regge comunque */ }
    }

    return h;
  },

  update(h, frame) {
    const dt = frame.dt;
    const t = frame.time;
    const p = frame.progress;
    const dwell = frame.phase === 'dwell';
    const exiting = frame.phase === 'exit';

    // quiete del pulviscolo: in dwell la stanza trattiene il fiato
    h.calm = damp(h.calm, dwell ? 0.32 : 1, 3, dt);
    h.driftT += dt * h.calm;
    h.dustMat.uniforms.uDriftT.value = h.driftT;
    h.dustMat.uniforms.uSize.value =
      h.ctx.viewport.h * (h.ctx.viewport.dpr || 1) * 0.004;
    h.dustMat.uniforms.uOpacity.value = dwell ? 0.62 : 0.45;

    h.glassMat.uniforms.uTime.value = t;

    // lama di luce: piena nel dwell, si spegne nel varco
    const shaftTarget = exiting ? 0.18 : dwell ? 1.0 : 0.55;
    h.shaftInt = damp(h.shaftInt, shaftTarget, 2.5, dt);
    h.shaftMat.uniforms.uInt.value = h.shaftInt;

    // varco verso lu: il blu freddo invade da dietro l'ultima finestra
    const kTarget = exiting ? sstep((p - 0.62) / 0.38) : 0;
    h.exitK = damp(h.exitK, kTarget, 4, dt);
    h.fog.color.lerpColors(h.cFogBase, h.cFogExit, h.exitK);
    h.bg.lerpColors(h.cFogBase, h.cFogExit, h.exitK);
    if (h.rim) h.rim.intensity = h.exitK * 1.1;
    h.key.intensity = 1.15 * (1 - h.exitK * 0.6);

    // spigoli d'alluminio: vivi in approccio, quieti in dwell, freddi in exit
    h.edgeMat.color.lerpColors(h.cEdgeWarm, h.cEdgeCold, h.exitK);
    h.edgeMat.opacity = dwell ? 0.1 : 0.16 + h.exitK * 0.14;

    // emblema: si intravede nel dwell, si rivela aprendo la finestra sul retro
    if (h.inkMat) h.inkMat.opacity = 0.12 + 0.28 * Math.max(h.exitK, dwell ? 0.35 : 0);
  },

  dispose(h) {
    const scene = h.group.parent;
    if (scene) {
      scene.remove(h.group);
      if (h.ambient) scene.remove(h.ambient);
      if (h.key) scene.remove(h.key);
      if (h.rim) scene.remove(h.rim);
    }
    for (const d of h.disposables) d.dispose();
    h.disposables.length = 0;
    h.group.clear();
  },
};
