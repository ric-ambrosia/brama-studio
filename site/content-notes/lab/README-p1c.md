# p1c — IL TEATRO (variante Emergence)

**Rotta:** `/lab/p1c`
**File:** `src/pages/lab/p1c.astro` · `src/styles/lab/p1c.css` · `src/scripts/lab/p1c/journey.js`
**Riferimento:** emergenceprojects.com (Khoren Matevosyan)
**Feedback recepito:** «le scritte vanno eliminate tutte» + «voglio qualcosa del genere: emergenceprojects.com»

---

## L'idea

Lo schermo È l'opera. Niente titoli, niente anni, niente citazioni, niente CTA:
i disegni a pennarello del portfolio diventano una **scenografia teatrale** su campi
chiari carta-azzurrata, e le due opere materiche si **ricompongono** (motore p1b,
già approvato) dentro sezioni blu notte. Il ritmo del viaggio è l'alternanza
**chiaro-scenografia ↔ scuro-opera**, come in Emergence l'alternanza tra le
scene disegnate e le gallerie scure.

Le uniche concessioni non-disegnate:

- la **firma brama** come sigillo finale (tinta blu notte, multiply);
- una **micro-freccia di scroll** disegnata (SVG a tratto sottile), non testuale.

Le opere composte **sono esse stesse i link**: l'intero quadro è un `<a>` verso
`/opera/vertigine` e `/opera/abbandono`. Le etichette esistono solo come
`aria-label` (screen reader); un `h1` visually-hidden dà il contesto alla pagina.

## Perché NON uso il layout Base

Emergence tiene solo un puntino-logo e un hamburger. Il nostro header attuale
porta la firma in alto a sinistra e il menu: **due elementi tipografici dentro la
scena d'apertura**, proprio dove lo schermo deve essere solo teatro. Ho quindi
scelto il **documento autonomo** (consentito dal brief): `lang="it"`, meta
essenziali, favicon. Nessun font esterno caricato — la pagina non ha testo
visibile, quindi zero richieste ai font Google (il meter di debug usa i font di
sistema). Se la direzione verrà promossa a homepage, si potrà valutare un
"puntino" di navigazione disegnato (una stella che apre il menu), ma per il lab
la scena resta nuda.

## Le cinque scene

1. **La soglia** (campo `#e8ecf4`) — teatro chiaro:
   - *protagonista*: la figura coronata alla finestra con drappo a scacchi e
     bussola (`page-16`, ritagliata al vivo della cornice disegnata), pannello
     centrale sospeso sopra il pavimento;
   - *quinte*: fregio di filigrana lungo il cielo (`page-03`, banda alta,
     raddoppiata in multiply e sfumata con mask) + due quinte laterali a
     tratteggio pennarello (CSS);
   - *elementi appesi*: 6 fili verticali con stelle a 8 punte, sparkle a 4 punte
     e pianeti (SVG `<symbol>` in stile pennarello), perline lungo i fili,
     oscillazione impercettibile (±0.6–1.4°, 6–11s, alternate) — **un solo
     accento rosso**: la stella a destra;
   - *sentinella*: busto della figura alata col reticolo (`page-06`, crop
     stretto senza le lettere disegnate, bordi sfumati a mask radiale);
   - *pavimento*: fila di bulbi + scacchiera (CSS puro), micro-freccia sopra.
2. **VERTIGINE** (campo `#050a1a`) — il campo scurisce nel blu notte lungo la
   banda di respiro, poi il quadro si ricompone **a pioggia di schegge**
   (pattern `shards`, seed 20251) su pin di 165%; a composizione avvenuta lo
   swap con la foto nitida ad alta risoluzione. Tutta l'opera è link.
3. **Interludio** (campo `#dfe6f2`) — la creatura alata (`page-01`) appesa a un
   filo lungo, l'emblema lune/triangoli (`page-07`) posato nel campo vuoto con
   ombra morbida, uno sparkle rosso piccolo. Composizione rada, quasi vuota:
   il respiro tra le due opere.
4. **ABBANDONO** (campo `#050a1a`) — ricomposizione **a lastre** verticali
   (pattern `slabs`, seed 4842), stesso meccanismo.
5. **Sigillo** (campo `#e8ecf4`) — la firma, piccola, al centro. Fine.

Tra le scene: bande `.pc-fade` di 75svh. La coreografia è **incatenata**:
la scenografia dissolve (autoAlpha) → il campo cambia colore → la scena
successiva appare. Così i cut-out non incontrano mai un fondo scuro.

## Tecnica: cut-out senza pre-processing

