/* ============================================================
   IL VIAGGIO · regia dello scroll
   Lenis + GSAP ScrollTrigger (easing firma 0.32,0.72,0,1).

   - Un solo campo colore: il background del root, scrubbato
     lungo i respiri .vg-fade (data-from → data-to). Le scene
     sono trasparenti in journey e dipingono da sé senza JS.
   - Le opere si ricompongono col motore approvato lab/p1b
     (pattern e seed deterministici letti da data-rec).
   - PERFORMANCE: mai più di MAX_LIVE (2) canvas WebGL vivi —
     i recomposer nascono/muoiono on-enter/on-leave con trigger
     di prossimità + coda LRU.
   - prefers-reduced-motion → versione statica curata (solo swap
     dell'immagine piena via IntersectionObserver).
   - niente WebGL2 → .vg-nogl: opere già composte, resto attivo.
   ============================================================ */

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';
import { createRecomposer, webglAvailable } from '../lab/p1b/recompose.js';

const MAX_LIVE = 2;

const root = document.querySelector('.vg');
if (root) init(root);

function init(root) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = Math.min(innerWidth, innerHeight) < 720 || innerWidth < 720;
  const hasGL = webglAvailable();

  /* ---------- opere: pannelli e config di ricomposizione ---------- */

  const operaSecs = Array.from(root.querySelectorAll('.vg-opera[data-rec]'));
  const panels = operaSecs.map((sec) => {
    const conf = JSON.parse(sec.dataset.rec);
    return {
      sec,
      link: sec.querySelector('.vg-opera-link'),
      frame: sec.querySelector('.vg-frame'),
      art: sec.querySelector('.vg-art'),
      canvas: sec.querySelector('.vg-scatter'),
      conf,
      rec: null,
      prog: { v: 0 },
      composed: false,
      swapped: false,
      st: null,
    };
  });

  /* ---------- ciclo di vita dei recomposer (coda LRU, max 2) ---------- */

  const live = [];

  function ensureRec(p) {
    if (!hasGL || !p.canvas || !p.frame) return;
    if (p.rec) {
      // già vivo: aggiorna la posizione nella coda
      const i = live.indexOf(p);
      if (i !== -1) live.splice(i, 1);
      live.push(p);
      return;
    }
    p.rec = createRecomposer({
      canvas: p.canvas,
      frame: p.frame,
      src: p.conf.src,
      aspect: p.conf.aspect,
      seed: p.conf.seed,
      pattern: isMobile ? p.conf.m : p.conf.d,
    });
    if (!p.rec) return;
    p.rec.setProgress(p.prog.v);
    live.push(p);
    while (live.length > MAX_LIVE) dropRec(live[0]);
  }

  function dropRec(p) {
    if (!p.rec) return;
    p.rec.dispose();
    p.rec = null;
    const i = live.indexOf(p);
    if (i !== -1) live.splice(i, 1);
  }

  function swapFull(p) {
    if (p.swapped || !p.art) return;
    p.swapped = true;
    const full = p.art.dataset.full;
    if (!full) return;
    const pre = new Image();
    pre.onload = () => {
      p.art.src = full;
    };
    pre.src = full;
  }

  function apply(p) {
    const v = p.prog.v;
    if (p.rec) p.rec.setProgress(v);
    const composed = v > 0.995;
    if (composed !== p.composed) {
      p.composed = composed;
      p.sec.classList.toggle('is-composed', composed);
    }
  }

  addEventListener('pagehide', () => {
    panels.forEach(dropRec);
  });

  /* ---------- fps meter (?debug=1) ---------- */

  if (new URLSearchParams(location.search).get('debug') === '1') {
    window.__vg = { panels, live };
    const box = document.createElement('div');
    box.className = 'vg-fps';
    box.textContent = 'fps --.- · med --.-';
    document.body.appendChild(box);
    let frames = 0;
    let last = performance.now();
    let totalFrames = 0;
    const t0 = last;
    const fpsLoop = (now) => {
      frames += 1;
      totalFrames += 1;
      if (now - last >= 500) {
        const cur = (frames * 1000) / (now - last);
        const avg = (totalFrames * 1000) / (now - t0);
        box.textContent = `fps ${cur.toFixed(1)} · med ${avg.toFixed(1)} · gl ${live.length}`;
        frames = 0;
        last = now;
      }
      requestAnimationFrame(fpsLoop);
    };
    requestAnimationFrame(fpsLoop);
  }

  /* ---------- reduced motion: versione statica curata ---------- */

  if (reduce) {
    root.classList.add('vg-static');
    const bySec = new Map(panels.map((p) => [p.sec, p]));
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const p = bySec.get(e.target);
          if (p) swapFull(p);
          io.unobserve(e.target);
        }),
      { rootMargin: '260px' }
    );
    panels.forEach((p) => io.observe(p.sec));
    return;
  }

  /* ---------- journey ---------- */

  gsap.registerPlugin(ScrollTrigger, CustomEase);
  CustomEase.create('brama', '0.32,0.72,0,1');

  root.classList.add('vg-journey');
  if (!hasGL) root.classList.add('vg-nogl');

  /* opere: pin + ricomposizione a scrub.
     NB: i pin PRIMA di ogni altro trigger (i trigger creati dopo
     un pin tengono conto del suo spacer). */
  if (hasGL) {
    panels.forEach((p) => {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        onUpdate: () => apply(p),
        scrollTrigger: {
          trigger: p.sec,
          start: 'top top',
          end: isMobile ? '+=150%' : '+=165%',
          pin: true,
          scrub: 0.75,
          anticipatePin: 1,
        },
      });
      tl.to(p.prog, { v: 1, duration: 0.7 }, 0.08);
      tl.to({}, { duration: 0.22 }, 0.78); // respiro finale a opera composta
      p.st = tl.scrollTrigger;
    });

    /* prossimità: il motore nasce poco prima dell'arrivo e muore
       quando la tappa è lontana (mai più di 2 canvas vivi) */
    panels.forEach((p) => {
      ScrollTrigger.create({
        trigger: p.sec,
        start: 'top 150%',
        end: 'bottom -150%',
        onEnter: () => {
          ensureRec(p);
          swapFull(p);
        },
        onEnterBack: () => ensureRec(p),
        onLeave: () => dropRec(p),
        onLeaveBack: () => dropRec(p),
      });
    });
  } else {
    // senza WebGL le opere sono già composte: solo lo swap alla piena
    panels.forEach((p) => {
      ScrollTrigger.create({
        trigger: p.sec,
        start: 'top 140%',
        once: true,
        onEnter: () => swapFull(p),
      });
    });
  }

  /* ---------- campo colore unico lungo i respiri ---------- */

  root.querySelectorAll('.vg-fade').forEach((el) => {
    const a = el.dataset.from;
    const b = el.dataset.to;
    if (!a || !b || a === b) return;
    gsap.fromTo(
      root,
      { backgroundColor: a },
      {
        backgroundColor: b,
        ease: 'none',
        immediateRender: false,
        // la scenografia esce, POI il campo cambia, POI la scena dopo entra.
        // scrub sincrono (true, non 0.4): la coda di smoothing scriverebbe
        // il colore in ritardo, sovrascrivendo la regia del meccanismo
        // dopo un salto lungo (End/PageDown). Lenis smorza già lo scroll.
        scrollTrigger: { trigger: el, start: 'top 32%', end: 'bottom 58%', scrub: true },
      }
    );
  });

  /* ---------- dissolvenze di scena (taglio teatrale, mai morphing) ---------- */

  const soglia = root.querySelector('.vg-soglia');
  if (soglia) {
    gsap.to(soglia, {
      autoAlpha: 0,
      ease: 'brama',
      scrollTrigger: { trigger: soglia, start: 'bottom 78%', end: 'bottom 30%', scrub: 0.4 },
    });
    gsap.to('.vg-arrow', {
      autoAlpha: 0,
      ease: 'none',
      scrollTrigger: { trigger: soglia, start: 'top top', end: '26% top', scrub: true },
    });
  }

  /* Dissolvenza ingresso+uscita SENZA coppie di tween in conflitto
     sulla stessa proprietà: due scrub separati (fromTo in / to out)
     catturano stati path-dependent e con salti lunghi la scena resta
     bloccata invisibile. Un solo trigger con alpha calcolata dalla
     geometria è deterministico e reversibile. */
  const easeBrama = gsap.parseEase('brama');
  const clamp01 = gsap.utils.clamp(0, 1);
  function fadeThrough(el, sec, inStart, inEnd, outStart, outEnd) {
    gsap.set(el, { autoAlpha: 0 });
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 110%',
      end: 'bottom -10%',
      scrub: true,
      onUpdate: () => {
        const r = sec.getBoundingClientRect();
        const vh = innerHeight;
        const aIn = clamp01((inStart * vh - r.top) / ((inStart - inEnd) * vh));
        const aOut = clamp01((r.bottom - outEnd * vh) / ((outStart - outEnd) * vh));
        gsap.set(el, { autoAlpha: Math.min(easeBrama(aIn), easeBrama(aOut)) });
      },
    });
  }

  root.querySelectorAll('.vg-terr').forEach((sec) => {
    fadeThrough(sec, sec, 0.78, 0.28, 0.76, 0.28);
  });

  /* ---------- scena-meccanismo: da scura a chiara mentre gira ---------- */

  const mech = root.querySelector('.vg-mech');
  if (mech) {
    const stage = mech.querySelector('.vg-mech-stage');
    fadeThrough(stage, mech, 0.78, 0.3, 0.72, 0.26);
    // il campo si accende e l'inchiostro torna nero: il futuro che si apre.
    // Interpolazione manuale in onUpdate (NON una timeline scrubbing:
    // ScrollTrigger la renderizzerebbe a progress 0 già al load,
    // sporcando il campo colore della soglia con lo sfondo del meccanismo).
    const mechBg = gsap.utils.interpolate('#0a1430', '#dfe6f2');
    const mechInk = gsap.utils.interpolate('#4a93e6', '#0a0a0a');
    ScrollTrigger.create({
      trigger: mech,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.5,
      onUpdate: (self) => {
        const t = self.progress;
        root.style.backgroundColor = mechBg(t);
        mech.style.color = mechInk(t);
        mech.classList.toggle('is-composed', t > 0.45);
      },
    });
  }

  /* ---------- sigillo: la firma si posa, poi le due porte ---------- */

  const sigillo = root.querySelector('.vg-sigillo');
  if (sigillo) {
    gsap.fromTo(
      '.vg-sigillo-core',
      { autoAlpha: 0, y: -18 },
      {
        autoAlpha: 1,
        y: 0,
        ease: 'brama',
        immediateRender: true,
        scrollTrigger: { trigger: sigillo, start: 'top 72%', end: 'top 34%', scrub: 0.4 },
      }
    );
    gsap.fromTo(
      '.vg-porta',
      { autoAlpha: 0, y: 24 },
      {
        autoAlpha: 1,
        y: 0,
        stagger: 0.18,
        ease: 'brama',
        immediateRender: true,
        scrollTrigger: { trigger: sigillo, start: 'top 52%', end: 'top 16%', scrub: 0.4 },
      }
    );
  }

  /* ---------- parallasse leggera (solo piani della soglia) ---------- */

  root.querySelectorAll('[data-plx]').forEach((el) => {
    const d = parseFloat(el.dataset.plx) || 0;
    if (!d) return;
    const sec = el.closest('section');
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

  /* ---------- lenis + menu + tastiera ---------- */

  const lenis = new Lenis({ autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // il menu overlay ferma il viaggio finché è aperto
  addEventListener('vg:menu', (e) => {
    if (e.detail && e.detail.open) lenis.stop();
    else lenis.start();
  });

  // focus da tastiera su un'opera: il viaggio la raggiunge composta
  panels.forEach((p) => {
    if (!p.link) return;
    p.link.addEventListener('focus', () => {
      const st = p.st;
      if (!st) return;
      const target = st.start + (st.end - st.start) * 0.9;
      if (Math.abs(window.scrollY - target) > innerHeight * 0.5) {
        lenis.scrollTo(target, { duration: 0.9 });
      }
    });
  });

  /* ---------- resize (guardia per la barra URL di iOS) ---------- */

  let rsTimer = null;
  let lastW = innerWidth;
  let lastH = innerHeight;
  addEventListener('resize', () => {
    clearTimeout(rsTimer);
    rsTimer = setTimeout(() => {
      if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 160) return;
      lastW = innerWidth;
      lastH = innerHeight;
      panels.forEach((p) => p.rec && p.rec.resize());
      ScrollTrigger.refresh();
    }, 250);
  });
}
