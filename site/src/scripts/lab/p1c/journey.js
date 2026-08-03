/* ============================================================
   lab/p1c — IL TEATRO (variante Emergence)
   Scroll verticale (Lenis + ScrollTrigger, easing firma
   cubic-bezier(0.32,0.72,0,1)) attraverso cinque scene:
   soglia chiara → VERTIGINE (blu notte, schegge) → interludio
   chiaro → ABBANDONO (blu notte, lastre) → sigillo.

   - Il campo colore è UNO solo (il background del root) e viene
     scrubbato lungo le bande .pc-fade; le scene chiare dissolvono
     in uscita/entrata così il cut-out multiply non incontra mai
     un fondo scuro.
   - La ricomposizione riusa il motore approvato di p1b
     (../p1b/recompose.js), stessi seed e pattern: niente
     duplicazione, nessun Math.random non seedato.
   - prefers-reduced-motion → sequenza statica curata (solo swap
     alta risoluzione via IntersectionObserver).
   - niente WebGL2 → .pc-nogl: opere già composte, resto attivo.
   ============================================================ */

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';
import { createRecomposer, webglAvailable } from '../p1b/recompose.js';

const root = document.querySelector('.pc');
if (root) init(root);

function init(root) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = Math.min(innerWidth, innerHeight) < 720 || innerWidth < 720;
  const hasGL = webglAvailable();

  const sections = {
    soglia: root.querySelector('.pc-soglia'),
    vert: root.querySelector('.pc-vert'),
    interludio: root.querySelector('.pc-interludio'),
    abb: root.querySelector('.pc-abb'),
    sigillo: root.querySelector('.pc-sigillo'),
  };

  const panels = {};
  ['vert', 'abb'].forEach((key) => {
    const sec = sections[key];
    panels[key] = {
      sec,
      link: sec.querySelector('.pc-opera-link'),
      frame: sec.querySelector('.pc-frame'),
      art: sec.querySelector('.pc-art'),
      canvas: sec.querySelector('.pc-scatter'),
    };
  });

  /* ---------- ricomposizione: stesse config approvate di p1b ---------- */
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
    if (!hasGL || recs[key]) return;
    const p = panels[key];
    if (!p.canvas || !p.frame) return;
    const c = RECONF[key];
    recs[key] = createRecomposer({
      canvas: p.canvas,
      frame: p.frame,
      src: c.src,
      aspect: c.aspect,
      seed: c.seed,
      pattern: c.pattern,
    });
    if (recs[key]) recs[key].setProgress(recProg[key].v);
  }

  function swapFull(key) {
    const p = panels[key];
    if (!p || p.swapped) return;
    p.swapped = true;
    const full = p.art && p.art.dataset.full;
    if (!full) return;
    const pre = new Image();
    pre.onload = () => {
      p.art.src = full;
    };
    pre.src = full;
  }

  function apply(key) {
    const v = recProg[key].v;
    if (recs[key]) recs[key].setProgress(v);
    const p = panels[key];
    const composed = v > 0.995;
    if (composed !== p.composed) {
      p.composed = composed;
      p.sec.classList.toggle('is-composed', composed);
    }
  }

  addEventListener('pagehide', () => {
    Object.keys(recs).forEach((k) => {
      if (recs[k]) recs[k].dispose();
      recs[k] = null;
    });
  });

  /* ---------- fps meter (?debug=1) ---------- */
  if (new URLSearchParams(location.search).get('debug') === '1') {
    // stato interno ispezionabile dalla console
    window.__pc = { recProg, recs, panels };
    const box = document.createElement('div');
    box.className = 'pc-fps';
    box.textContent = 'fps --.- · med --.-';
    document.body.appendChild(box);
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

  /* ---------- reduced motion: sequenza statica curata ---------- */
  if (reduce) {
    root.classList.add('pc-static');
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const key = e.target === sections.vert ? 'vert' : 'abb';
          swapFull(key);
          io.unobserve(e.target);
        }),
      { rootMargin: '260px' }
    );
    io.observe(sections.vert);
    io.observe(sections.abb);
    return;
  }

  /* ---------- journey ---------- */

  gsap.registerPlugin(ScrollTrigger, CustomEase);
  CustomEase.create('brama', '0.32,0.72,0,1');

  root.classList.add('pc-journey');
  if (!hasGL) root.classList.add('pc-nogl');

  /* ---------- opere: pin + ricomposizione a scrub ----------
     NB: i pin vanno creati PRIMA di ogni altro ScrollTrigger:
     i trigger creati dopo un pin tengono conto del suo spacer
     (altrimenti tutte le posizioni a valle risultano sbagliate) */

  const pinsST = {};

  ['vert', 'abb'].forEach((key) => {
    const sec = sections[key];

    if (!hasGL) return; // niente pin: l'opera (già composta) scorre nel campo scuro

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      onUpdate: () => apply(key),
      scrollTrigger: {
        trigger: sec,
        start: 'top top',
        end: '+=165%',
        pin: true,
        scrub: 0.75,
        anticipatePin: 1,
      },
    });
    tl.to(recProg[key], { v: 1, duration: 0.7 }, 0.08);
    tl.to({}, { duration: 0.22 }, 0.78); // respiro finale a opera composta
    pinsST[key] = tl.scrollTrigger;
  });

  // preload: motore 3D + immagine piena poco prima dell'arrivo
  ['vert', 'abb'].forEach((key) => {
    ScrollTrigger.create({
      trigger: sections[key],
      start: 'top 140%',
      once: true,
      onEnter: () => {
        ensureRec(key);
        swapFull(key);
      },
    });
  });

  /* campo colore unico: scrub lungo le bande .pc-fade
     chiaro → notte → chiaro2 → notte → chiaro */
  const FIELDS = [
    ['#e8ecf4', '#050a1a'],
    ['#050a1a', '#dfe6f2'],
    ['#dfe6f2', '#050a1a'],
    ['#050a1a', '#e8ecf4'],
  ];
  root.querySelectorAll('.pc-fade').forEach((el, i) => {
    const [a, b] = FIELDS[i] || FIELDS[FIELDS.length - 1];
    gsap.fromTo(
      root,
      { backgroundColor: a },
      {
        backgroundColor: b,
        ease: 'none',
        immediateRender: false,
        // incatenato alle dissolvenze di scena: la scenografia esce
        // (bottom 30%), POI il campo cambia, POI la scena dopo entra
        scrollTrigger: { trigger: el, start: 'top 30%', end: 'bottom 55%', scrub: 0.4 },
      }
    );
  });

  /* dissolvenze di scena: le scenografie chiare spariscono prima
     che il campo scurisca (e riappaiono dopo che è tornato chiaro) */
  gsap.to(sections.soglia, {
    autoAlpha: 0,
    ease: 'brama',
    scrollTrigger: { trigger: sections.soglia, start: 'bottom 78%', end: 'bottom 30%', scrub: 0.4 },
  });
  gsap.fromTo(
    sections.interludio,
    { autoAlpha: 0 },
    {
      autoAlpha: 1,
      ease: 'brama',
      immediateRender: true,
      scrollTrigger: { trigger: sections.interludio, start: 'top 55%', end: 'top 16%', scrub: 0.4 },
    }
  );
  gsap.to(sections.interludio, {
    autoAlpha: 0,
    ease: 'brama',
    scrollTrigger: { trigger: sections.interludio, start: 'bottom 74%', end: 'bottom 30%', scrub: 0.4 },
  });
  gsap.fromTo(
    sections.sigillo,
    { autoAlpha: 0 },
    {
      autoAlpha: 1,
      ease: 'brama',
      immediateRender: true,
      scrollTrigger: { trigger: sections.sigillo, start: 'top 70%', end: 'top 28%', scrub: 0.4 },
    }
  );

  /* parallasse leggera sui piani delle scene chiare */
  root.querySelectorAll('.pc-scene').forEach((sec) => {
    sec.querySelectorAll('[data-plx]').forEach((el) => {
      const d = parseFloat(el.dataset.plx) || 0;
      if (!d) return;
      gsap.fromTo(
        el,
        { y: d },
        {
          y: -d,
          ease: 'none',
          scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
        }
      );
    });
  });

  /* la micro-freccia svanisce appena si parte */
  gsap.to('.pc-arrow', {
    autoAlpha: 0,
    ease: 'none',
    scrollTrigger: { trigger: sections.soglia, start: 'top top', end: '28% top', scrub: true },
  });

  /* ---------- lenis + tastiera ---------- */

  const lenis = new Lenis({ autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // focus da tastiera sulle opere-link: il viaggio raggiunge l'opera composta
  ['vert', 'abb'].forEach((key) => {
    panels[key].link.addEventListener('focus', () => {
      const st = pinsST[key];
      if (!st) return;
      const target = st.start + (st.end - st.start) * 0.9;
      if (Math.abs(window.scrollY - target) > innerHeight * 0.5) {
        lenis.scrollTo(target, { duration: 0.9 });
      }
    });
  });

  /* ---------- resize ---------- */

  let rsTimer = null;
  let lastW = innerWidth;
  let lastH = innerHeight;
  addEventListener('resize', () => {
    clearTimeout(rsTimer);
    rsTimer = setTimeout(() => {
      // ignora i micro-resize della barra URL su iOS
      if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 160) return;
      lastW = innerWidth;
      lastH = innerHeight;
      Object.values(recs).forEach((r) => r && r.resize());
      ScrollTrigger.refresh();
    }, 250);
  });
}
