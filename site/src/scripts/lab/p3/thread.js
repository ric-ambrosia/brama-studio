/**
 * P3 — il filo nero.
 * Canvas 2D fixed a schermo intero. Il filo è una polilinea campionata da una
 * Catmull-Rom passante per punti di controllo in coordinate "mondo"
 * (x in px viewport, y in px documento). Il progresso di disegno è legato
 * allo scroll; i punti vicini al puntatore flettono con una molla.
 *
 * Nessuna dipendenza: solo Canvas 2D.
 */

const INK = [10, 10, 10];
const FOAM = [240, 244, 255];

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

// rumore deterministico e morbido per lo spessore "pennarello"
function noise1(i) {
  return (
    0.5 +
    0.28 * Math.sin(i * 0.31) +
    0.16 * Math.sin(i * 0.083 + 1.7) +
    0.06 * Math.sin(i * 1.7 + 0.4)
  );
}

export function createThread(canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });

  let dpr = 1;
  let vw = 0;
  let vh = 0;

  /** campioni: {x, y, c(0 ink→1 foam), a(alpha), w(width mul), ox, oy, vx, vy} */
  let pts = [];
  let cum = []; // lunghezza cumulata
  let totalLen = 0;
  let branches = []; // {startIdx, pts:[{x,y}], prog, spawned, c}

  let drawnLen = 0;
  let targetLen = 0;
  let scrollY = 0;
  let pointer = { x: -1e4, y: -1e4, active: false };
  let dirty = true;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    vw = window.innerWidth;
    vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    dirty = true;
  }

  /**
   * controls: [{x, y, c, a, w}] in coordinate mondo.
   * branchFracs: frazioni di percorso [0..1] da cui gemmano ramificazioni.
   */
  function setPath(controls, branchFracs = []) {
    pts = [];
    cum = [0];
    totalLen = 0;
    const SEG = 14;
    const n = controls.length;
    if (n < 2) return;

    for (let i = 0; i < n - 1; i++) {
      const p0 = controls[Math.max(0, i - 1)];
      const p1 = controls[i];
      const p2 = controls[i + 1];
      const p3 = controls[Math.min(n - 1, i + 2)];
      for (let s = 0; s < SEG; s++) {
        const t = s / SEG;
        const p = catmullRom(p0, p1, p2, p3, t);
        pts.push({
          x: p.x,
          y: p.y,
          c: p1.c + (p2.c - p1.c) * t,
          a: p1.a + (p2.a - p1.a) * t,
          w: p1.w + (p2.w - p1.w) * t,
          ox: 0,
          oy: 0,
          vx: 0,
          vy: 0,
        });
      }
    }
    const last = controls[n - 1];
    pts.push({ x: last.x, y: last.y, c: last.c, a: last.a, w: last.w, ox: 0, oy: 0, vx: 0, vy: 0 });

    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      totalLen += Math.hypot(dx, dy);
      cum.push(totalLen);
    }

    // ramificazioni: brevi corse perpendicolari con ricciolo
    branches = branchFracs.map((f, k) => {
      const idx = Math.min(pts.length - 2, Math.max(1, Math.round(f * (pts.length - 1))));
      const a = pts[idx];
      const b = pts[idx + 1];
      let nx = -(b.y - a.y);
      let ny = b.x - a.x;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      const side = k % 2 === 0 ? 1 : -1;
      const len = 46 + 44 * ((k * 0.618) % 1);
      const curl = side * (0.55 + 0.5 * ((k * 0.37) % 1));
      const bp = [];
      for (let s = 0; s <= 5; s++) {
        const t = s / 5;
        const ang = curl * t * 2.2;
        const cs = Math.cos(ang);
        const sn = Math.sin(ang);
        const rx = nx * cs - ny * sn;
        const ry = nx * sn + ny * cs;
        bp.push({ x: a.x + rx * len * t * side, y: a.y + ry * len * t * side });
      }
      return { startIdx: idx, pts: bp, prog: 0, spawned: false, c: a.c, a: a.a };
    });

    dirty = true;
  }

  function setScroll(y, frac) {
    scrollY = y;
    targetLen = Math.max(0, Math.min(1, frac)) * totalLen;
  }

  function setPointer(x, y, active) {
    pointer.x = x;
    pointer.y = y;
    pointer.active = active;
    if (active) dirty = true;
  }

  function color(c, a) {
    const r = Math.round(INK[0] + (FOAM[0] - INK[0]) * c);
    const g = Math.round(INK[1] + (FOAM[1] - INK[1]) * c);
    const b = Math.round(INK[2] + (FOAM[2] - INK[2]) * c);
    return `rgba(${r},${g},${b},${a})`;
  }

  /** ritorna true se ha ridisegnato (per il misuratore di attività) */
  function tick(dt) {
    if (!pts.length) return false;

    // avanzamento elastico del tratto
    const dl = targetLen - drawnLen;
    if (Math.abs(dl) > 0.5) {
      drawnLen += dl * Math.min(1, dt * 7.5);
      dirty = true;
    }

    // fisica: flessione dei punti vicini al puntatore (solo range visibile)
    const R = 120;
    const R2 = R * R;
    let physActive = false;
    const yMin = scrollY - 200;
    const yMax = scrollY + vh + 200;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.y < yMin || p.y > yMax) continue;
      if (pointer.active) {
        const dx = p.x + p.ox - pointer.x;
        const dy = p.y - scrollY + p.oy - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const f = ((R - d) / R) ** 2 * 260 * dt;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
      }
      // molla di richiamo
      p.vx += -p.ox * 9 * dt;
      p.vy += -p.oy * 9 * dt;
      p.vx *= 0.88;
      p.vy *= 0.88;
      p.ox += p.vx;
      p.oy += p.vy;
      if (Math.abs(p.ox) > 0.05 || Math.abs(p.oy) > 0.05) physActive = true;
    }
    if (physActive) dirty = true;

    // gemmazione ramificazioni
    let headIdx = binSearch(drawnLen);
    for (const br of branches) {
      if (!br.spawned && headIdx >= br.startIdx) {
        br.spawned = true;
        br.animStart = performance.now();
      }
      if (br.spawned && br.prog < 1) {
        const t = Math.min(1, (performance.now() - br.animStart) / 950);
        br.prog = 1 - Math.pow(1 - t, 3); // ~ power3.out
        dirty = true;
      }
    }

    if (!dirty) return false;
    draw(headIdx);
    dirty = false;
    return true;
  }

  function binSearch(len) {
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < len) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function draw(headIdx) {
    ctx.clearRect(0, 0, vw, vh);
    if (headIdx < 2) return;

    const margin = 80;
    // tratto principale, a blocchi di stile
    const CHUNK = 18;
    let i = 0;
    while (i < headIdx) {
      const end = Math.min(i + CHUNK, headIdx);
      const mid = pts[Math.min(end, pts.length - 1)];
      if (mid.a > 0.01) {
        // salta blocchi completamente fuori viewport
        let visible = false;
        for (let j = i; j <= end; j++) {
          const sy = pts[j].y - scrollY;
          if (sy > -margin && sy < vh + margin) {
            visible = true;
            break;
          }
        }
        if (visible) {
          strokeChunk(i, end, mid, headIdx);
        }
      }
      i = end;
    }

    // ramificazioni
    for (const br of branches) {
      if (!br.spawned || br.prog <= 0.02 || br.a < 0.02) continue;
      const sy = br.pts[0].y - scrollY;
      if (sy < -160 || sy > vh + 160) continue;
      const nSeg = Math.max(1, Math.floor(br.prog * (br.pts.length - 1)));
      ctx.beginPath();
      ctx.moveTo(br.pts[0].x, br.pts[0].y - scrollY);
      for (let s = 1; s <= nSeg; s++) {
        ctx.lineTo(br.pts[s].x, br.pts[s].y - scrollY);
      }
      ctx.strokeStyle = color(br.c, br.a * 0.7);
      ctx.lineWidth = 1.7;
      ctx.stroke();
    }

    // punta del pennarello
    const head = pts[Math.min(headIdx, pts.length - 1)];
    const hy = head.y - scrollY;
    if (hy > -20 && hy < vh + 20 && head.a > 0.05 && headIdx < pts.length - 2) {
      ctx.beginPath();
      ctx.arc(head.x + head.ox, hy + head.oy, 3.2 * head.w, 0, Math.PI * 2);
      ctx.fillStyle = color(head.c, Math.min(1, head.a + 0.15));
      ctx.fill();
    }
  }

  function strokeChunk(from, to, style, headIdx) {
    // doppio passaggio: corpo pieno + velo sfalsato (grana pennarello)
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      const offP = pass === 0 ? 0 : 1;
      let started = false;
      for (let j = from; j <= to && j <= headIdx; j++) {
        const p = pts[j];
        const x = p.x + p.ox + (offP ? 0.9 : 0);
        const y = p.y - scrollY + p.oy + (offP ? -0.7 : 0);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      if (!started) return;
      const wBase = (2.6 + 1.6 * noise1(from)) * style.w;
      if (pass === 0) {
        ctx.strokeStyle = color(style.c, style.a);
        ctx.lineWidth = wBase;
      } else {
        ctx.strokeStyle = color(style.c, style.a * 0.22);
        ctx.lineWidth = wBase * 0.5;
      }
      ctx.stroke();
    }
  }

  resize();

  return { resize, setPath, setScroll, setPointer, tick, get totalLen() { return totalLen; } };
}
