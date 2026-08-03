/**
 * P3 — FPS meter (?debug=1): fps corrente + media dall'avvio.
 */
export function initFps(el) {
  if (!el) return;
  el.hidden = false;
  let last = performance.now();
  let acc = 0;
  let frames = 0;
  let fps = 0;
  let totalFrames = 0;
  const start = last;

  function loop(now) {
    const dt = now - last;
    last = now;
    acc += dt;
    frames++;
    totalFrames++;
    if (acc >= 500) {
      fps = (frames * 1000) / acc;
      acc = 0;
      frames = 0;
      const avg = (totalFrames * 1000) / (now - start);
      el.textContent = `fps ${fps.toFixed(0).padStart(3, ' ')}\navg ${avg.toFixed(0).padStart(3, ' ')}`;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
