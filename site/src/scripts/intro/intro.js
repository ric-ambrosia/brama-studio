// Landing brama. Il vortice (vertigine.js) e la sua interazione col mouse sono
// nativi. Qui: scroll → --p (la camera "entra" nel vortice, le ali si aprono,
// il pannello HUD delle sezioni compare — tutto guidato da --p in CSS), e
// quando si è dentro la spirale sparisce del tutto (opacità 0 + pausa GPU).
const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Layout: landscape ampio → robot a sinistra, menu a destra (layout-side);
// portrait/stretto → robot sopra, menu sotto (layout-stack).
function setLayout() {
  const side = innerWidth > innerHeight && innerWidth >= 760;
  root.classList.toggle('layout-side', side);
  root.classList.toggle('layout-stack', !side);
}
setLayout();
addEventListener('resize', setLayout);

if (reduce) {
  root.classList.add('is-static');
} else {
  const hub = document.querySelector('.hub');
  const vortexCanvas = document.getElementById('vertigine');
  let vortexHidden = false;

  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  let p = 0, raf = 0;

  function render() {
    raf = 0;
    root.style.setProperty('--p', p.toFixed(4));
    // il pannello diventa cliccabile solo quando è visibile
    if (hub) hub.classList.toggle('live', p > 0.55);

    // Entrando nella spirale, la spirale sparisce del tutto: l'opacità CSS l'ha
    // già portata a 0; qui la mettiamo anche in pausa (GPU) e fuori dal render
    // (display:none), con isteresi per non sfarfallare vicino alla soglia.
    if (vortexCanvas) {
      if (!vortexHidden && p > 0.40) {
        vortexHidden = true;
        vortexCanvas.classList.add('vx-hidden');
        window.__brama_canvas_pause && window.__brama_canvas_pause();
      } else if (vortexHidden && p < 0.33) {
        vortexHidden = false;
        vortexCanvas.classList.remove('vx-hidden');
        window.__brama_canvas_resume && window.__brama_canvas_resume();
      }
    }
  }

  function onScroll() {
    p = clamp01(scrollY / (innerHeight * 1.3));
    if (!raf) raf = requestAnimationFrame(render);
  }

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();
}
