// Visore 3D dell'opera cinetica "Paura".
// Desktop: i 70 pezzi arrivano dai lati e si montano seguendo lo scroll (GSAP
// ScrollTrigger), poi il meccanismo parte in loop. Il visitatore può ruotare
// il modello col mouse. Mobile/touch: modello già montato che ruota da solo e
// il meccanismo gira, senza catturare il tocco (così la pagina scorre libera).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

// Ordine di montaggio reale (fase 0 = base, fase 7 = farfalla).
function phaseOf(name) {
  const n = name || '';
  if (/^Farfalla/.test(n)) return 7;
  if (/^Telo/.test(n)) return 6;
  if (/^Parete_acrilico/.test(n)) return 5;
  if (/^(Hub_motore|Contenitore|Coperchio|Ganci|Alloggio|Sede_interruttore|Razza)/.test(n)) return 4;
  if (/^Anello/.test(n)) return 3;
  if (/^(Biella|Staffa_0)/.test(n)) return 2;
  if (/^(NEMA|Corona|Mozzo_corona|Albero)/.test(n)) return 1;
  return 0; // Base_unica, Telaio, Piano_cappuccio, Angolare, Staffa_muro, Supporto, Culle
}

// Fa partire TUTTE le clip del meccanismo (sono ~35 separate, una per pezzo:
// albero, corona, anelli, bielle, staffe, motore, telo...): vanno avviate tutte
// o si muove un solo pezzo. Riccardo ha ri-esportato l'animato come loop
// seamless (il telo, che prima scattava vistosamente al riavvio, ora si
// richiude perfetto), quindi LoopRepeat = il meccanismo gira in continuo.
function playAllClips(mixer, animations) {
  animations.forEach((clip) => {
    if (/^(Telo|Farfalla)/.test(clip.name)) return; // telo/farfalla rimossi dal visore
    const action = mixer.clipAction(clip);
    action.loop = THREE.LoopRepeat;
    action.play();
  });
}

// STRATEGIA: il visore mostra SOLO il MECCANISMO — niente telo, niente farfalla
// (in alto andranno foto/video reali dei quadri; il 3D sta più in basso). Rimuovo
// del tutto quei nodi (non solo nascosti) così l'inquadratura si stringe sul
// meccanismo. Sul resto: ombre reali (cast/receive), che rendono leggibile il moto.
// Il MOVIMENTO e il meccanismo non si toccano MAI (è un'opera fatta così).
function prepModel(obj) {
  const toRemove = [];
  obj.traverse((o) => {
    if (!o.isMesh) return;
    if (/^(Telo|Farfalla)/.test(o.name)) { toRemove.push(o); return; }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const isAcrylic = mats.some((m) => m && (m.name === 'M_acrilico' || m.transmission > 0));
    o.castShadow = !isAcrylic; // il vetro (transmission) non proietta ombra solida
    o.receiveShadow = true;
  });
  toRemove.forEach((o) => o.removeFromParent());
}

