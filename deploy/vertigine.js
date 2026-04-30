// Vertigine — interactive vortex
// Faithful to the painting: deep blue spiral whirlpool, white foam streaks,
// red shards being sucked into a black void at the center.
// The vortex itself stays centered. Mouse only deflects/perturbs the flow.
// Click → drops a shockwave that flings flecks outward before they're pulled back.

(function () {
  const canvas = document.getElementById('vertigine');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Blocca il menu contestuale (long-press mobile, tasto destro desktop)
  // così tenendo premuto sul vortice non escono "Copia/Condividi/Salva".
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.style.webkitTouchCallout = 'none';
  canvas.style.userSelect = 'none';

  let DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  let cx = 0, cy = 0;       // vortex center (fixed at canvas center)
  let mx = 0, my = 0;       // mouse pos
  let mActive = false;
  let shockwaves = [];
  let speedBoost = 1;       // global speed multiplier — click ramps it up, decays back to 1

  // Palette pulled from the painting
  const BLUES = [
    '#0a1a3d', // deepest blue
    '#142a66', // navy
    '#1f49a8', // cobalt
    '#2c6fd1', // mid blue
    '#4a93e6', // bright blue
    '#7fb9f0'  // pale blue
  ];
  const FOAM = '#f0f4ff';
  const REDS = ['#a31818', '#c8281c', '#e64a2a', '#7a1010'];

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx = W / 2; cy = H / 2;
    mx = cx; my = cy;
  }
  window.addEventListener('resize', resize);

  // Particle: a fleck on a tightening logarithmic spiral.
  // Two species: 'water' (blue/foam streaks — long, fast, fluid) and 'shard' (red, denser, slower).
  class P {
    constructor(species, seed) {
      this.species = species;
      this.reset(seed);
    }
    reset(seed) {
      this.maxR = Math.hypot(W, H) * 0.55;
      // angular position
      this.theta = Math.random() * Math.PI * 2;
      // radius — shards spawn closer-in than water on average
      const r0 = this.species === 'shard' ? 0.55 : 0.95;
      this.r = seed ? Math.random() * this.maxR : this.maxR * (r0 - 0.1 + Math.random() * 0.15);
      // angular velocity — direction of spiral (counter-clockwise looking at painting)
      this.omega = (this.species === 'water' ? 0.00022 : 0.00015) + Math.random() * 0.00018;
      // radial pull — accelerates as it gets closer (vortex)
      this.pull = 0.00005 + Math.random() * 0.00009;
      if (this.species === 'shard') this.pull *= 0.55; // shards drift in slower, hover longer
      // visual
      if (this.species === 'water') {
        this.color = Math.random() < 0.18 ? FOAM : BLUES[Math.floor(Math.random() * BLUES.length)];
        this.size = 0.6 + Math.pow(Math.random(), 2) * 2.4;
        this.streak = 6 + Math.random() * 18; // long fluid streaks
        this.alpha = 0.45 + Math.random() * 0.5;
      } else {
        this.color = REDS[Math.floor(Math.random() * REDS.length)];
        this.size = 1.2 + Math.pow(Math.random(), 2) * 3.4;
        this.streak = 2 + Math.random() * 5;
        this.alpha = 0.7 + Math.random() * 0.3;
      }
      // vertical squash — vortex looks oval (bowl viewed at angle)
      this.squash = 0.92 + Math.random() * 0.08;
      // shockwave velocity
      this.vx = 0; this.vy = 0;
      this._x = this._y = undefined;
    }
    step(dt) {
      // Spiral acceleration grows hard as r → 0
      const k = 1 - this.r / this.maxR;
      const accelByRadius = 1 + k * k * 3;
      this.theta += this.omega * dt * accelByRadius * speedBoost * startupRamp;
      this.r -= (this.pull * this.r + 0.04) * dt * speedBoost * startupRamp;

      // Mouse perturbation — gentle pull toward cursor for water,
      // strong repel for shards (mouse "pushes" them away briefly)
      if (mActive) {
        const px = cx + Math.cos(this.theta) * this.r;
        const py = cy + Math.sin(this.theta) * this.r * this.squash;
        const dx = mx - px;
        const dy = my - py;
        const d2 = dx * dx + dy * dy + 1;
        if (d2 < 60000) {
          const f = (this.species === 'water' ? 18 : -28) / Math.sqrt(d2);
          this.vx += dx * f * dt * 0.0006;
          this.vy += dy * f * dt * 0.0006;
        }
      }

      // shockwave decay
      this.vx *= 0.94;
      this.vy *= 0.94;

      const x = cx + Math.cos(this.theta) * this.r + this.vx;
      const y = cy + Math.sin(this.theta) * this.r * this.squash + this.vy;

      const lastX = this._x ?? x;
      const lastY = this._y ?? y;

      // streak end — back along the angular tangent (motion blur direction)
      const tang = this.theta - Math.PI / 2;
      const sl = this.streak * (0.4 + k * 1.6);
      const sx = x - Math.cos(tang) * sl;
      const sy = y - Math.sin(tang) * sl * this.squash;

      this.lastX = lastX; this.lastY = lastY;
      this._x = x; this._y = y;
      this.sx = sx; this.sy = sy;
      this.k = k;

      if (this.r < 6) this.reset(false);
    }
    draw(ctx) {
      const t = this.k;
      const a = this.alpha * (0.25 + t * 0.85);

      // streak (motion blur tangent)
      ctx.globalAlpha = a * 0.55;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.size * (0.7 + t * 1.4);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.sx, this.sy);
      ctx.lineTo(this._x, this._y);
      ctx.stroke();

      // head
      ctx.globalAlpha = a;
      ctx.fillStyle = this.color;
      const sz = this.size * (0.5 + t * 1.8);
      ctx.beginPath();
      ctx.arc(this._x, this._y, sz, 0, Math.PI * 2);
      ctx.fill();

      // foam highlights — bright core
      if (this.color === FOAM && t > 0.4) {
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(this._x, this._y, sz * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    shock(sx, sy, power) {
      const dx = this._x - sx;
      const dy = this._y - sy;
      const d = Math.hypot(dx, dy) + 0.001;
      const f = power * 240 / (d + 60);
      this.vx += (dx / d) * f;
      this.vy += (dy / d) * f;
    }
  }

  let parts = [];
  function buildParticles() {
    let total = window.__brama_density ?? 320;
    // Su mobile (< 768px) o GPU integrate dimezza le particelle: la differenza
    // visiva è marginale, l'aiuto al frame rate è enorme.
    if (window.matchMedia('(max-width: 768px)').matches) {
      total = Math.round(total * 0.5);
    }
    parts = [];
    const waterN = Math.round(total * 0.72);
    const shardN = total - waterN;
    for (let i = 0; i < waterN; i++) parts.push(new P('water', true));
    for (let i = 0; i < shardN; i++) parts.push(new P('shard', true));
  }

  // Mouse
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mx = e.clientX - r.left;
    my = e.clientY - r.top;
    mActive = true;
  });
  canvas.addEventListener('pointerleave', () => { mActive = false; });
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    for (const p of parts) p.shock(sx, sy, 1);
    // click → speed up the whole vortex briefly
    speedBoost = Math.min(speedBoost + 4, 6);
  });

  let last = performance.now();
  const t0 = last;
  let startupRamp = 0;            // 0 → 1 over ~2.6s; multiplies omega/pull
  function frame(now) {
    const dt = Math.min(48, now - last);
    last = now;

    // startup spin-up — ease from 0 to 1
    const elapsed = now - t0;
    const RAMP_MS = 2600;
    if (elapsed < RAMP_MS) {
      const k = elapsed / RAMP_MS;
      // easeInOutCubic
      startupRamp = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    } else {
      startupRamp = 1;
    }

    // speed boost decays back toward 1
    speedBoost += (1 - speedBoost) * 0.012;

    // Background — deep navy with subtle radial gradient (lighter at outer rim, darker at center where the void sits)
    ctx.globalCompositeOperation = 'source-over';
    // Trail-fade overlay: opaque deep blue painted with low alpha so streaks linger briefly
    ctx.fillStyle = 'rgba(8, 16, 40, 0.22)';
    ctx.fillRect(0, 0, W, H);

    // Painterly base wash (under everything) — re-applied each frame to keep overall blue tone
    const baseGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(W, H) * 0.7);
    baseGrad.addColorStop(0, 'rgba(5, 8, 22, 0.05)');
    baseGrad.addColorStop(0.45, 'rgba(20, 42, 102, 0.0)');
    baseGrad.addColorStop(1, 'rgba(74, 147, 230, 0.04)');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, W, H);

    // Particles — 'lighter' blend for water (foam glows), normal for shards
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      if (p.species === 'water') { p.step(dt); p.draw(ctx); }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const p of parts) {
      if (p.species === 'shard') { p.step(dt); p.draw(ctx); }
    }

    // Shockwave rings
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const s = shockwaves[i];
      s.t += dt;
      const k = s.t / s.max;
      if (k >= 1) { shockwaves.splice(i, 1); continue; }
      const radius = k * Math.max(W, H) * 0.55;
      ctx.globalAlpha = (1 - k) * 0.5;
      ctx.strokeStyle = '#f0f4ff';
      ctx.lineWidth = 1.4 * (1 - k);
      ctx.beginPath();
      ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    const voidR = Math.min(W, H) * 0.06;

    // Claw-slash streaks: thin spirals that follow the vortex CLOCKWISE.
    // Each claw is drawn as many short segments so we can fade the alpha
    // along its length (start = bright, tail = invisible).
    const tSec = now * 0.001;
    const drift = -tSec * 0.32; // negative = clockwise
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    const claws = 9;
    const arcLen = 2.6; // radians — longer reach
    const STEPS = 60;   // many segments for smooth alpha fade
    const r0 = voidR * 0.95;
    const b = 0.36; // spiral tightness

    for (let i = 0; i < claws; i++) {
      const startAngle = drift + (i * Math.PI * 2) / claws;

      // ── Inner stub: a short radial run-in from the center out to r0,
      //    so the claw appears to start at the very middle and meet the
      //    other claws there. Drawn first so the spiral continues from
      //    its inner end seamlessly. Bright at the connection point.
      const innerSteps = 12;
      let prevX = cx;
      let prevY = cy;
      for (let s = 1; s <= innerSteps; s++) {
        const k = s / innerSteps;
        const r = k * r0;
        const x = cx + Math.cos(startAngle) * r;
        const y = cy + Math.sin(startAngle) * r;

        const fade = Math.pow(k, 0.6); // dim at center, brightening outward

        ctx.strokeStyle = `rgba(170, 225, 228, ${0.22 * fade})`;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();

        ctx.strokeStyle = `rgba(210, 244, 244, ${0.5 * fade})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();

        prevX = x; prevY = y;
      }

      // ── Outer spiral (the original): walks from r0 outward, fading to 0.
      for (let s = 1; s <= STEPS; s++) {
        const k = s / STEPS;
        const theta = -k * arcLen;
        const r = r0 * Math.exp(b * (-theta));
        const a = startAngle + theta;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;

        // Fade curve: ease-out so it stays visible early, dies off late
        const fade = Math.pow(1 - k, 1.6);

        // Soft glow halo
        ctx.strokeStyle = `rgba(170, 225, 228, ${0.22 * fade})`;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();

        // Bright core
        ctx.strokeStyle = `rgba(210, 244, 244, ${0.5 * fade})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();

        prevX = x; prevY = y;
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // Central celeste-chiaro core — drawn LAST so it covers the start of the
    // claw streaks. Uses source-over (opaque) — solid disk inside, gradient
    // halo outside.
    ctx.globalAlpha = 1;
    const coreSize = (typeof window.__brama_coreSize === 'number' ? window.__brama_coreSize : 1.7);
    const coreColorHex = (typeof window.__brama_coreColor === 'string' ? window.__brama_coreColor : '#d2ebf8');
    const _h = coreColorHex.replace('#','');
    const _hh = _h.length === 3 ? _h.split('').map(c=>c+c).join('') : _h;
    const _r = parseInt(_hh.slice(0,2), 16) || 210;
    const _g = parseInt(_hh.slice(2,4), 16) || 235;
    const _b = parseInt(_hh.slice(4,6), 16) || 248;
    const coreR = voidR * coreSize;

    // Inner solid disk — fully opaque, covers the claw heads completely.
    const innerR = coreR * 0.55;
    ctx.fillStyle = `rgb(${_r}, ${_g}, ${_b})`;
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fill();

    // Outer halo — soft gradient fade from solid edge of inner disk to transparent.
    const haloGrad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, coreR);
    haloGrad.addColorStop(0,    `rgba(${_r}, ${_g}, ${_b}, 1)`);
    haloGrad.addColorStop(0.5,  `rgba(${_r}, ${_g}, ${_b}, 0.55)`);
    haloGrad.addColorStop(1,    `rgba(${_r}, ${_g}, ${_b}, 0)`);
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();

    if (shouldRun()) {
      requestAnimationFrame(frame);
    } else {
      rafActive = false;
    }
  }

  // Stato del loop: due flag indipendenti.
  //   onscreen: vero quando l'hero è almeno parzialmente visibile.
  //   externalPause: settato dal codice di scroll-snap durante la
  //   transizione tra hero e galleria, per liberare la GPU.
  let onscreen = true;
  let externalPause = false;
  let rafActive = true;
  function shouldRun() { return onscreen && !externalPause; }
  function maybeStart() {
    if (shouldRun() && !rafActive) {
      rafActive = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }
  // API pubblica usata dallo snap-scroll
  window.__brama_canvas_pause  = () => { externalPause = true; };
  window.__brama_canvas_resume = () => { externalPause = false; maybeStart(); };

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const ent of entries) {
        onscreen = ent.isIntersecting;
        maybeStart();
      }
    }, { threshold: 0 });
    io.observe(canvas);
  }

  resize();
  buildParticles();
  window.__brama_rebuild = buildParticles;
  requestAnimationFrame(frame);
})();