I disegni sono china nera su carta chiara (JPG del portfolio, con testi
d'impaginato attorno). Tre mosse, tutte CSS:

1. **crop**: wrapper `overflow:hidden` con `aspect-ratio` della regione utile;
   `img` assoluta con `width/left/top` percentuali calcolate dalla regione
   (`width% = 100/(x1-x0)`, `left% = -x0/(x1-x0)`, `top% = -y0/(y1-y0)`);
2. **fondo che sparisce**: `mix-blend-mode:multiply` — il bianco della carta
   moltiplicato per il campo restituisce esattamente il campo (verificato al
   pixel: nessuna cucitura);
3. **china → blu notte**: `::after` del wrapper con `background:#0a1430` e
   `mix-blend-mode:lighten` (max per canale: il nero diventa esattamente
   `#0a1430`, il campo chiaro resta identico).

**Il trucco che rende tutto animabile:** il wrapper ha `background` = colore del
campo della scena. Il multiply si risolve così *dentro* il wrapper, quindi gli
antenati possono avere transform (parallasse GSAP, oscillazione CSS) senza
rompere il blending — il classico problema dello stacking context creato dai
transform non ci tocca.

## Note tecniche importanti (imparate sul campo, verificate con CDP)

- **Ordine di creazione degli ScrollTrigger**: i **pin vanno creati per primi**.
  I trigger creati prima di un pin non tengono conto del suo spacer e tutte le
  posizioni a valle risultano sbagliate (bug reale trovato in verifica: campi
  colore fuori sincrono di ~1500px). In `journey.js` l'ordine è: pin opere →
  preload → colori → dissolvenze → parallasse.
- **`<canvas>` è un elemento replaced**: `position:absolute; inset:…%` NON lo
  stira (resta 300×150). Servono `left/top/width/height` espliciti. ⚠️ Questo
  bug è latente anche in `p1b.css` (`.p1b-scatter` usa `inset`): là il canvas
  della ricomposizione è probabilmente renderizzato a dimensione intrinseca.
  Non ho toccato p1b (fuori perimetro), ma va segnalato.
- Il motore di ricomposizione è **importato direttamente** da
  `src/scripts/lab/p1b/recompose.js` (zero duplicazione), stessi seed e pattern
  approvati; su mobile i conteggi frammenti sono ridotti (config identiche a p1b).

## Requisiti ereditati

- **prefers-reduced-motion** → `.pc-static`: niente GSAP/Lenis, scene già
  composte, opere come immagini piene su gradiente blu notte, oscillazioni e
  freccia ferme (media query), swap alta risoluzione via IntersectionObserver.
- **no WebGL2** → `.pc-nogl`: niente canvas né pin, opere già composte, il
  resto del viaggio (colori, parallasse, dissolvenze) resta attivo.
- **no JS**: la pagina è completa e leggibile (default CSS = stato composto).
- **tastiera**: le opere-link sono gli unici elementi focusabili;
  `focus-visible` azzurro; al focus il viaggio scorre fino all'opera composta.
- **mobile**: unità `svh`, pannelli e appesi ridimensionati, 2 fili nascosti,
  frammenti ridotti; guard iOS sul resize della barra URL.
- **FPS meter** con `?debug=1` (+ `window.__pc` per ispezione dello stato).
- **niente Math.random**: oscillazioni e posizioni hand-placed nei data-attr,
  frammentazione con PRNG seedato (mulberry32) nel motore.
- immagini fuori viewport `loading="lazy"`; la protagonista e il fregio
  `fetchpriority` dedicati; swap alla risoluzione piena solo in prossimità.

## Come si estende a 9 opere

Il modulo-base è la coppia **(scena chiara → opera scura)**. Per 9 opere:

1. **Cast dei disegni**: il portfolio ha 14 tavole; ogni interludio usa 1–2
   ritagli mai visti prima (la mappa dei crop è già parametrica: bastano le
   quattro frazioni della regione). Le scene non si ripetono: si varia lo
   schema — pannello centrale / elemento appeso / oggetto posato / processione
   di figure sul pavimento.
2. **Pattern di ricomposizione per opera**: `shards` (vortici, esplosioni),
   `slabs` (campi verticali, stratificazioni); il motore accetta nuovi pattern
   con la stessa interfaccia (`verts/delay/scatter`) — es. `rings` per opere
   concentriche, `splinters` per i tagli. Un'opera = `{src, aspect, seed,
   pattern}` + una `<section class="pc-opera">`.
3. **Ritmo**: non serve un interludio per ogni opera. Suggerito: soglia → 2–3
   opere con un interludio ogni due → interludio grande a metà (l'unico con
   pavimento) → ultime opere → sigillo. I campi chiari possono alternare
   `#e8ecf4` / `#dfe6f2` per non appiattire.
4. **Accenti rossi**: sempre uno per scena chiara (mai di più), sempre su un
   elemento diverso (stella, perlina, tip della freccia).
5. **Performance**: i motori three.js vengono creati on-approach e distrutti a
   `pagehide`; con 9 opere conviene aggiungere `dispose()` quando l'opera esce
   dal viewport da un pezzo (l'interfaccia c'è già).

## Verifica effettuata

Pagina esercitata in Chrome headless via CDP (scroll programmatico + screenshot
+ probe dei valori): campi colore corretti in ogni checkpoint, ricomposizione a
schegge/lastre visivamente corretta a metà e a fine pin, swap nitido, interludio
e sigillo composti come da progetto, layout mobile verificato ai breakpoint.
