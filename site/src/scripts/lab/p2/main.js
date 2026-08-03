// P2 — "camera nel mondo": entry point.
// Decide la modalità (viaggio WebGL vs sequenza statica curata), guida
// Lenis -> progress -> mondo 3D + overlay DOM, gestisce torcia, FPS, cleanup.

import Lenis from 'lenis';
import { WIN, bump } from './timeline.js';

const root = document.getElementById('p2-root');
const canvas = document.getElementById('p2-canvas');
const debugEl = document.getElementById('p2-debug');
const wantsDebug = /[?&]debug=1/.test(window.location.search);

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

function makeFpsMeter() {
  if (!wantsDebug || !debugEl) return null;
  debugEl.hidden = false;
  let frames = 0;
  let total = 0;
  const t0 = performance.now();
  let last = t0;
  let line = '';
  return (extra) => {
    frames++;
    total++;
    const now = performance.now();
    if (now - last >= 500) {
      const fps = (frames * 1000) / (now - last);
      const avg = (total * 1000) / (now - t0);
      line = `fps ${fps.toFixed(0).padStart(3, ' ')} · avg ${avg.toFixed(0).padStart(3, ' ')}`;
      frames = 0;
      last = now;
    }
    debugEl.textContent = extra != null ? `${line} · p ${extra.toFixed(3)}` : line;
  };
}

function goStatic() {
  if (!root) return;
  root.classList.remove('is-journey');
  root.classList.add('is-static');
  const fps = makeFpsMeter();
  if (fps) {
    const loop = () => {
      fps(null);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

if (!root || !canvas || reducedMotion || !webglAvailable()) {
  goStatic();
} else {
  start().catch((err) => {
    console.warn('[p2] fallback statico:', err);
    goStatic();
  });
}

async function start() {
  const { createWorld } = await import('./world.js');
  const world = createWorld(canvas); // può lanciare se il contesto GL fallisce
  root.classList.add('is-journey');

  const lenis = new Lenis({ autoRaf: false });

  // --- puntatore = torcia
  const pointer = { ndc: { x: 0, y: 0 }, client: { x: 0, y: 0 }, fresh: -1e4, has: false };
  const onMove = (x, y) => {
    pointer.ndc.x = (x / window.innerWidth) * 2 - 1;
    pointer.ndc.y = -(y / window.innerHeight) * 2 + 1;
    pointer.client.x = x;
    pointer.client.y = y;
    pointer.fresh = performance.now();
    pointer.has = true;
  };
  window.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0];
      if (t) onMove(t.clientX, t.clientY);
    },
    { passive: true }
  );

  // --- overlay DOM sincronizzati col progress
  const sections = [...root.querySelectorAll('.p2-sec[data-win]')].map((el) => ({
    el,
    inner: el.querySelector('.sec-in'),
    win: WIN[el.dataset.win],
    o: -1,
  }));
  function updateOverlays(p) {
    for (const s of sections) {
      if (!s.win) continue;
      const o = bump(s.win, p);
      if (Math.abs(o - s.o) < 0.002) continue;
      s.o = o;
      s.el.style.opacity = o.toFixed(3);
      s.el.classList.toggle('is-live', o > 0.015);
      if (s.inner) {
        const mid = (s.win[1] + s.win[2]) / 2;
        const dir = p < mid ? 1 : -1;
        s.inner.style.transform = `translate3d(0, ${((1 - o) * 22 * dir).toFixed(1)}px, 0)`;
      }
    }
  }

  // --- alone torcia DOM
  const halo = root.querySelector('.p2-torch');
  let haloOn = false;
  function updateHalo(st) {
    const on = st.fresh;
    if (on) {
      halo.style.transform = `translate3d(${pointer.client.x}px, ${pointer.client.y}px, 0) translate(-50%, -50%)`;
    }
    if (on !== haloOn) {
      haloOn = on;
      halo.classList.toggle('on', on);
      root.classList.toggle('torch-live', on);
    }
  }

  // --- skip / restart accessibili
  const skip = root.querySelector('.p2-skip');
  skip &&
    skip.addEventListener('click', (e) => {
      e.preventDefault();
      lenis.scrollTo(lenis.limit, { duration: 2 });
    });
  const restart = root.querySelector('[data-restart]');
  restart &&
    restart.addEventListener('click', (e) => {
      e.preventDefault();
      lenis.scrollTo(0, { duration: 2.4 });
    });

  window.addEventListener('resize', () => world.resize());

  const fps = makeFpsMeter();
  let rafId = 0;
  let progress = 0;
  function loop(time) {
    rafId = requestAnimationFrame(loop);
    lenis.raf(time);
    progress = lenis.limit > 0 ? Math.min(1, Math.max(0, lenis.scroll / lenis.limit)) : 0;
    const st = world.update(time, progress, pointer);
    updateOverlays(progress);
    updateHalo(st);
    if (fps) fps(progress);
  }
  rafId = requestAnimationFrame(loop);

  window.addEventListener(
    'pagehide',
    () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      world.dispose();
    },
    { once: true }
  );
}
