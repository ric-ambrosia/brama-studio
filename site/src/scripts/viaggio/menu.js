/* ============================================================
   VIAGGIO · menu — punto-logo + hamburger, overlay notte.
   Stessa logica accessibile di layouts/Base.astro (toggle con
   aria-expanded, Escape, chiusura al click su link), qui in
   modulo autonomo perché la home è un documento indipendente.
   Comunica con journey.js via evento 'vg:menu' (stop/start Lenis).
   ============================================================ */

const toggle = document.querySelector('.vg-burger');
const menu = document.getElementById('vg-menu');

if (toggle && menu) {
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Chiudi il menu' : 'Apri il menu');
    menu.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('menu-open', open);
    window.dispatchEvent(new CustomEvent('vg:menu', { detail: { open } }));
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });

  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
}
