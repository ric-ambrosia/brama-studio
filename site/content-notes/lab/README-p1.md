# P1 — "FILO 2D" · prototipo del concept "Il Tratto"

Pagina: `/lab/p1` (`src/pages/lab/p1.astro`)
Moduli: `src/scripts/lab/p1/journey.js` · `src/styles/lab/p1.css`

## Approccio

- **Static-first.** Il markup è una sequenza verticale completa (hero → territorio i →
  Vertigine → territorio ii → Abbandono → firma) con tutto il testo reale nel DOM.
  Senza JS, o con `prefers-reduced-motion`, si vede questa versione curata: bande di
  carta `#f4f0e0` per i territori, pannelli-opera con targhetta, firma finale.
  Il viaggio è un enhancement: `journey.js` aggiunge `.is-journey` e ricostruisce
  la scena come mondo 2D.
- **Camera 2D simulata.** Le stazioni hanno coordinate-mondo in unità viewport
  (`data-wx` in vw, `data-wy` in vh); il JS le posiziona in px assoluti dentro
  `.p1-world`. Un unico timeline GSAP (scrub 0.85 su uno spacer di ~11 viewport,
  scroll morbido via Lenis) interpola un proxy `{x, y, rot, zoom}` tra keyframe e
  compone il transform del mondo: `translate(centro) scale(z) rotate(-r) translate(-cam)`.
  Il percorso curva davvero nel piano: rotazioni ±10°, zoom 0.9–1.36.
- **Il filo.** Un path SVG Catmull-Rom→Bézier costruito a runtime sugli stessi
  waypoint della camera; disegno progressivo con `stroke-dasharray/dashoffset`.
  Le lunghezze cumulative a ogni waypoint sono misurate a init, così la punta del
  filo (un pallino `getPointAtLength`) resta vicina al centro dello schermo.
  Rami e ciuffi di tratteggio sono generati proceduralmente (PRNG con seed fisso)
  e si disegnano al passaggio. Il colore del tratto interpola inchiostro↔chiaro
  insieme al fondo carta↔notte, quindi resta leggibile in ogni fase.
- **Ingresso nella materia.** All'arrivo su un'opera il fondo vira al navy, l'opera
  parte in bianco/nero (`grayscale(1)`) e si colora entrando; lo zoom della camera
  fa da "ingresso". Il filo passa *sotto* il pannello (z-order) e riemerge dall'altra
  parte: si immerge nella materia senza trucchi.
- **La torcia.** Il cursore/dito guida: (1) un alone fisso a schermo (`mix-blend-mode:
  screen`), (2) uno strato duplicato dell'immagine, più luminoso e saturo, mascherato
  con `radial-gradient` su CSS var `--tx/--ty` aggiornate a ogni frame. Poiché lo strato
  luminoso non è in grayscale, la torcia "accende il colore" anche durante l'ingresso b/n.
  Su **Vertigine** la striscia destra ha 14 punti-fibra: se la torcia entra nella
  striscia (`is-lit`) le fibre brillano e l'intero vortice si accende (layer screen).
  Su **Abbandono** i punti dispersi sono un layer di dot mascherato dalla stessa
  torcia; vicino al centro (`is-mirror`) appare lo specchio infinito (anelli radiali
  ripetuti + profondità animata).
- **Territori.** Texture reali dal portfolio (scelte a occhio, `images-catalog.json`
  non esisteva): `page-16.jpg` (il disegno a pennarello del re alla finestra, crop
  della metà destra) per il territorio i; `page-14.jpg` (crop di "Ansia", schizzi neri
  dispersi) per il territorio ii — carattere che anticipa l'emozione successiva.
  I crop sono fatti con contenitori `overflow:hidden` e percentuali calcolate.

## Cosa funziona

- Scroll → camera → filo sincronizzati da un solo timeline: reversibile, scrub-safe.
- Tastiera: lo spacer dà altezza reale al documento, quindi frecce/PgDn/Space
  funzionano; i CTA sono `<a>` veri e al focus il viaggio scorre fino alla loro tappa
  (`lenis.scrollTo`), quindi Tab non "perde" mai il contenuto.
- Touch: Lenis lascia lo scroll touch nativo; la torcia segue `touchmove`/`pointermove`.
- `?debug=1`: overlay mono in alto a sinistra con fps corrente e media dal load.
- Peso: opere caricate come thumb e sostituite con l'immagine piena poco prima
  dell'arrivo (preload da timeline); texture territorio `loading="lazy"` con forzatura
  `eager` quando il viaggio si avvicina (i lazy nativi dentro container trasformati
  possono essere pigri nel modo sbagliato).
- Il chrome condiviso non è toccato: nelle fasi carta una classe `p1-paper` su `<html>`
  scurisce solo le linee del burger via CSS della pagina.

## Limiti noti

- Lo zoom della camera scala testo già rasterizzato dal layout: a 1.36× su schermi
  non-retina la targhetta può risultare leggermente morbida. (Rimedio possibile:
  counter-scale della label durante l'ingresso.)
- Il flash iniziale: la pagina nasce statica e diventa viaggio al load del modulo
  (~1 frame). Accettabile per il prototipo.
- I crop delle pagine portfolio usano percentuali "magiche" tarate sulle immagini
  attuali (2304×1296): se le pagine vengono rigenerate con altri layout vanno riviste.
- `backdrop-filter` dentro un antenato trasformato può degradare su vecchi WebKit:
  la targhetta ha comunque un fondo rgba pieno, resta leggibile.
- Il cambio di `prefers-reduced-motion` a pagina aperta non è osservato (serve reload).

## Estendibilità a 9+ opere

Tutto è dato-driven: stazioni (coordinate-mondo), waypoint del filo, keyframe camera,
finestre `PAPER/TORCH/RANGES`. Per 9+ opere:
1. generare le tre liste da un array di opere (posizioni lungo una spline "master");
2. montare/smontare le stazioni fuori da una finestra di progresso (±1 tappa) per
   tenere basso il numero di layer compositi e la memoria immagini (oggi tutto è
   montato: con 2 opere è irrilevante, con 9+ no);
3. spezzare il path SVG per capitolo (un path per tratto tra due opere) così il
   `getTotalLength`/dashoffset resta su numeri piccoli;
4. le interazioni-torcia per opera sono già config per pannello (`data-opera` +
   classi): basta un registro `slug → {zone, effetto}`.
Stima: refactor di 1–2 giorni, nessun cambio di architettura.

## Rischi iOS

- Barra URL dinamica: lo stage è `fixed; inset:0` (nessun 100vh hardcoded); i resize
  di sola altezza < 160px vengono ignorati per evitare rebuild a metà scroll.
- `-webkit-mask-image` prefissato ovunque; niente API senza guard (IntersectionObserver
  e pointer events sono su iOS ≥ 13).
- `getBoundingClientRect` per frame sul solo pannello attivo: costo trascurabile.
- Da verificare su device reale: costo repaint della mask radiale che segue il dito
  sull'immagine piena di Vertigine (se serve, si limita il layer luminoso alla thumb),
  e blend `screen` su superfici molto grandi.
