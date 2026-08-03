// ─────────────────────────────────────────────────────────────────────────────
// MONDI · lib/veil.js — pass del "varco a velo" (contratto §1.4).
//
// Due modalità, stessa grammatica visiva:
//  - compose(): dual-RT crossfade — le scene N e N+1 renderizzate su due render
//    target a MEZZA risoluzione, composte con un velo di colore che invade:
//    A dissolve VERSO uColor (k→0.5), B emerge DA uColor (k→1).
//  - overlay(): "velo semplice" per tier low — un quad colorato sopra la scena
//    corrente (alpha dal chiamante), swap di scena a k=0.5 gestito dall'engine.
//
// In più: vignette opzionale (uniform), ammessa dal contratto per lu (§4.8) e
// usata dall'engine come fx per-ambiente (handle.fx.vignette, clampata).
//
// Color management: le scene vengono renderizzate nei RT con colorSpace SRGB
// (encode hardware in scrittura, decode hardware in lettura → si compone in
// lineare); i quad finali ri-encodano con <colorspace_fragment>.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const COMPOSE_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tA;
  uniform sampler2D tB;
  uniform float uK;        // 0 → solo A · 0.5 → solo velo · 1 → solo B
  uniform vec3  uColor;    // colore-varco (exit di N ≡ entry di N+1)
  uniform float uVignette;
  void main() {
    vec3 a = texture2D(tA, vUv).rgb;
    vec3 b = texture2D(tB, vUv).rgb;
    float toVeil   = smoothstep(0.10, 0.48, uK);
    float fromVeil = smoothstep(0.52, 0.90, uK);
    vec3 col = mix(a, uColor, toVeil);
    col = mix(col, b, fromVeil);
    float d = distance(vUv, vec2(0.5));
    col *= 1.0 - uVignette * smoothstep(0.34, 0.78, d);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const OVERLAY_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec3  uColor;
  uniform float uAlpha;
  uniform float uVignette;
  void main() {
    float d = distance(vUv, vec2(0.5));
    float vig = uVignette * smoothstep(0.32, 0.80, d);
    float a = clamp(uAlpha + vig, 0.0, 1.0);
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

export function createVeil(renderer) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new THREE.PlaneGeometry(2, 2);

  const composeMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: COMPOSE_FRAG,
    uniforms: {
      tA: { value: null },
      tB: { value: null },
      uK: { value: 0 },
      uColor: { value: new THREE.Color(0x050a1a) },
      uVignette: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const composeScene = new THREE.Scene();
  composeScene.add(new THREE.Mesh(geo, composeMat));

  const overlayMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: OVERLAY_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(0x050a1a) },
      uAlpha: { value: 0 },
      uVignette: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const overlayScene = new THREE.Scene();
  overlayScene.add(new THREE.Mesh(geo, overlayMat));

  let rtA = null;
  let rtB = null;

  function makeRT(w, h) {
    return new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      colorSpace: THREE.SRGBColorSpace,
      samples: 4, // MSAA sui RT (WebGL2): niente bordi scalettati nel varco
    });
  }

  /** (Ri)crea i RT a ~3/4 di risoluzione (mezza res upscalata pixellava). */
  function setSize(bufferW, bufferH) {
    const w = Math.max(2, Math.floor(bufferW * 0.75));
    const h = Math.max(2, Math.floor(bufferH * 0.75));
    if (rtA && rtA.width === w && rtA.height === h) return;
    if (rtA) rtA.dispose();
    if (rtB) rtB.dispose();
    rtA = makeRT(w, h);
    rtB = makeRT(w, h);
    composeMat.uniforms.tA.value = rtA.texture;
    composeMat.uniforms.tB.value = rtB.texture;
  }

  function hasRT() { return !!rtA; }

  /** Indirizza il prossimo render della scena A/B sul rispettivo RT. */
  function beginA() { renderer.setRenderTarget(rtA); }
  function beginB() { renderer.setRenderTarget(rtB); }

  /** Composita A+velo+B a schermo. k ∈ [0,1], colorHex = colore-varco. */
  function compose(k, colorHex, vignette = 0) {
    composeMat.uniforms.uK.value = k;
    composeMat.uniforms.uColor.value.set(colorHex);
    composeMat.uniforms.uVignette.value = vignette;
    renderer.setRenderTarget(null);
    renderer.render(composeScene, cam);
  }

  /**
   * Velo semplice: quad colorato sopra quanto già renderizzato a schermo.
   * Usato per: tier low (§1.4), dissolvenza di coda, vignette fx (alpha 0).
   */
  function overlay(colorHex, alpha, vignette = 0) {
    if (alpha <= 0.001 && vignette <= 0.001) return;
    overlayMat.uniforms.uColor.value.set(colorHex);
    overlayMat.uniforms.uAlpha.value = alpha;
    overlayMat.uniforms.uVignette.value = vignette;
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(null);
    renderer.render(overlayScene, cam);
    renderer.autoClear = prevAutoClear;
  }

  /** Warm-up shader (compila i due material al primo frame, niente jank). */
  function warm() {
    renderer.compile(composeScene, cam);
    renderer.compile(overlayScene, cam);
  }

  function dispose() {
    if (rtA) rtA.dispose();
    if (rtB) rtB.dispose();
    rtA = rtB = null;
    geo.dispose();
    composeMat.dispose();
    overlayMat.dispose();
  }

  return { setSize, hasRT, beginA, beginB, compose, overlay, warm, dispose };
}
