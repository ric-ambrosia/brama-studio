/* ============================================================
   lab/p1b — IL TRATTO · BLU (variante P1-BIS)
   Base: il "filo 2D" di P1 (Lenis + un unico timeline GSAP scrub
   che muove camera 2D simulata + filo SVG disegnato su scroll).
   Variazioni:
   1. palette brand: blu notte / azzurro / rosso — niente fasi carta;
   2. NIENTE torcia / rivelazione dal buio: opere piene e vivide;
   3. interazione firma: le opere partono SCOMPOSTE e si ricompongono
      su scroll (scrub reversibile) via three.js → recompose.js.
   Static-first: con prefers-reduced-motion (o senza WebGL2 per la
   sola parte 3D) le opere appaiono già composte.
   ============================================================ */

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';
import { createRecomposer, webglAvailable } from './recompose.js';

const root = document.querySelector('.p1b');
if (root) init(root);

function init(root) {
  gsap.registerPlugin(ScrollTrigger, CustomEase);
  CustomEase.create('brama', '0.32,0.72,0,1');

  const stage = root.querySelector('.p1b-stage');
  const world = root.querySelector('.p1b-world');
  const svg = root.querySelector('.p1b-thread');
  const deco = svg.querySelector('.p1b-deco');
  const mainPath = svg.querySelector('.p1b-main');
  const tip = svg.querySelector('.p1b-tip');
  const spacer = root.querySelector('.p1b-spacer');
  const way = root.querySelector('.p1b-way');
  const panels = {
    vert: root.querySelector('.p1b-vert .p1b-panel'),
    abb: root.querySelector('.p1b-abb .p1b-panel'),
  };
  const plateImgs = [
    root.querySelector('.p1b-t1a img'),
    root.querySelector('.p1b-t2a img'),
  ];

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = Math.min(innerWidth, innerHeight) < 720 || innerWidth < 720;
  const hasGL = webglAvailable();

  /* ---------- ricomposizione: config per opera ---------- */
  // frammenti: desktop ~126 schegge / ~66 lastre · mobile ~60 / ~26
  const RECONF = {
    vert: {
      src: '/images/thumbs/Vertigine-1200.jpg',
      aspect: 2427 / 1612,
      seed: 20251,
      pattern: isMobile
        ? { type: 'shards', cols: 6, rows: 5, center: [0.5, 0.52], gamma: 2.1, redRatio: 0.13 }
        : { type: 'shards', cols: 9, rows: 7, center: [0.5, 0.52], gamma: 2.1, redRatio: 0.13 },
    },
    abb: {
      src: '/images/thumbs/Abbandono-600.jpg',
      aspect: 785 / 1600,
      seed: 4842,
      pattern: isMobile
        ? { type: 'slabs', rows: 13, minSeg: 1, maxSeg: 3, redRatio: 0.09 }
        : { type: 'slabs', rows: 22, minSeg: 2, maxSeg: 4, redRatio: 0.09 },
    },
  };
  const recs = { vert: null, abb: null };
  const recProg = { vert: { v: 0 }, abb: { v: 0 } };

  function ensureRec(key) {
    if (!hasGL || recs[key] || !panels[key]) return;
    const panel = panels[key];
    const canvas = panel.querySelector('.p1b-scatter');
    const frame = panel.querySelector('.p1b-frame');
    if (!canvas || !frame) return;
    const c = RECONF[key];
    recs[key] = createRecomposer({
      canvas,
      frame,
      src: c.src,
      aspect: c.aspect,
      seed: c.seed,
      pattern: c.pattern,
    });
    if (recs[key]) recs[key].setProgress(recProg[key].v);
  }

  if (!hasGL) root.classList.add('p1b-nogl');

  addEventListener('pagehide', () => {
    Object.keys(recs).forEach((k) => {
      if (recs[k]) recs[k].dispose();
      recs[k] = null;
    });
  });

  function swapFull(panel) {
    if (!panel || panel.dataset.swapped) return;
    panel.dataset.swapped = '1';
    const img = panel.querySelector('.p1b-art');
    const full = img && img.dataset.full;
    if (!full) return;
    const pre = new Image();
    pre.onload = () => {
      img.src = full;
    };
    pre.src = full;
  }

  /* ---------- fps meter (?debug=1) — ereditato da P1 ---------- */
  if (new URLSearchParams(location.search).get('debug') === '1') {
    const box = document.createElement('div');
    box.className = 'p1b-fps';
    box.textContent = 'fps --.- · med --.-';
    root.appendChild(box);
    let frames = 0;
    let last = performance.now();
    let totalFrames = 0;
    const t0 = last;
    function fpsLoop(now) {
      frames += 1;
      totalFrames += 1;
      if (now - last >= 500) {
        const cur = (frames * 1000) / (now - last);
        const avg = (totalFrames * 1000) / (now - t0);
        box.textContent = `fps ${cur.toFixed(1)} · med ${avg.toFixed(1)}`;
        frames = 0;
        last = now;
      }
      requestAnimationFrame(fpsLoop);
    }
    requestAnimationFrame(fpsLoop);
  }

  /* ---------- modalità statica (reduced-motion) ---------- */
  if (reduce) {
    // le opere appaiono già composte (il CSS mostra le <img>);
    // qui solo lo swap alla risoluzione piena quando entrano in vista
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            swapFull(e.target);
            e.target.classList.add('is-live', 'is-composed');
            io.unobserve(e.target);
          }
        }),
      { rootMargin: '240px' }
    );
    Object.values(panels).forEach((p) => p && io.observe(p));
    return;
  }

  /* ============================================================
     IL VIAGGIO — coordinate mondo in unità viewport (x vw, y vh)
     ============================================================ */

  root.classList.add('is-journey');

  const DUR = 10.4;

  // waypoint del filo: [x, y, tempo a cui la punta arriva]
  const WPS = [
    [52, 60, 0.3], [74, 70, 0.7], [98, 84, 1.1], [122, 97, 1.5],
    [136, 106, 1.8], [146, 101, 1.98], [150, 108, 2.12], [143, 113, 2.26], [139, 107, 2.38],
    [163, 128, 2.62], [185, 151, 2.85],
    [211, 177, 3.15], [234, 199, 3.42], [252, 214, 3.65],
    [259, 236, 5.6], [256, 268, 5.9],
    [247, 300, 6.18], [239, 331, 6.45],
    [221, 369, 6.85], [203, 404, 7.2],
    [181, 441, 7.62], [167, 462, 7.9], [158, 479, 8.12],
    [147, 506, 9.58], [124, 524, 9.82],
    [98, 537, 10.02], [82, 542, 10.14],
    [72, 546, 10.24], [76, 550, 10.3], [71, 553, 10.34], [66.5, 549, 10.38], [69, 545.5, 10.4],
  ];

  // keyframe camera: {t, x, y, r (deg), z, e (ease)}
  const CAMS = [
    { t: 0.0, x: 50, y: 50, r: 0, z: 1 },
    { t: 0.35, x: 50, y: 50, r: 0, z: 1 },
    { t: 1.6, x: 135, y: 105, r: -4, z: 1.12, e: 'brama' },
    { t: 2.25, x: 145, y: 107, r: -5, z: 1.15, e: 'power1.inOut' },
    { t: 2.9, x: 185, y: 152, r: -8, z: 1.18, e: 'power1.inOut' },
    { t: 3.7, x: 252, y: 215, r: 0, z: 0.98, e: 'power1.inOut' },
    { t: 4.6, x: 252, y: 216, r: 0, z: 1.3, e: 'brama' },
    { t: 5.3, x: 252, y: 217, r: 0, z: 1.34, e: 'none' },
    { t: 5.9, x: 256, y: 262, r: 2, z: 1.04, e: 'power1.in' },
    { t: 6.55, x: 240, y: 331, r: 6, z: 0.94, e: 'power1.inOut' },
    { t: 7.3, x: 202, y: 404, r: 10, z: 0.9, e: 'power1.inOut' },
    { t: 8.2, x: 158, y: 480, r: 0, z: 1.0, e: 'power1.inOut' },
    { t: 8.95, x: 158, y: 481, r: 0, z: 1.22, e: 'brama' },
    { t: 9.45, x: 158, y: 482, r: 0, z: 1.25, e: 'none' },
    { t: 9.95, x: 120, y: 522, r: -3, z: 1.05, e: 'power1.inOut' },
    { t: 10.4, x: 68, y: 545, r: 0, z: 1.12, e: 'brama' },
  ];

  // respiro cromatico blu notte ↔ blu profondo: [tInizio, tFine, arrivo (1 = territorio)]
  const DEEP = [
    [0.6, 1.25, 1],
    [3.25, 3.85, 0],
    [5.55, 6.15, 1],
    [7.95, 8.5, 0],
    [9.55, 10.05, 1],
  ];

  // ramificazioni del filo (red: scheggia rossa)
  const BRANCHES = [
    { pts: [[122, 97], [114, 100], [112, 112]], w: 2.2, t: [1.35, 1.9] },
    { pts: [[112, 112], [108, 109], [104, 116]], w: 1.7, t: [1.55, 2.05] },
    { pts: [[146, 101], [153, 95], [158, 99]], w: 2.2, t: [2.0, 2.5], red: true },
    { pts: [[185, 151], [192, 160], [189, 170]], w: 2.2, t: [2.75, 3.2] },
    { pts: [[221, 369], [228, 380], [226, 393]], w: 2.2, t: [6.7, 7.2], red: true },
    { pts: [[203, 404], [195, 411], [196, 422]], w: 2.0, t: [7.0, 7.5] },
    { pts: [[124, 524], [116, 530], [118, 538]], w: 1.7, t: [9.85, 10.15], red: true },
  ];

  // ciuffi di tratteggio azzurri
  const HATCHES = [
    { c: [116, 90], n: 7, ang: -35, t: [1.15, 1.7] },
    { c: [152, 121], n: 6, ang: -28, t: [1.7, 2.3] },
    { c: [197, 163], n: 9, ang: -42, t: [2.7, 3.2] },
    { c: [226, 190], n: 8, ang: -50, t: [3.0, 3.5] },
    { c: [233, 350], n: 5, ang: 78, t: [6.5, 7.0] },
    { c: [212, 384], n: 6, ang: 82, t: [6.85, 7.35] },
    { c: [187, 428], n: 5, ang: 75, t: [7.3, 7.8] },
    { c: [90, 540], n: 4, ang: -15, t: [9.95, 10.3] },
  ];

  // finestre in cui i pannelli sono "vivi"
  const RANGES = { vert: [3.3, 5.95], abb: [7.6, 9.75] };

  // finestre di ricomposizione (scrub): [inizio, fine]
  const RECWIN = { vert: [3.45, 4.8], abb: [7.75, 8.95] };

  // preload: motori 3D e immagini piene poco prima dell'arrivo
  const PRELOADS = [
    { t: 0.7, done: false, fn: () => plateImgs[0] && (plateImgs[0].loading = 'eager') },
    { t: 2.4, done: false, fn: () => { ensureRec('vert'); swapFull(panels.vert); } },
    { t: 5.6, done: false, fn: () => plateImgs[1] && (plateImgs[1].loading = 'eager') },
    { t: 6.7, done: false, fn: () => { ensureRec('abb'); swapFull(panels.abb); } },
  ];

  const WAYPOINTS_TEXT = [
    [0, 'il tratto · blu · soglia'],
    [0.9, 'territorio i · il segno'],
    [3.4, 'opera 01 · vertigine · la pioggia di schegge'],
    [5.85, 'territorio ii · la caduta'],
    [7.9, 'opera 02 · abbandono · le lastre'],
    [9.6, 'la firma'],
  ];

  // blu notte ↔ blu profondo; filo azzurro che si accende nei territori
  const bgMix = gsap.utils.interpolate('#050a1a', '#0a1430');
  const inkMix = gsap.utils.interpolate('#5ea0ec', '#9cc8ff');

  const cam = { x: 50, y: 50, r: 0, z: 1 };
  const thread = { len: 0 };
  const env = { deep: 0 };

  let vw = innerWidth;
  let vh = innerHeight;
  let totalLen = 0;
  let wpLens = [];
  let tl = null;
  const rnd = mulberry32(42);
  const branchPaths = [];
  const hatchGroups = [];

  const ux = () => vw / 100;
  const uy = () => vh / 100;
  const px = (p) => [p[0] * ux(), p[1] * uy()];

  /* ---------- costruzione geometria ---------- */

  function layoutStations() {
    root.querySelectorAll('.p1b-station').forEach((st) => {
      st.style.left = `${(+st.dataset.wx * ux()).toFixed(1)}px`;
      st.style.top = `${(+st.dataset.wy * uy()).toFixed(1)}px`;
    });
  }

  function buildThread() {
    const minX = -0.6 * vw;
    const minY = -0.3 * vh;
    const w = 3.9 * vw;
    const h = 6.9 * vh;
    svg.style.left = `${minX}px`;
    svg.style.top = `${minY}px`;
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`);

    // Catmull-Rom → Bézier, lunghezze cumulative a ogni waypoint
    const pts = WPS.map(px);
    const meas = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    meas.setAttribute('opacity', '0');
    svg.appendChild(meas);
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    wpLens = [0];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
      meas.setAttribute('d', d);
      wpLens.push(meas.getTotalLength());
    }
    svg.removeChild(meas);
    mainPath.setAttribute('d', d);
    totalLen = wpLens[wpLens.length - 1];
    mainPath.style.strokeDasharray = `${totalLen}`;
    mainPath.style.strokeDashoffset = `${totalLen}`;

    // decorazioni: rami (alcuni rossi) + tratteggi azzurri
    deco.innerHTML = '';
    branchPaths.length = 0;
    hatchGroups.length = 0;
    const NS = 'http://www.w3.org/2000/svg';
    BRANCHES.forEach((b) => {
      const [a, c, e] = b.pts.map(px);
      const p = document.createElementNS(NS, 'path');
      p.setAttribute(
        'd',
        `M ${a[0].toFixed(1)} ${a[1].toFixed(1)} Q ${c[0].toFixed(1)} ${c[1].toFixed(1)} ${e[0].toFixed(1)} ${e[1].toFixed(1)}`
      );
      p.setAttribute('stroke-width', b.w);
      p.setAttribute('opacity', '0.85');
      if (b.red) p.setAttribute('stroke', '#c8281c');
      deco.appendChild(p);
      const L = p.getTotalLength();
      p.style.strokeDasharray = `${L}`;
      p.style.strokeDashoffset = `${L}`;
      branchPaths.push({ el: p, len: L, t: b.t });
    });
    HATCHES.forEach((hh) => {
      const g = document.createElementNS(NS, 'g');
      const [cx, cy] = px(hh.c);
      const rad = (hh.ang * Math.PI) / 180;
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);
      let dd = '';
      for (let i = 0; i < hh.n; i++) {
        const off = (i - hh.n / 2) * (9 + rnd() * 6);
        const L = 26 + rnd() * 34;
        const jx = (rnd() - 0.5) * 8;
        const jy = (rnd() - 0.5) * 8;
        const x0 = cx - dy * off - (dx * L) / 2 + jx;
        const y0 = cy + dx * off - (dy * L) / 2 + jy;
        dd += `M ${x0.toFixed(1)} ${y0.toFixed(1)} l ${(dx * L).toFixed(1)} ${(dy * L).toFixed(1)} `;
      }
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', dd.trim());
      p.setAttribute('stroke-width', '1.6');
      p.setAttribute('opacity', '0');
      g.appendChild(p);
      deco.appendChild(g);
      hatchGroups.push({ el: p, t: hh.t });
    });
  }

  /* ---------- timeline ---------- */

  function buildTimeline() {
    if (tl) {
      if (tl.scrollTrigger) tl.scrollTrigger.kill();
      tl.kill();
      tl = null;
    }

    spacer.style.height = `${Math.round((DUR + 1) * vh)}px`;

    tl = gsap.timeline({
      defaults: { ease: 'none' },
      onUpdate: applyFrame,
      scrollTrigger: {
        trigger: spacer,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.85,
      },
    });

    // camera
    for (let i = 1; i < CAMS.length; i++) {
      const k = CAMS[i];
      const prev = CAMS[i - 1];
      tl.to(
        cam,
        { x: k.x, y: k.y, r: k.r, z: k.z, duration: k.t - prev.t, ease: k.e || 'none' },
        prev.t
      );
    }

    // filo
    for (let i = 1; i < WPS.length; i++) {
      tl.to(
        thread,
        { len: wpLens[i], duration: WPS[i][2] - WPS[i - 1][2] },
        WPS[i - 1][2]
      );
    }

    // respiro cromatico
    DEEP.forEach(([a, b, v]) => tl.to(env, { deep: v, duration: b - a, ease: 'sine.inOut' }, a));

    // hero si dissolve quando si parte
    tl.to('.p1b-hero-inner', { autoAlpha: 0, y: -40, duration: 0.5, ease: 'power1.in' }, 0.45);

    // RICOMPOSIZIONE — scrub lineare, l'easing per-frammento vive nel motore
    tl.to(recProg.vert, { v: 1, duration: RECWIN.vert[1] - RECWIN.vert[0] }, RECWIN.vert[0]);
    tl.to(recProg.abb, { v: 1, duration: RECWIN.abb[1] - RECWIN.abb[0] }, RECWIN.abb[0]);

    // targhette: appaiono quando il quadro si è quasi posato
    tl.fromTo(
      '.p1b-vert .p1b-label',
      { autoAlpha: 0, y: 26 },
      { autoAlpha: 1, y: 0, duration: 0.65, ease: 'brama' },
      4.55
    );
    tl.fromTo(
      '.p1b-abb .p1b-label',
      { autoAlpha: 0, y: 26 },
      { autoAlpha: 1, y: 0, duration: 0.6, ease: 'brama' },
      8.75
    );

    // rami e tratteggi si disegnano al passaggio
    branchPaths.forEach((b) =>
      tl.to(b.el, { strokeDashoffset: 0, duration: b.t[1] - b.t[0] }, b.t[0])
    );
    hatchGroups.forEach((h) =>
      tl.to(h.el, { opacity: 0.5, duration: h.t[1] - h.t[0] }, h.t[0])
    );

    // la firma si scrive
    tl.fromTo('.p1b-sig', { '--sig': '-15%' }, { '--sig': '115%', duration: 0.55, ease: 'brama' }, 9.85);
    tl.fromTo(
      '.p1b-fine-inner > :not(.p1b-sig)',
      { autoAlpha: 0, y: 18 },
      { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.08, ease: 'brama' },
      10.05
    );
  }

  /* ---------- frame ---------- */

  let wayText = '';

  function applyFrame() {
    const t = tl ? tl.time() : 0;

    world.style.transform =
      `translate3d(${(vw / 2).toFixed(1)}px, ${(vh / 2).toFixed(1)}px, 0) ` +
      `scale(${cam.z.toFixed(4)}) rotate(${cam.r.toFixed(2)}deg) ` +
      `translate3d(${(-cam.x * ux()).toFixed(1)}px, ${(-cam.y * uy()).toFixed(1)}px, 0)`;

    mainPath.style.strokeDashoffset = `${Math.max(totalLen - thread.len, 0)}`;
    if (thread.len > 1 && thread.len < totalLen - 1) {
      const pt = mainPath.getPointAtLength(thread.len);
      tip.setAttribute('cx', pt.x.toFixed(1));
      tip.setAttribute('cy', pt.y.toFixed(1));
      tip.setAttribute('opacity', '1');
    } else {
      tip.setAttribute('opacity', '0');
    }

    stage.style.backgroundColor = bgMix(env.deep);
    svg.style.color = inkMix(env.deep);

    // ricomposizione: spingi il progress ai motori + swap canvas↔img
    for (const key of Object.keys(recProg)) {
      const v = recProg[key].v;
      if (recs[key]) recs[key].setProgress(v);
      const panel = panels[key];
      if (!panel) continue;
      const composed = v > 0.995;
      if (composed !== panel._composed) {
        panel._composed = composed;
        panel.classList.toggle('is-composed', composed);
      }
    }

    // pannelli vivi
    for (const key of Object.keys(RANGES)) {
      const [a, b] = RANGES[key];
      const panel = panels[key];
      const on = t >= a && t <= b;
      if (on !== panel._on) {
        panel._on = on;
        panel.classList.toggle('is-live', on);
        if (on) {
          ensureRec(key);
          swapFull(panel);
        }
      }
    }

    PRELOADS.forEach((p) => {
      if (!p.done && t >= p.t) {
        p.done = true;
        p.fn();
      }
    });

    let txt = WAYPOINTS_TEXT[0][1];
    for (const [tt, s] of WAYPOINTS_TEXT) if (t >= tt) txt = s;
    if (txt !== wayText) {
      wayText = txt;
      way.textContent = txt;
    }
  }

  /* ---------- lenis + tastiera ---------- */

  const lenis = new Lenis({ autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // i CTA sono link veri: al focus il viaggio li raggiunge
  root.querySelectorAll('[data-focus-t]').forEach((a) => {
    a.addEventListener('focus', () => {
      const t = parseFloat(a.dataset.focusT);
      const target = t * vh;
      if (Math.abs(window.scrollY - target) > vh * 0.6) {
        lenis.scrollTo(target, { duration: 0.9 });
      }
    });
  });
  const restart = root.querySelector('.p1b-restart');
  if (restart) {
    restart.addEventListener('click', (e) => {
      e.preventDefault();
      lenis.scrollTo(0, { duration: 2.6 });
    });
  }

  /* ---------- build + resize ---------- */

  function build() {
    vw = innerWidth;
    vh = innerHeight;
    layoutStations();
    buildThread();
    buildTimeline();
    ScrollTrigger.refresh();
    Object.values(recs).forEach((r) => r && r.resize());
    applyFrame();
  }
  build();

  let rsTimer = null;
  let lastW = vw;
  let lastH = vh;
  addEventListener('resize', () => {
    clearTimeout(rsTimer);
    rsTimer = setTimeout(() => {
      // ignora i micro-resize della barra URL su iOS
      if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 160) return;
      lastW = innerWidth;
      lastH = innerHeight;
      build();
    }, 250);
  });
}

/* PRNG deterministico per i tratteggi */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
