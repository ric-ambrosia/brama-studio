/**
 * P3 — la torcia.
 * Micro-scena three.js per opera: quad ortografico + shader.
 * Il puntatore/dito è la torcia: uno spot rivela i colori veri, accende
 * glint "fibra ottica" e, per Abbandono, lo specchio infinito al centro.
 * Se WebGL non è disponibile → fallback CSS radial-gradient.
 */
import * as THREE from 'three';

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uMouse;     // 0..1 spazio canvas, y verso l'alto
uniform vec2 uRes;
uniform vec2 uCover;     // scala per object-fit: cover
uniform float uTime;
uniform float uMode;     // 1 = vertigine, 2 = abbandono
uniform float uBoost;    // 0..1 ingresso nella materia

float hash(vec2 p){
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main(){
  vec2 uv = (vUv - 0.5) * uCover + 0.5;
  vec3 tex = texture2D(uTex, uv).rgb;
  float lum = dot(tex, vec3(0.299, 0.587, 0.114));

  vec2 asp = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  float d = distance(vUv * asp, uMouse * asp);

  float r = 0.36;
  float spot = smoothstep(r, r * 0.10, d);
  float halo = smoothstep(r * 2.3, 0.0, d);

  // galleria spenta + torcia che rivela il colore vero
  vec3 col = tex * (0.17 + 0.11 * halo);
  col += tex * spot * 1.08;
  col += vec3(1.0, 0.94, 0.82) * spot * spot * 0.10;

  if (uMode < 1.5) {
    // VERTIGINE — schegge di vetro rosso e fibre lungo le correnti chiare
    float redness = clamp(tex.r - 0.5 * (tex.g + tex.b), 0.0, 1.0);
    float h = hash(floor(uv * 210.0));
    float tw = 0.6 + 0.4 * sin(uTime * 2.6 + h * 6.2831);
    float glint = step(0.93, h) * smoothstep(0.22, 0.85, redness + lum * 0.35) * tw;
    col += vec3(1.0, 0.55, 0.4) * glint * spot * 1.7;
    float fib = smoothstep(0.6, 0.95, lum)
              * (0.5 + 0.5 * sin(uTime * 1.7 + uv.x * 40.0 + uv.y * 26.0));
    col += vec3(0.65, 0.85, 1.0) * fib * spot * 0.38;
  } else {
    // ABBANDONO — punti dispersi che rispondono anche da lontano
    float h = hash(floor(uv * vec2(70.0, 140.0)));
    float pt = step(0.962, h);
    float far = smoothstep(1.15, 0.0, d);
    float tw = 0.55 + 0.45 * sin(uTime * 3.1 + h * 6.2831);
    col += vec3(0.85, 0.92, 1.0) * pt * tw * (0.28 * far + 1.35 * spot);
    // specchio infinito al centro: anelli che si accendono con la luce vicina
    vec2 c = vec2(0.5, 0.47);
    float dc = distance(uv, c);
    float near = smoothstep(0.55, 0.10, distance(uMouse * asp, c * asp));
    float rings = (0.5 + 0.5 * sin(dc * 92.0 - uTime * 2.4))
                * smoothstep(0.17, 0.02, dc);
    col += vec3(0.55, 0.75, 1.0) * rings * near * 0.95;
    col += vec3(0.85, 0.93, 1.0) * smoothstep(0.045, 0.0, dc) * near * 0.9;
  }

  col *= 0.35 + 0.65 * uBoost;
  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * @param {HTMLElement} figure  .p3-artwork (contiene img + canvas + fallback)
 * @param {number} mode  1 vertigine, 2 abbandono
 * @returns {{ setRunning(on:boolean):void, setBoost(v:number):void, resize():void, ok:boolean }}
 */
export function createTorch(figure, mode) {
  const img = figure.querySelector('img');
  const canvas = figure.querySelector('.p3-torch');
  const fallback = figure.querySelector('.p3-torch-fallback');

  let renderer = null;
  let scene, camera, material;
  let running = false;
  let rafId = 0;
  let texAspect = mode === 1 ? 1200 / 797 : 600 / 1223;

  const mouse = { x: 0.5, y: 0.55, tx: 0.5, ty: 0.55, touched: false };
  const t0 = performance.now();

  function tryWebGL() {
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
        powerPreference: 'low-power',
        failIfMajorPerformanceCaveat: false,
      });
    } catch {
      renderer = null;
      return false;
    }
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTex: { value: new THREE.Texture() },
        uMouse: { value: new THREE.Vector2(0.5, 0.55) },
        uRes: { value: new THREE.Vector2(1, 1) },
        uCover: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uMode: { value: mode },
        uBoost: { value: 0 },
      },
    });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    resize();
    return true;
  }

  function resize() {
    if (!renderer) return;
    const rect = figure.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    renderer.setPixelRatio(dpr);
    renderer.setSize(rect.width, rect.height, false);
    material.uniforms.uRes.value.set(rect.width, rect.height);
    const canvasA = rect.width / rect.height;
    // object-fit: cover
    if (canvasA >= texAspect) {
      material.uniforms.uCover.value.set(1, texAspect / canvasA);
    } else {
      material.uniforms.uCover.value.set(canvasA / texAspect, 1);
    }
  }

  function frame() {
    if (!running) return;
    const t = (performance.now() - t0) / 1000;
    if (!mouse.touched) {
      // deriva lenta: la scena respira anche prima del primo tocco
      mouse.tx = 0.5 + 0.30 * Math.sin(t * 0.4);
      mouse.ty = 0.52 + 0.24 * Math.cos(t * 0.27);
    }
    mouse.x += (mouse.tx - mouse.x) * 0.09;
    mouse.y += (mouse.ty - mouse.y) * 0.09;

    if (renderer) {
      material.uniforms.uTime.value = t;
      material.uniforms.uMouse.value.set(mouse.x, mouse.y);
      renderer.render(scene, camera);
    } else if (fallback) {
      fallback.style.setProperty('--tx', (mouse.x * 100).toFixed(1) + '%');
      fallback.style.setProperty('--ty', ((1 - mouse.y) * 100).toFixed(1) + '%');
    }
    rafId = requestAnimationFrame(frame);
  }

  function onPointer(e) {
    const rect = figure.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    mouse.tx = (cx - rect.left) / rect.width;
    mouse.ty = 1 - (cy - rect.top) / rect.height;
    mouse.touched = true;
  }

  let texLoaded = false;
  function ensureTex() {
    // lazy: la texture si scarica solo alla prima attivazione dell'opera
    if (texLoaded || !renderer) return;
    texLoaded = true;
    new THREE.TextureLoader().load(img.currentSrc || img.src, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      texAspect = t.image.width / t.image.height;
      material.uniforms.uTex.value = t;
      resize();
    });
  }

  const ok = tryWebGL();
  if (!ok && fallback) fallback.setAttribute('data-on', '');

  // la torcia segue mouse e dito sull'intera sezione, non solo sul quadro
  const section = figure.closest('.p3-opera') || figure;
  section.addEventListener('pointermove', onPointer, { passive: true });
  section.addEventListener('touchmove', onPointer, { passive: true });

  return {
    ok,
    resize,
    setRunning(on) {
      if (on === running) return;
      running = on;
      if (on) {
        ensureTex();
        rafId = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(rafId);
      }
    },
    setBoost(v) {
      if (material) material.uniforms.uBoost.value = v;
      if (canvas) canvas.style.opacity = String(Math.min(1, v * 1.4));
      if (!renderer && fallback) fallback.style.opacity = String(v);
    },
  };
}
