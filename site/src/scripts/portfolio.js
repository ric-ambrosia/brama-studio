// Portfolio — scroll verticale continuo (contenuto sticky, niente pin → niente
// buchi neri). Copertina: intro on-load + freccia che sfuma. Ogni opera: le
// componenti ENTRANO muovendosi (direzioni diverse per scena), la camera ZOOMA
// e si sposta DENTRO il quadro, poi il tutto scorre via mentre arriva l'opera
// successiva (sovrapposizione). Gira solo con <html>.js-anim.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

if (document.documentElement.classList.contains('js-anim')) {
  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => Array.from(r.querySelectorAll(s));
  const OFF = { left: { xPercent: -45 }, right: { xPercent: 45 }, up: { yPercent: -40 }, down: { yPercent: 40 } };
  const OPP = { left: 'right', right: 'left', up: 'down', down: 'up' };

  // ── Copertina: intro on-load, poi sfuma scorrendo ──
  gsap.from('.pf-title', { yPercent: 30, autoAlpha: 0, duration: 1, delay: 0.15, ease: 'power3.out' });
  gsap.from('.pf-brand', { yPercent: 60, autoAlpha: 0, duration: 0.9, delay: 0.5, ease: 'power3.out' });
  gsap.from('.pf-creature', { autoAlpha: 0, rotate: -10, duration: 1, delay: 0.7, ease: 'power2.out' });
  gsap.from('.pf-vertigine', { clipPath: 'inset(0% 0% 0% 100%)', duration: 1.2, delay: 0.35, ease: 'power2.out' });

  const cover = q('.pf-cover-scene');
  if (cover) {
    gsap.timeline({ scrollTrigger: { trigger: cover, start: 'top top', end: 'bottom top', scrub: 0.6 } })
      .to('.pf-hint', { autoAlpha: 0, duration: 0.15 }, 0)
      .to('.pf-cover-text', { yPercent: -22, autoAlpha: 0.15, duration: 1 }, 0)
      .to('.pf-vertigine img', { scale: 1.12, duration: 1 }, 0);
  }

  // ── Capitoli della storia: la scritta compare rapida entrando ──
  qa('.pf-chapter').forEach((el) => {
    const big = q('.pf-chapter-big', el);
    const small = q('.pf-chapter-small', el);
    // "Serie cinetica": scende dall'alto (da dietro la copertina) con un rimbalzo
    // allegro ma preciso, poi un riflesso luminoso attraversa il testo.
    if (big && big.classList.contains('pf-cin-hero')) {
      gsap.set(big, { autoAlpha: 0, yPercent: -170 });
      ScrollTrigger.create({
        trigger: el, start: 'top 74%',
        onEnter: () =>
          gsap.to(big, {
            autoAlpha: 1, yPercent: 0, duration: 1.05, ease: 'back.out(1.5)', overwrite: true,
            onComplete: () => big.classList.add('is-shined'),
          }),
      });
      return;
    }
    gsap.set([big, small], { autoAlpha: 0, yPercent: 26 });
    ScrollTrigger.create({
      trigger: el, start: 'top 68%',
      onEnter: () => {
        gsap.to(big, { autoAlpha: 1, yPercent: 0, duration: 0.7, ease: 'power3.out', overwrite: true });
        gsap.to(small, { autoAlpha: 1, yPercent: 0, duration: 0.6, delay: 0.14, ease: 'power3.out', overwrite: true });
      },
    });
  });

  // ── Opere: la scena SCORRE (niente stop). Le componenti entrano da direzioni
  // diverse ma MOLTO VELOCEMENTE, così lo scorrimento resta continuo. ──
  const ENTERS = ['right', 'down', 'left', 'up', 'right', 'left'];
  qa('.pf-work').forEach((el, i) => {
    const enter = ENTERS[i % ENTERS.length];
    const frame = q('.pf-work-frame', el);
    const info = [q('.pf-work-idx', el), q('.pf-work-title', el), q('.pf-work-meta', el), q('.pf-work-mat', el), q('.pf-work-philo', el)].filter(Boolean);

    gsap.set(frame, { autoAlpha: 0, ...OFF[enter] });
    gsap.set(info, { autoAlpha: 0, ...OFF[OPP[enter]] });

    ScrollTrigger.create({
      trigger: el, start: 'top 72%',
      onEnter: () => {
        gsap.to(frame, { autoAlpha: 1, xPercent: 0, yPercent: 0, duration: 0.6, ease: 'power3.out', overwrite: true });
        gsap.to(info, { autoAlpha: 1, xPercent: 0, yPercent: 0, duration: 0.5, stagger: 0.06, ease: 'power3.out', overwrite: true });
      },
    });
  });

  // ── Archivio Emozioni: la galleria si compone a gruppi scorrendo ──
  const emoItems = qa('.pf-emo-item');
  if (emoItems.length) {
    gsap.set(emoItems, { autoAlpha: 0, yPercent: 22 });
    ScrollTrigger.batch(emoItems, {
      start: 'top 88%',
      onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, yPercent: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out', overwrite: true }),
    });
  }

  addEventListener('load', () => ScrollTrigger.refresh());
}
