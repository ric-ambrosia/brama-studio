# P2 — "Camera nel mondo" (`/lab/p2`)

Prototipo del concept **Il Tratto**: una camera Three.js percorre una
`CatmullRomCurve3` reale attraverso un mondo 3D — territori di disegno in
bianco/nero (carta `#f4f0e0` + inchiostro `#0a0a0a`) tra le opere, ingresso
nella materia con "torcia" interattiva — fino al nodo finale con la firma.

## File

- `site/src/pages/lab/p2.astro` — pagina (layout Base con `bare`), contenuto
  testuale reale nel DOM in entrambe le modalità.
- `site/src/scripts/lab/p2/main.js` — entry: rilevazione modalità, Lenis,
  overlay DOM, torcia DOM, FPS meter (`?debug=1`), cleanup su `pagehide`.
- `site/src/scripts/lab/p2/world.js` — scena: curva camera con mappa
  progress→u a plateau (dwell davanti alle opere), filo nero `TubeGeometry`
  rivelato via `drawRange` + ramificazioni, territori (pareti/pavimenti carta,
  tratteggio procedurale, carte ritagliate dalle pagine portfolio), opere con
  `ShaderMaterial` "torcia" (fog manuale nello shader), particelle, dispose.
- `site/src/scripts/lab/p2/doodles.js` — texture canvas "a pennarello"
  (tratteggio, trattini cadenti, 3 frammenti) + `cropCanvas` per ritagliare le
  regioni di portfolio senza caricare in GPU l'intera pagina.
- `site/src/scripts/lab/p2/timeline.js` — finestre di progress condivise.
- `site/src/styles/lab/p2.css` — stile di entrambe le modalità.

## Scelte sulle pagine portfolio

`images-catalog.json` non esisteva; ho guardato `page-10..16`:

- **page-14** → crop dei pannelli b/n **"Ansia"** (px 1763,73,364×470) e
  **"Frustrazione"** (labirinto, px 1256,73,372×471): territorio I, l'angoscia
  che precede la *vertigine della libertà* di Kierkegaard.
- **page-16** → crop del disegno a pennarello (figura coronata affacciata,
  px 1300,12,946×1272): territorio II, prima di *Abbandono* (Geworfenheit).

## Cosa funziona

- Scroll (Lenis, tastiera nativa, touch) → progress 0..1 → posizione camera
  sulla curva; lookAt smorzato che si aggancia alle opere; bank sottile in
  curva; "respiro" di camera che si calma nei dwell.
- Mondo che vira navy↔carta (background+fog) nei territori; il filo nero si
  disegna poco più avanti della camera.
- Torcia: raycast puntatore→UV, spot + glint; su *Vertigine* shimmer a spirale,
  su *Abbandono* punti dispersi + specchio infinito al centro; autopilota lento
  quando il puntatore è fermo/assente (utile su touch prima del primo tocco);
  alone DOM `mix-blend-mode: screen`.
- Fallback completo: senza JS, senza WebGL o con `prefers-reduced-motion` la
  stessa pagina è una sequenza verticale statica (nessun canvas), immagini
  lazy, CTA veri. `?debug=1` mostra fps corrente/medio (+ progress in journey).
- Texture in due fasi: territorio I + Vertigine subito; page-16 + Abbandono a
  progress > 0.28 o dopo 8 s. Fade-in morbido su ogni texture caricata.
- DPR cap a 2, resize/orientation, dispose completo, `100svh` per iOS.

## Limiti noti

- I plateau della mappa progress→u sono tarati a mano; con contenuti diversi
  vanno ricalibrati (o generati da un piccolo DSL di tappe).
- Nessuna gestione di `webglcontextlost` (raro su pagina singola; da aggiungere
  in produzione).
- L'occlusione del filo dietro le opere sfrutta il depth-write del piano opera
  anche a texture non caricata: voluto, ma da ricordare se si cambia l'ordine.
- Il crop statico CSS delle pagine portfolio usa percentuali fisse: se le
  scansioni cambiano risoluzione/inquadratura vanno aggiornate (in un punto
  solo per modalità).

## Estendibilità a 9+ opere

Buona: il mondo è una lista di tappe (waypoint camera + ancora opera + finestra
di progress). Con 9 opere conviene: 1) generare `camPts`/`threadPts`/finestre da
un array dati; 2) streaming dei segmenti (creare/distruggere carte e opere
oltre ±2 tappe dalla camera, il fog già copre il pop-in); 3) un solo materiale
opera condiviso con uniform per modalità. Il costo per tappa è ~3 draw call:
20-30 tappe restano realistiche. Lunghezza track: ~100vh a tappa + territori.

## Rischi iOS

- Barra indirizzi dinamica: canvas su `100svh` e resize gestito; possibile
  1 frame di stretch durante il collasso della barra (accettabile).
- `backdrop-filter` dei pannelli: ok da iOS 15 con prefisso (incluso); il
  pannello ha comunque un fondo scuro leggibile senza blur.
- Memoria GPU: quattro texture ~2K + canvas; con 9+ opere serve lo streaming
  di cui sopra e/o thumbs 1200 come `uMap` su viewport piccoli.
- `mix-blend-mode: screen` dell'alone è economico ma va verificato su Safari
  vecchi: se assente l'alone resta comunque gradevole (solo più tenue).
