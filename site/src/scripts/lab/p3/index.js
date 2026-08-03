/**
 * P3 — "IBRIDO" · orchestrazione del viaggio.
 * Lenis (scroll) + GSAP ScrollTrigger (pin/scrub) + thread (canvas 2D fixed)
 * + torch (micro WebGL per opera). Tutto degrada: senza JS o con
 * prefers-reduced-motion la pagina è la sequenza statica curata del CSS.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createThread } from './thread.js';
import { createTorch } from './torch.js';
import { initFps } from './fps.js';

export function initP3() {
  const root = document.getElementById('p3');
  if (!root) return;

  if (new URLSearchParams(location.search).get('debug') === '1') {
    initFps(document.getElementById('p3-fps'));
  }

  const restart = document.getElementById('p3-restart');
  const journey = document.documentElement.classList.contains('p3-js');

  if (!journey) {
    // versione statica: solo il ritorno in cima
    restart?.addEventListener('click', () => window.scrollTo({ top: 0 }));
    return;
  }

  try {
    initJourney(root, restart);
  } catch (err) {
    // qualsiasi imprevisto → si torna alla versione statica curata
    document.documentElement.classList.remove('p3-js');
    restart?.addEventListener('click', () => window.scrollTo({ top: 0 }));
    if (import.meta.env?.DEV) console.error('[p3]', err);
  }
}

function initJourney(root, restart) {
  gsap.registerPlugin(ScrollTrigger);

  // ---------- Lenis + ScrollTrigger ----------
  const lenis = new Lenis({ autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  restart?.addEventListener('click', () => lenis.scrollTo(0, { duration: 1.8 }));

  const $ = (s, el = root) => el.querySelector(s);
  const $$ = (s, el = root) => Array.from(el.querySelectorAll(s));

  // ---------- hero: il titolo si posa ----------
  gsap.from('.p3-hero > *', {
    y: 34,
    autoAlpha: 0,
    duration: 1.2,
    stagger: 0.09,
    ease: 'power3.out',
    delay: 0.15,
    clearProps: 'all',
  });

  // ---------- opere: pin + scrub, ingresso nella materia ----------
  const torches = [];
  $$('.p3-opera').forEach((section) => {
    const mode = section.dataset.opera === 'vertigine' ? 1 : 2;
    const figure = $('.p3-artwork', section);
    const veil = $('.p3-opera-veil', section);
    const img = $('img', figure);
    const meta = $$('.p3-opera-meta > *', section);
    const torch = createTorch(figure, mode);
    torches.push(torch);
    const boost = { v: 0 };

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: '+=170%',
        scrub: 0.7,
        pin: true,
        anticipatePin: 1,
        onToggle: (self) => torch.setRunning(self.isActive),
      },
    });

    tl.fromTo(veil, { opacity: 1 }, { opacity: 0, duration: 0.45, ease: 'none' }, 0)
      .fromTo(
        img,
        {
          clipPath: 'inset(20% 24% 20% 24% round 12px)',
          scale: 0.62,
          filter: 'grayscale(1) contrast(1.08) brightness(0.92)',
        },
        {
          clipPath: 'inset(0% 0% 0% 0% round 0px)',
          scale: 1,
          filter: 'grayscale(0) contrast(1) brightness(1)',
          duration: 0.62,
          ease: 'power2.inOut',
        },
        0.04
      )
      .fromTo(
        meta,
        { y: 42, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.45, stagger: 0.055, ease: 'power2.out' },
        0.42
      )
      .to(
        boost,
        {
          v: 1,
          duration: 0.5,
          ease: 'none',
          onUpdate: () => torch.setBoost(boost.v),
        },
        0.45
      );

    // tastiera: il CTA è un link vero; il focus porta la scena allo stato svelato
    $('.p3-cta', section)?.addEventListener('focus', () => {
      const st = tl.scrollTrigger;
      lenis.scrollTo(st.start + (st.end - st.start) * 0.95, { duration: 0.8 });
    });
  });

  // ---------- territori: camera che curva e si inclina ----------
  $$('.p3-territory').forEach((terr) => {
    const tilt = $('.p3-tilt', terr);
    if (tilt) {
      gsap.fromTo(
        tilt,
        { rotate: -1.5, y: 60 },
        {
          rotate: 1.1,
          y: -60,
          ease: 'none',
          scrollTrigger: { trigger: terr, start: 'top bottom', end: 'bottom top', scrub: true },
        }
      );
    }
    // tratteggio: le linee affiorano man mano
    const marks = $$('.p3-hatch path, .p3-hatch line', terr);
    if (marks.length) {
      gsap.from(marks, {
        opacity: 0,
        ease: 'none',
        stagger: 0.4,
        scrollTrigger: { trigger: terr, start: 'top 85%', end: 'center center', scrub: true },
      });
    }
  });

  // frammenti di disegno: emergono dalle anse con una spennellata
  $$('.p3-frag').forEach((frag) => {
    gsap.from(frag, {
      clipPath: 'inset(0% 100% 0% 0%)',
      rotate: '-=5',
      duration: 1.2,
      ease: 'power3.out',
      scrollTrigger: { trigger: frag, start: 'top 78%' },
    });
  });

  // parallasse leggera dei frammenti
  $$('[data-speed]').forEach((el) => {
    const speed = parseFloat(el.dataset.speed || '1');
    gsap.fromTo(
      el,
      { y: 90 * (1 - speed) },
      {
        y: -90 * (1 - speed),
        ease: 'none',
        scrollTrigger: {
          trigger: el.parentElement,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      }
    );
  });

  // firma: si posa mentre il filo si riannoda
  gsap.from('.p3-finale > *', {
    y: 30,
    opacity: 0,
    stagger: 0.12,
    ease: 'none',
    scrollTrigger: { trigger: '.p3-finale', start: 'top 70%', end: 'center center', scrub: true },
  });

  // ---------- il filo nero ----------
  const thread = createThread(document.getElementById('p3-thread'));
  const pointer = { x: -1e4, y: -1e4, active: false };

  function buildPath() {
    const vw = window.innerWidth;
    const y0 = window.scrollY;
    const r = (sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { top: b.top + y0, bottom: b.bottom + y0, h: b.height };
    };
    const hero = r('.p3-hero');
    const t1 = r('.p3-t1');
    const t2 = r('.p3-t2');
    const fin = r('.p3-finale');
    const sigB = document.querySelector('.p3-sig').getBoundingClientRect();
    const sig = { x: sigB.left + sigB.width / 2, y: sigB.top + sigB.height / 2 + y0 };

    const X = (f) => f * vw;
    const P = (fx, y, c, a, w = 1) => ({ x: X(fx), y, c, a, w });
    const pts = [];

    // HERO — il tratto nasce di luce sul navy
    pts.push(P(0.5, hero.top + hero.h * 0.55, 1, 0, 0.8));
    pts.push(P(0.47, hero.top + hero.h * 0.72, 1, 0.5, 0.8));
    pts.push(P(0.43, hero.bottom - 60, 1, 0.65, 0.85));

    // T1 — sulla carta diventa inchiostro; ansa attorno al frammento
    pts.push(P(0.5, t1.top + t1.h * 0.08, 0, 0.85, 1));
    pts.push(P(0.66, t1.top + t1.h * 0.15, 0, 0.9, 1));
    pts.push(P(0.8, t1.top + t1.h * 0.2, 0, 0.9, 1));
    pts.push(P(0.84, t1.top + t1.h * 0.26, 0, 0.9, 1));
    pts.push(P(0.74, t1.top + t1.h * 0.28, 0, 0.9, 1.05));
    pts.push(P(0.7, t1.top + t1.h * 0.23, 0, 0.9, 1));
    pts.push(P(0.55, t1.top + t1.h * 0.3, 0, 0.88, 1));
    pts.push(P(0.2, t1.top + t1.h * 0.42, 0, 0.9, 1.1));
    pts.push(P(0.32, t1.top + t1.h * 0.56, 0, 0.9, 1));
    // spirale: il tratto si avvita prima di entrare nella materia
    const c1 = { x: X(0.5), y: t1.top + t1.h * 0.82 };
    const turns = 2.1;
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ang = -Math.PI / 2 + t * turns * Math.PI * 2;
      const rad = (1 - t) * Math.min(190, vw * 0.16) + 14;
      pts.push({
        x: c1.x + Math.cos(ang) * rad,
        y: c1.y + Math.sin(ang) * rad * 0.62,
        c: 0,
        a: t < 0.62 ? 0.88 : 0.88 * (1 - (t - 0.62) / 0.38),
        w: 1 - t * 0.35,
      });
    }

    // OPERA 1 — passaggio invisibile (si entra nel quadro, il filo tace)
    pts.push(P(0.5, (t1.bottom + t2.top) / 2, 0, 0, 0.8));

    // T2 — riaffiora e cade a zig-zag, poi si spezza
    pts.push(P(0.42, t2.top + t2.h * 0.07, 0, 0, 1));
    pts.push(P(0.6, t2.top + t2.h * 0.16, 0, 0.85, 1));
    pts.push(P(0.3, t2.top + t2.h * 0.26, 0, 0.9, 1.05));
    pts.push(P(0.16, t2.top + t2.h * 0.31, 0, 0.9, 1));
    pts.push(P(0.24, t2.top + t2.h * 0.36, 0, 0.9, 1));
    pts.push(P(0.55, t2.top + t2.h * 0.46, 0, 0.55, 0.9));
    pts.push(P(0.42, t2.top + t2.h * 0.58, 0, 0.75, 0.85));
    pts.push(P(0.58, t2.top + t2.h * 0.7, 0, 0.35, 0.8));
    pts.push(P(0.5, t2.top + t2.h * 0.82, 0, 0.55, 0.75));
    pts.push(P(0.52, t2.bottom - t2.h * 0.06, 0, 0, 0.7));

    // OPERA 2 — silenzio
    pts.push(P(0.5, (t2.bottom + fin.top) / 2, 1, 0, 0.8));

    // FINALE — il filo torna luce e si riannoda nella firma
    pts.push(P(0.5, fin.top + fin.h * 0.12, 1, 0, 0.9));
    pts.push(P(0.46, sig.y - 170, 1, 0.7, 0.9));
    const kr = Math.min(130, vw * 0.14);
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const ang = -Math.PI / 2 + t * Math.PI * 2 * 1.6;
      const rad = kr * (1 - t * 0.45);
      pts.push({
        x: sig.x + Math.cos(ang) * rad,
        y: sig.y + Math.sin(ang) * rad * 0.55,
        c: 1,
        a: 0.8,
        w: 0.9,
      });
    }
    pts.push(P(0.5, sig.y + 130, 1, 0.85, 0.95));
    pts.push(P(0.5, sig.y + 190, 1, 0, 0.9));

    thread.setPath(pts, [0.13, 0.18, 0.24, 0.3, 0.36, 0.58, 0.63, 0.7, 0.94]);
  }

  ScrollTrigger.addEventListener('refresh', () => {
    thread.resize();
    buildPath();
    torches.forEach((t) => t.resize());
  });
  ScrollTrigger.refresh();

  // puntatore → flessione elastica del filo (mouse e dito)
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
      thread.setPointer(pointer.x, pointer.y, true);
    },
    { passive: true }
  );
  window.addEventListener('pointerdown', (e) => {
    thread.setPointer(e.clientX, e.clientY, true);
  }, { passive: true });
  document.addEventListener('pointerleave', () => {
    pointer.active = false;
    thread.setPointer(-1e4, -1e4, false);
  });
  window.addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0];
      if (t) thread.setPointer(t.clientX, t.clientY, true);
    },
    { passive: true }
  );
  window.addEventListener('touchend', () => thread.setPointer(-1e4, -1e4, false), {
    passive: true,
  });

  // tick del filo agganciato al ticker GSAP (un solo rAF per tutta la pagina)
  let lastT = 0;
  gsap.ticker.add((t) => {
    const dt = Math.min(0.05, lastT ? t - lastT : 0.016);
    lastT = t;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const y = window.scrollY;
    thread.setScroll(y, max > 0 ? y / max : 0);
    thread.tick(dt);
  });
}
