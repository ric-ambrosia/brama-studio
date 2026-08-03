// P2 — "camera nel mondo": timeline condivisa (progress 0..1 dello scroll).
// Ogni finestra è [inizioFadeIn, fineFadeIn, inizioFadeOut, fineFadeOut].

export const WIN = {
  // sezioni DOM
  intro: [-1, -0.5, 0.02, 0.085],
  cap1: [0.13, 0.175, 0.25, 0.295], // caption territorio I
  pv: [0.415, 0.455, 0.525, 0.565], // pannello Vertigine
  cap2: [0.6, 0.645, 0.685, 0.73], // caption territorio II
  pa: [0.785, 0.82, 0.885, 0.918], // pannello Abbandono
  fin: [0.93, 0.968, 2, 3],

  // finestre mondo (colore carta, torcia, lookAt)
  terr1: [0.09, 0.15, 0.27, 0.34],
  vert: [0.375, 0.43, 0.53, 0.58],
  terr2: [0.565, 0.62, 0.7, 0.755],
  abb: [0.745, 0.8, 0.89, 0.925],
};

export const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function smoothstep(a, b, x) {
  if (b <= a) return x >= a ? 1 : 0;
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

// campana morbida dentro la finestra [a,b,c,d]
export const bump = (w, x) => smoothstep(w[0], w[1], x) * (1 - smoothstep(w[2], w[3], x));
