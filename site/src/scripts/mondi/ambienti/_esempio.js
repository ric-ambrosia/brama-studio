// ─────────────────────────────────────────────────────────────────────────────
// MONDI · ambienti/_esempio.js — MODULO AMBIENTE DI ESEMPIO (non montato).
//
// Mostra il contratto di content-notes/mondi-architettura.md §2 in pratica.
// Copialo come punto di partenza per un ambiente vero. Regole chiave:
//
//   1. Il modulo costruisce il SUO mondo dentro ctx.scene, attorno al binario
//      Z della camera (la camera entra da z=+railDepth e avanza verso z≤0).
//      L'opera (ctx.operaPlane) è GIÀ in scena a (0,0,0), fronte +Z: si può
//      illuminare e incorniciare, MAI muovere/scalare/ritexturare/frammentare.
//   2. Camera, renderer e scene altrui NON si toccano. L'unico canale verso la
//      camera è handle.cameraHints (clampato dall'engine).
//   3. Niente Math.random: solo ctx.prng (seedato per-slug) o lib/prng.js.
//   4. update() NON alloca: ogni temporaneo è pre-allocato in init().
//   5. dispose() libera TUTTO ciò che il modulo ha creato (geometrie, materiali,
//      texture PROPRIE). Le texture prese via ctx.loadTexture le libera
//      l'engine (refcount del cache condiviso): NON fare dispose() su quelle.
//   6. Budget per tier (§2.5): leggere ctx.quality e dimensionare i conti.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

// Texture da precaricare mentre il viaggio è due mondi più indietro (§3).
// L'engine le scarica nel cache condiviso durante il dwell di N-2.
export const preload = [
  // '/viaggio/sigillo-emblema.webp',
];

const TWO_PI = Math.PI * 2;

export default {
  // = slug dell'opera (deve combaciare con la posizione nell'ORDER dell'engine)
  id: '_esempio',

  // VINCOLANTI (§4): exit di questo mondo ≡ entry del successivo.
  // L'engine usa `exit` come colore-varco della transizione.
  colors: {
    entry: '#06102c', // colore da cui il mondo emerge
    exit: '#030308',  // colore in cui il mondo dissolve
    fog: '#0a1430',   // fog/background della scena
  },

  /**
   * Costruisce il mondo. `ctx` (§2.2): scene, operaPlane, camera (read-only),
   * loadTexture, palette, viewport, quality, prng, assets.
   * Ritorna l'`handle`: lo stato del modulo, ripassato a update/dispose.
   */
  async init(ctx) {
    const { scene, operaPlane, palette, quality, prng } = ctx;

    // ── atmosfera: ogni scena ha la SUA fog/background ──────────────────────
    scene.fog = new THREE.Fog(new THREE.Color(this.colors.fog), 6, 26);
    scene.background = new THREE.Color(this.colors.fog);

    // ── luce che accarezza l'opera (≤3 luci dinamiche su tier high) ─────────
    const key = new THREE.SpotLight(0xbfd8f4, 6, 18, 0.6, 0.5);
    key.position.set(1.5, 3, 3.5);
    if (operaPlane) key.target = operaPlane;
    scene.add(key);
    const amb = new THREE.AmbientLight(new THREE.Color(palette.notte2), 2.2);
    scene.add(amb);

    // ── pulviscolo: SEMPRE Points/InstancedMesh (1 draw call), mai mesh singole
    const count = Math.min(900, quality.maxParticles);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count); // fase per l'animazione in update
    for (let i = 0; i < count; i++) {
      // ctx.prng: deterministico per-slug — stesso mondo a ogni visita
      const r = 1.5 + prng() * 3.5;
      const a = prng() * TWO_PI;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = (prng() - 0.5) * 4;
      pos[i * 3 + 2] = -2 + prng() * 12; // disposto LUNGO il binario Z
      seed[i] = prng() * TWO_PI;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(palette.azzurro),
      size: 0.03,
      transparent: true,
      opacity: 0.0, // si accende in approach (vedi update)
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // Esempio d'uso di un asset a inchiostro (§2.5: op. ≤0.5, max 2, parsimonia):
    //   const tex = await ctx.loadTexture(ctx.assets.ink('sigillo-emblema'));
    //   … sprite lontano nel fondale …

    // ── handle: stato + temporanei PRE-ALLOCATI + hints camera ──────────────
    return {
      // unico canale ammesso per influenzare la camera (engine clampa i valori)
      cameraHints: {
        railDepth: 12, // la camera entra da z=+12 (D ∈ 8..16)
        roll: 0,       // gradi di roll suggeriti (clamp ±3)
      },
      // fx di composizione concessi dall'engine (clamp 0..0.5)
      fx: { vignette: 0 },
      key, amb, points, geo, mat, seed,
      edge: 0, // stato del bordo emissivo dell'opera
    };
  },

  /**
   * Pura funzione di frame (§2.3). `frame`: progress, globalProgress, phase
   * ('approach' | 'dwell' | 'exit'), time, dt, pointer, velocity, quality.
   * NIENTE allocazioni qui dentro.
   */
  update(handle, frame) {
    const { points, mat, key } = handle;
    const p = frame.progress;

    // moto d'ambiente: vivo in approach/exit, quieto nel dwell (§1.3)
    const calmo = frame.phase === 'dwell' ? 0.25 : 1;
    points.rotation.z += frame.dt * 0.05 * calmo;

    // il pulviscolo si accende avvicinandosi e muore nel varco
    const inFade = Math.min(1, p / 0.25);
    const outFade = 1 - Math.max(0, (p - 0.72) / 0.28);
    mat.opacity = 0.55 * inFade * outFade;

    // luce chiave: respira piano, si ferma davanti all'opera
    key.intensity = 5 + Math.sin(frame.time * 0.8) * 0.6 * calmo;

    // bordo emissivo dell'opera: acceso SOLO nel dwell (§1.6), con damping.
    // Canale ufficiale: operaPlane.userData.opera.setEdge(intensità, colore)
    // (qui il riferimento all'operaPlane è key.target, salvato in init).
    const target = frame.phase === 'dwell' ? 0.6 : 0;
    handle.edge += (target - handle.edge) * (1 - Math.exp(-4 * frame.dt));
    if (key.target && key.target.userData.opera) {
      key.target.userData.opera.setEdge(handle.edge, '#4a93e6');
    }
  },

  /** Libera TUTTO ciò che init() ha creato. Chiamato dall'engine (§3). */
  dispose(handle) {
    handle.geo.dispose();
    handle.mat.dispose();
    // luci: nessuna risorsa GPU propria, basta che escano di scena
    // (l'engine svuota la scena dopo questa chiamata).
    // Texture prese con ctx.loadTexture: NON toccarle (refcount dell'engine).
  },
};
