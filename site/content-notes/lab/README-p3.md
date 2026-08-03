# P3 — "IBRIDO" · il tratto

Prototipo della homepage-viaggio. Pagina: `src/pages/lab/p3.astro` · moduli:
`src/scripts/lab/p3/{index,thread,torch,fps}.js` · stile: `src/styles/lab/p3.css`.

## Approccio

Tre strati, ognuno con il compito in cui rende meglio:

1. **DOM scrollabile normale** — sezioni vere (hero → territorio → opera →
   territorio → opera → firma) con tutto il testo reale nel markup. SEO,
   screen reader, tastiera e no-JS funzionano sul DOM, non sul canvas.
2. **Canvas 2D fixed (il filo nero)** — polilinea Catmull-Rom campionata su
   punti di controllo calcolati dai rect delle sezioni (coordinate mondo).
   Progresso di disegno legato alla frazione di scroll con lag elastico;
   doppio passaggio di stroke con spessore rumoroso per la grana pennarello;
   ramificazioni che gemmano al passaggio della punta; molla per la flessione
   dei punti vicini al puntatore (mouse e dito). Il filo nasce di luce sul
   navy, diventa inchiostro sulla carta, si avvita in spirale prima di
   Vertigine, cade spezzandosi prima di Abbandono, tace dentro le opere e si
   riannoda in luce attorno alla firma.
3. **WebGL solo dentro le opere (torcia)** — micro-scena three.js per opera:
   quad ortografico + shader. Lo spot segue puntatore/dito (torchmove →
   uniform); rivela i colori veri sull'opera "spenta", accende glint sui
   frammenti rossi e sulle correnti chiare (Vertigine) o punti dispersi +
   specchio infinito ad anelli al centro (Abbandono). Texture caricata lazy
   alla prima attivazione della sezione. Se WebGL manca → fallback CSS
   radial-gradient in soft-light che segue comunque il dito.

Orchestrazione: Lenis (autoRaf off) + GSAP ScrollTrigger nel ticker GSAP —
un solo rAF per filo + scrub. Le opere sono pin+scrub (`+=170%`): velo carta
→ dissolve, opera da frammento b/n ritagliato a pieno formato a colori, meta
in stagger, boost torcia. Territori: tilt di camera (rotate/y scrub),
tratteggio SVG che affiora, frammenti del quaderno (page-16, ritagli diversi
via object-position) con wipe clip-path e parallasse.

Texture territori: `page-03.jpg` (fondo a disegni sbiaditi, multiply sulla
carta #f4f0e0); frammenti da `page-16.jpg` (disegno a pennarello puro, metà
destra). Non esisteva `images-catalog.json`: scelte fatte guardando le pagine.

## Progressive enhancement / fallback

- Inline script aggiunge `p3-js` su `<html>` solo se **no**
  prefers-reduced-motion. Senza classe (no-JS o reduced-motion) il CSS è la
  versione statica curata: sequenza verticale, opere a colori piene,
  crossfade/gradients CSS tra carta e navy, nessun canvas. `initJourney` è in
  try/catch: qualunque errore rimuove la classe e ripristina lo statico.
- Tastiera: scroll nativo attraversa tutto (Lenis non intercetta i tasti);
  i CTA sono `<a>` veri; il focus su un CTA porta lo scrub del pin allo stato
  svelato (niente link "invisibili").
- FPS meter con `?debug=1` (fps corrente + media, overlay mono).

## Cosa funziona bene

- Compromesso resa/robustezza: il 95% della pagina è DOM+CSS; il canvas 2D è
  economico (ridisegna solo se progresso/fisica/anim attivi, salta i blocchi
  fuori viewport); WebGL è confinato a due piccoli quad renderizzati solo
  mentre la sezione è pinnata.
- Il filo attraversa davvero le sezioni (coordinate mondo → viewport),
  con anse attorno ai frammenti e cambio di colore per zona.
- Contenuto completo nel DOM, immagini lazy, zero librerie extra.

## Limiti noti

- Il filo tace durante i pin (scelta narrativa: "si entra nel quadro");
  se si volesse un filo visibile anche lì servirebbe ancorarlo al progress
  del pin invece che a Y-documento.
- I glint dello shader sono procedurali (hash grid guidata da luminanza/
  rossezza), non una mappa reale delle fibre: con maschere per-opera
  (PNG dei punti fibra) l'effetto diventerebbe fedele al fisico.
- `three` pesa ~160KB gz solo per due quad: in produzione conviene o raw
  WebGL (~150 righe, zero dipendenze) o riusare un solo renderer.
- Il velo carta del pin copre i CTA a inizio scrub (pointer-events: none,
  quindi nessun blocco funzionale, ma un click "cieco" è teoricamente
  possibile prima dello svelamento).

## Estendibilità a 9+ opere

Lineare: ogni tappa è (territorio + opera) con lo stesso markup; i punti di
controllo del filo sono generati dai rect via `data-thread`, quindi basta
aggiungere sezioni e una manciata di punti per territorio (o generarli
proceduralmente da un preset per-emozione: avvitamento, caduta, esplosione…).
Costi che scalano: sample del filo (~150/viewport — ok anche ×10), pin
ScrollTrigger (uno per opera, fine), texture torcia (lazy per attivazione,
quindi costante in memoria se si aggiunge `dispose()` all'uscita — da fare
oltre le ~6 opere). I territori riusano 2 sole immagini di texture.

## Rischi iOS

- Altezze: uso 100svh/dvh ovunque; la barra Safari che collassa cambia
  innerHeight → ScrollTrigger.refresh ricostruisce path e canvas (gestito).
- Lenis su iOS lascia il touch nativo (syncTouch off): il pin scatta con la
  fisica di scroll nativa — corretto ma meno "burroso" che su desktop.
- `mix-blend-mode: multiply/soft-light` su Safari: ok ma da verificare con
  la texture grande (compositing su GPU può costare su iPhone vecchi).
- WebGL: due contesti simultanei sono sotto il limite iOS (~8), ma Safari
  può perdere il contesto in background — manca un handler
  `webglcontextlost` (il fallback CSS però resta funzionante).
- DPR cap a 1.6–1.75 per canvas/renderer per non saturare la GPU retina.
