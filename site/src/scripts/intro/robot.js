// brama — avatar robot come OGGETTO 3D vero.
// La testa dell'androide (robot.png) diventa una mesh: un piano ad alta densità
// dislocato in Z dalla depth map (robot-depth.png), ritagliato dall'alpha
// (robot-cut.png). Resa olografica: tinta ciano, scanline, bordi luminosi dal
// gradiente di profondità, wireframe additivo. L'oggetto RUOTA davvero nello
// spazio verso il cursore; a puntatore fermo (o su touch) entra in idle:
// sguardo che vaga, espressione neutra↔sorriso (crossfade texture), blink
// come linea di scansione, micro-fluttuazione. Tutto deterministico.
import * as THREE from 'three';

const robotEl = document.querySelector('.robot');
const canvas = document.getElementById('robot3d');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (robotEl && canvas && !reduce) {
  init();
}

function init() {
  const coarse = matchMedia('(pointer: coarse)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    robotEl.classList.add('no-gl');
    return;
  }
  if (!renderer.getContext()) {
    robotEl.classList.add('no-gl');
    return;
  }
  renderer.setClearColor(0x000000, 0);
  const DPR = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
  renderer.setPixelRatio(DPR);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
  camera.position.set(0, 0, 2.6);

  const loader = new THREE.TextureLoader();
  const tex = (url) => {
    const t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return t;
  };
  const tColor = tex('/holoface/robot.png');
  const tSmile = tex('/holoface/robot-smile.png');
  const tCut = loader.load('/holoface/robot-cut.png');
  const tDepth = loader.load('/holoface/robot-depth.png');

  const uniforms = {
    tColor: { value: tColor },
    tSmile: { value: tSmile },
    tCut: { value: tCut },
    tDepth: { value: tDepth },
    uDisp: { value: 0.42 },      // profondità dell'estrusione
    uSmile: { value: 0 },
    uTime: { value: 0 },
    uFlick: { value: 1 },
    uScanY: { value: -1 },       // linea del blink (uv.y), -1 = fuori
    uHolo: { value: 0.55 },      // quanto "ologramma" vs realistico
  };

  const VERT = `
    uniform sampler2D tDepth;
    uniform float uDisp;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      float d = texture2D(tDepth, uv).r;
      vec3 p = position;
      p.z += d * uDisp;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `;

  const FRAG = `
    precision highp float;
    uniform sampler2D tColor, tSmile, tCut, tDepth;
    uniform float uSmile, uTime, uFlick, uScanY, uHolo;
    varying vec2 vUv;
    void main() {
      float a = texture2D(tCut, vUv).a;
      if (a < 0.12) discard;

      vec3 col = mix(texture2D(tColor, vUv).rgb, texture2D(tSmile, vUv).rgb, uSmile);

      // trattamento olografico: tinta fredda + sollevamento dei blu
      vec3 holo = col * vec3(0.62, 0.92, 1.30) + vec3(0.015, 0.06, 0.14);
      col = mix(col, holo, uHolo);

      // bordi luminosi dove la profondità cambia (contorni del volto/pannelli)
      float dC = texture2D(tDepth, vUv).r;
      float dX = texture2D(tDepth, vUv + vec2(0.0045, 0.0)).r - dC;
      float dY = texture2D(tDepth, vUv + vec2(0.0, 0.0045)).r - dC;
      float edge = clamp(length(vec2(dX, dY)) * 9.0, 0.0, 1.0);
      col += vec3(0.25, 0.65, 1.0) * edge * 0.75;

      // scanline sottili
      col *= 0.93 + 0.07 * sin(vUv.y * 640.0 + uTime * 1.4);

      // blink: lampo-linea che scende sul viso
      float scan = smoothstep(0.035, 0.0, abs(vUv.y - uScanY));
      col += vec3(0.5, 0.85, 1.0) * scan * 0.9;

      col *= uFlick;

      // il busto si dissolve verso il basso, come un ologramma proiettato
      float fade = smoothstep(0.02, 0.30, vUv.y);
      gl_FragColor = vec4(col, a * 0.97 * fade);
    }
  `;

  const seg = coarse ? 128 : 220;
  const geo = new THREE.PlaneGeometry(1.5, 1.5, seg, seg);

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geo, mat);

  // wireframe additivo leggero: vende la tridimensionalità dell'oggetto
  const wireUniforms = { tDepth: uniforms.tDepth, uDisp: uniforms.uDisp, tCut: uniforms.tCut };
  const wireMat = new THREE.ShaderMaterial({
    uniforms: wireUniforms,
    vertexShader: VERT,
    fragmentShader: `
      precision highp float;
      uniform sampler2D tCut;
      varying vec2 vUv;
      void main() {
        float a = texture2D(tCut, vUv).a;
        if (a < 0.12) discard;
        float fade = smoothstep(0.02, 0.30, vUv.y);
        gl_FragColor = vec4(0.30, 0.70, 1.0, 0.05 * fade);
      }
    `,
    wireframe: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const wire = new THREE.Mesh(geo, wireMat);
  wire.position.z = 0.001;

  const group = new THREE.Group();
  group.add(mesh);
  group.add(wire);
  scene.add(group);

  function resize() {
    const w = robotEl.clientWidth || 1;
    const h = robotEl.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  // ---- input puntatore ----
  let px = 0, py = 0, lastMove = -1e9;
  function onMove(cx, cy) {
    px = (cx / innerWidth) * 2 - 1;
    py = (cy / innerHeight) * 2 - 1;
    lastMove = performance.now();
  }
  addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY), { passive: true });
  addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  // ---- blink deterministico ----
  let blinkStart = -1;
  let nextBlink = 1800;

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function getP() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--p');
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  let ry = 0, rx = 0, smile = 0, bobY = 0;
  const start = performance.now();
  let raf = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const p = getP();
    if (p < 0.02) return; // il robot non è ancora in scena

    const t = (now - start) / 1000;
    uniforms.uTime.value = t;
    const idle = coarse || now - lastMove > 1500;

    let tRy, tRx, tSmile;
    if (idle) {
      // sguardo che vaga + espressioni che si alternano lente
      const wx = Math.sin(t * 0.42) * 0.55 + Math.sin(t * 0.16) * 0.25;
      const wy = Math.sin(t * 0.31 + 1.6) * 0.35;
      tRy = wx * 0.30;                          // radianti
      tRx = wy * 0.16;
      tSmile = clamp(0.5 + 0.62 * Math.sin(t * 0.26), 0, 1);
      bobY = lerp(bobY, Math.sin(t * 0.75) * 0.02, 0.04);
    } else {
      // ruota VERSO il cursore (oggetto 3D vero)
      tRy = clamp(px, -1, 1) * 0.34;
      tRx = clamp(py, -1, 1) * 0.20;
      tSmile = 0.1;
      bobY = lerp(bobY, 0, 0.05);
    }

    ry = lerp(ry, tRy, 0.08);
    rx = lerp(rx, tRx, 0.08);
    smile = lerp(smile, tSmile, 0.025);
    group.rotation.y = ry;
    group.rotation.x = rx;
    group.position.y = bobY;
    uniforms.uSmile.value = smile;

    // flicker olografico lievissimo
    uniforms.uFlick.value = 0.965 + 0.035 * (0.5 + 0.5 * Math.sin(t * 21.0) * Math.sin(t * 6.7));

    // blink: linea che attraversa il viso in ~220ms
    if (blinkStart < 0 && now > nextBlink) {
      blinkStart = now;
      const base = idle ? 2600 : 4200;
      nextBlink = now + base + 1400 * (0.5 + 0.5 * Math.sin(now * 0.0013));
    }
    if (blinkStart >= 0) {
      const k = (now - blinkStart) / 220;
      if (k >= 1) {
        blinkStart = -1;
        uniforms.uScanY.value = -1;
      } else {
        uniforms.uScanY.value = 0.78 - k * 0.62; // dall'alto del viso in giù
      }
    }

    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  addEventListener('pagehide', () => {
    if (raf) cancelAnimationFrame(raf);
    geo.dispose();
    mat.dispose();
    wireMat.dispose();
    [tColor, tSmile, tCut, tDepth].forEach((t) => t.dispose());
    renderer.dispose();
  });
}