export async function initPaura(root) {
  // Guardia per-elemento: così si possono avere più visori nella stessa pagina
  // (es. i due meccanismi nel portfolio), non uno solo.
  if (root.dataset.pauraInit) return;
  root.dataset.pauraInit = '1';

  const canvas = root.querySelector('[data-paura-canvas]');
  const section = root.closest('[data-paura-section]') || root;
  const progressEl = root.querySelector('[data-paura-progress]');
  if (!canvas) return;

  // Percorsi dei GLB dal contenuto (data-attribute). PARTI vuoto = nessun
  // montaggio a scroll → modalità meccanismo semplice (gira + ruota).
  const PARTI = root.dataset.parti || '';
  const ANIMATO = root.dataset.animato || '/models/paura_animato.glb';

  const isTouch = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 860;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Su mobile lo scroll andava a scatti: due canvas WebGL con ombre soft (shadow
  // map 2048), antialias e pixel ratio 2-3 saturano la GPU del telefono. Su touch
  // togliamo ombre e antialias e abbassiamo la densita' pixel.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22; // più luminoso: i pezzi molto scuri (Clessidra) restavano piatti
  renderer.shadowMap.enabled = !isTouch;  // ombre reali su desktop; su mobile pesano troppo
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);

  // Ambiente per le pareti in acrilico (KHR_materials_transmission): senza
  // environment map il vetro apparirebbe nero. RoomEnvironment non pesa nulla.
  // Intensità BASSA: prima l'IBL faceva da "luce ovunque" e appiattiva tutto
  // (nessuna ombra, sembrava auto-illuminato). Serve giusto per il vetro.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.95; // riflessi ambientali: danno forma alle superfici nere metalliche (Clessidra)

  // Riempimento ambientale MINIMO: solo per non avere ombre nere piatte. Il
  // grosso della luce (e del modellato) viene dalle direzionali qui sotto.
  scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x8a8f99, 0.35));

  // KEY: luce direzionale forte e un po' radente, PROIETTA OMBRE. È questa che
  // "scolpisce" il movimento — creste in luce, avvallamenti in ombra, e le
  // ombre portate del meccanismo si muovono mentre gira.
  const key = new THREE.DirectionalLight(0xfff4e8, 3.2);
  key.position.set(3.2, 2.6, 2.2);
  key.castShadow = !isTouch;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.015;
  scene.add(key);
  scene.add(key.target);

  // FILL freddo, morbido, senza ombre: apre appena le ombre più chiuse.
  const fill = new THREE.DirectionalLight(0xbcd2ff, 0.55);
  fill.position.set(-4, 1.5, -2.5);
  scene.add(fill);

  // RIM/radente dal lato opposto: stacca il bordo del telo e accende le creste
  // di taglio (dove il movimento verticale si legge meglio).
  const rim = new THREE.DirectionalLight(0xffffff, 2.0);
  rim.position.set(-2.5, 0.8, -3.5);
  scene.add(rim);

  const draco = new DRACOLoader();
  draco.setDecoderPath('/draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  const load = (url, onProg) => new Promise((res, rej) => loader.load(url, res, onProg, rej));
  const setProgress = (p) => { if (progressEl) progressEl.textContent = `Caricamento ${Math.round(p * 100)}%`; };
  const done = () => { if (progressEl) progressEl.remove(); root.dataset.ready = '1'; };
  const fail = (e) => { console.error('[paura]', e); if (progressEl) progressEl.textContent = 'Anteprima 3D non disponibile'; root.dataset.error = '1'; };

  // Inquadra e centra il modello all'origine; ritorna il raggio.
  // Tiene conto dell'aspect ratio (verticale su mobile) così il modello ci sta.
  function frame(model) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    box.setFromObject(model);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = sphere.radius || 0.2;
    const vFov = (camera.fov * Math.PI) / 180;
    const aspect = camera.aspect || 1;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const dist = Math.max(r / Math.sin(vFov / 2), r / Math.sin(hFov / 2)) * 1.15;
    camera.position.set(dist * 0.55, dist * 0.32, dist * 0.9);
    camera.near = r / 100;
    camera.far = dist * 12;
    camera.lookAt(0, 0, 0); // il modello è centrato all'origine (serve al ramo touch senza OrbitControls)
    camera.updateProjectionMatrix();
    // Inquadra la shadow camera della key sul modello (centrato all'origine).
    const d = key.position.length();
    const sc = key.shadow.camera;
    sc.left = -r * 1.7; sc.right = r * 1.7; sc.top = r * 1.7; sc.bottom = -r * 1.7;
    sc.near = Math.max(0.01, d - r * 3);
    sc.far = d + r * 3;
    sc.updateProjectionMatrix();
    return r;
  }

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const clock = new THREE.Clock();

  // ---------- MECCANISMO SEMPLICE (un solo GLB, senza montaggio a scroll) ----------
  // Opere con un unico modello animato (es. Clessidra): niente esplosione, il
  // meccanismo gira in loop; col mouse lo ruoti (desktop) o autorotazione (touch).
  if (!PARTI) {
    try {
      const g = await load(ANIMATO, (e) => e.total && setProgress(e.loaded / e.total));
      const model = g.scene;
      model.scale.setScalar(0.001);
      prepModel(model);
      scene.add(model);
      resize();
      frame(model);
      done();
      let mixer = null;
      if (!reduced && g.animations && g.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        playAllClips(mixer, g.animations);
        const ts = parseFloat(root.dataset.timescale);
        mixer.timeScale = Number.isFinite(ts) ? ts : 1; // velocità reale del meccanismo
      }
      const desktop = !(isTouch || reduced);
      let controls = null;
      if (desktop) {
        controls = new OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controls.enableZoom = false; // la rotella scorre la pagina
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.0;
        controls.target.set(0, 0, 0);
        controls.update();
      }
      const spin = !desktop && !reduced ? 0.28 : 0; // touch: rotazione manuale, niente cattura del tocco
      let inView = true;
      new IntersectionObserver((es) => { inView = es[0].isIntersecting; }, { rootMargin: '120px' }).observe(section);
      resize();
      window.addEventListener('resize', resize);
      new ResizeObserver(resize).observe(canvas);
      let acc = 0; const minDt = isTouch ? 1 / 32 : 0; // ~30fps su mobile: scroll piu' fluido
      (function tick() {
        requestAnimationFrame(tick);
        if (!inView) return;
        acc += clock.getDelta();
        if (acc < minDt) return;
        if (controls) controls.update();
        else model.rotation.y += spin * acc;
        if (mixer) mixer.update(acc);
        renderer.render(scene, camera);
        acc = 0;
      })();
    } catch (e) {
      fail(e);
    }
    return;
  }

  // ---------- MOBILE / TOUCH / reduced-motion: montato + autorotazione ----------
  if (isTouch || reduced) {
    try {
      const g = await load(ANIMATO, (e) => e.total && setProgress(e.loaded / e.total));
      const model = g.scene;
      model.scale.setScalar(0.001);
      prepModel(model);
      scene.add(model);
      resize();
      frame(model);
      done();
      let mixer = null;
      if (!reduced && g.animations && g.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        playAllClips(mixer, g.animations);
      }
      resize();
      window.addEventListener('resize', resize);
      new ResizeObserver(resize).observe(canvas);
      const spin = reduced ? 0 : 0.28;
      // Pausa fuori vista + ~30fps: prima renderizzava sempre a 60fps anche fuori
      // schermo, causa dello scroll a scatti su mobile.
      let tInView = true;
      new IntersectionObserver((es) => { tInView = es[0].isIntersecting; }, { rootMargin: '120px' }).observe(section);
      let acc = 0; const minDt = 1 / 32;
      (function tick() {
        requestAnimationFrame(tick);
        if (!tInView) return;
        acc += clock.getDelta();
        if (acc < minDt) return;
        model.rotation.y += spin * acc;
        if (mixer) mixer.update(acc);
        renderer.render(scene, camera);
        acc = 0;
      })();
    } catch (e) {
      fail(e);
    }
    return;
  }

  // ---------- DESKTOP: montaggio guidato dallo scroll ----------
  try {
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = false; // la rotella serve a scorrere la pagina (= montare)
    controls.rotateSpeed = 0.85;
    controls.autoRotateSpeed = 1.4; // turntable a montaggio finito (attivato sotto)
    controls.target.set(0, 0, 0);

    const partiG = await load(PARTI, (e) => e.total && setProgress(0.55 * (e.loaded / e.total)));
    const parti = partiG.scene;
    parti.scale.setScalar(0.001);
    prepModel(parti);
    scene.add(parti);
    resize();
    const r = frame(parti);
    parti.updateWorldMatrix(true, true);

    // Esplodi: ogni pezzo parte FUORI campo, spinto nel PIANO DELLO SCHERMO (assi
    // right/up della camera) a grande raggio. Cosi' esce sempre da un bordo e mai
    // "verso" l'obiettivo (dove, sull'asse ottico, ricadrebbe al centro
    // dell'inquadratura pur essendo lontano dall'origine).
    camera.updateMatrixWorld();
    const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const pieces = [];
    let pi = 0;
    parti.traverse((o) => {
      if (!o.isMesh) return;
      const finalLocal = o.position.clone();
      const worldPos = o.getWorldPosition(new THREE.Vector3());
      const sx = worldPos.dot(camRight);
      const sy = worldPos.dot(camUp);
      // Angolo di uscita: dalla posizione finale proiettata sullo schermo (il pezzo
      // esce verso dove "appartiene"); se troppo centrato, golden angle per spargerli.
      const ang = Math.hypot(sx, sy) < r * 0.18 ? pi * 2.399963 : Math.atan2(sy, sx);
      const R = r * (3.6 + Math.random() * 1.5);
      const explodedWorld = camRight
        .clone()
        .multiplyScalar(Math.cos(ang) * R)
        .add(camUp.clone().multiplyScalar(Math.sin(ang) * R));
      const explodedLocal = o.parent.worldToLocal(explodedWorld.clone());
      pieces.push({ mesh: o, finalLocal, explodedLocal, phase: phaseOf(o.name) });
      o.position.copy(explodedLocal);
      pi++;
    });

    // Timeline: interpola ogni pezzo dall'esploso al finale, con stagger per fase.
    const tl = gsap.timeline({ paused: true });
    const GAP = 0.7;
    pieces.forEach((p) => {
      const at = p.phase * GAP + Math.random() * 0.12;
      tl.fromTo(
        p.mesh.position,
        { x: p.explodedLocal.x, y: p.explodedLocal.y, z: p.explodedLocal.z },
        { x: p.finalLocal.x, y: p.finalLocal.y, z: p.finalLocal.z, duration: 1.0, ease: 'power3.out' },
        at
      );
    });

    // In background carico il modello animato per il meccanismo che gira.
    let animato = null;
    let mixer = null;
    load(ANIMATO, (e) => e.total && setProgress(0.55 + 0.45 * (e.loaded / e.total)))
      .then((g) => {
        animato = g.scene;
        animato.scale.setScalar(0.001);
        prepModel(animato);
        const box = new THREE.Box3().setFromObject(animato);
        animato.position.sub(box.getCenter(new THREE.Vector3()));
        animato.visible = false;
        scene.add(animato);
        if (g.animations && g.animations.length) {
          mixer = new THREE.AnimationMixer(animato);
          playAllClips(mixer, g.animations);
        }
        done();
      })
      .catch(fail);

    // A montaggio completo mostra il modello animato (crossfade istantaneo:
    // identico da montato), fa partire il meccanismo (mixer, gia' in play) e
    // avvia il turntable: la figura inizia a girare da sola.
    let assembled = false;
    const setAssembled = (on) => {
      if (on === assembled || !animato) return;
      assembled = on;
      animato.visible = on;
      parti.visible = !on;
      controls.autoRotate = on;
    };

    gsap.registerPlugin(ScrollTrigger);
    // Pagina prodotto: lo stage è "sticky" (resta in vista) mentre scorri la
    // sezione alta, così puoi restare a guardare il montaggio con calma. Nessun
    // pin: niente salti di layout. Il montaggio si completa entro il 70% dello
    // scroll; l'ultimo 30% resta sticky con la figura montata che gira e il
    // meccanismo in moto (basta fermarsi lì per guardarla girare).
    ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.6,
      onUpdate: (self) => {
        tl.progress(Math.min(self.progress / 0.7, 1));
        setAssembled(self.progress >= 0.7);
      },
    });

    // Renderizza solo quando la sezione è (quasi) in vista: niente spreco fuori schermo.
    let inView = true;
    new IntersectionObserver((es) => { inView = es[0].isIntersecting; }, { rootMargin: '120px' }).observe(section);

    resize();
    window.addEventListener('resize', () => {
      resize();
      ScrollTrigger.refresh();
    });
    new ResizeObserver(resize).observe(canvas);
    (function tick() {
      requestAnimationFrame(tick);
      if (!inView) return;
      const dt = clock.getDelta();
      controls.update();
      if (assembled && mixer) mixer.update(dt);
      renderer.render(scene, camera);
    })();
  } catch (e) {
    fail(e);
  }
}
