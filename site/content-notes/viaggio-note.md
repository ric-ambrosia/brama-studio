# Il Viaggio — architettura della homepage

File: `src/pages/index.astro` · `src/styles/viaggio.css` ·
`src/scripts/viaggio/{journey.js, menu.js}` · motore riusato:
`src/scripts/lab/p1b/recompose.js` (approvato, non duplicato).
Direzione artistica di riferimento: `content-notes/art-direction.md`.

---

## 1. Struttura

Scroll verticale continuo, percepito come scene discrete (rif. emergenceprojects.com):

```
SOGLIA          chiara — figura coronata alla cornice-finestra, fregio,
                appesi, quinte tratteggiate, micro-freccia disegnata
per ogni opera journey.order 1–8 (le 8 con fotografia):
  RESPIRO       .vg-fade (il campo colore cambia qui)
  TERRITORIO    100svh — scenografia a inchiostro dedicata (asset Ciclo A),
                aria-hidden, mai la stessa composizione due volte
  RESPIRO
  OPERA         100svh pinnata (+165%) — ricomposizione a scrub reversibile,
                didascalia che affiora a opera composta, link a /opera/<slug>
TAPPA 9         scena-meccanismo (avventura-di-una-vita, senza foto):
                clessidra che ruota lenta (CSS), campo scuro→chiaro a scroll
                (sticky stage in una sezione da 190svh), etichetta stato
SIGILLO         notte — sigillo rosso + firma che si posa + due porte
                (Shop / Manifesto) come emblemi araldici con etichetta micro
```

Le tappe si generano da `getCollection('works')`: `journey.featured` +
`journey.order`, ordinate. **Titolo, anno, interaction e stato vengono sempre
dalla collection**, mai hardcodati. Un'opera senza `images.main` diventa
scena-meccanismo (oggi solo avventura-di-una-vita).

## 2. Il campo colore unico

Un solo colore di fondo: il `background` del root `.vg`, scrubbato da GSAP
lungo i respiri `.vg-fade` (`data-from` → `data-to`). Le sezioni portano il
proprio campo in `--field` inline: in journey sono trasparenti (dipinge il
root), senza JS / reduced-motion dipingono da sé e i respiri diventano
gradienti CSS (`--fa`/`--fb`). Ritmo (da art-direction §3): soglia chiara,
Vertigine+Abbandono scuri (la discesa), Fuggire/Lasciarti chiari,
Pugno+Depressione scuri (il fondo), Mike/Lu chiari, Avventura scuro→chiaro,
sigillo notte. Le opere si ricompongono **sempre** su blu notte `#050a1a`.

## 3. Asset a inchiostro (Ciclo A)

Tutti in `/public/viaggio/*.png`, nero puro su trasparente. La tinta la dà il
CSS, mai il file: `.vg-ink` = `background: currentColor` + `mask: var(--m)`.
Registro: scena scura → azzurro `#4a93e6` (Abbandono più spento `#6e88b8`),
scena chiara → inchiostro `#0a0a0a`, rosso `#c8281c` max un accento per scena
(stella della soglia, cuore del vortice, sigillo-emblema che è rosso di
default). Il fregio è `repeat-x` (mai stirato), gli appesi pendono da fili di
1px in CSS con dondolio ±~1° (fermato da reduced-motion), il pavimento a
scacchi è un tile mascherato con `perspective() rotateX()`.

## 4. Ricomposizione

Motore `createRecomposer` di lab/p1b via import. Pattern per opera (regola:
orizzontali/quadrate → `shards`, verticali → `slabs`), seed deterministici,
config desktop/mobile serializzate build-time in `data-rec` sulla sezione
(la mappa `REC` in index.astro; vertigine/abbandono con i valori approvati in
lab). **Max 2 canvas WebGL vivi**: trigger di prossimità (`top 150%` /
`bottom -150%`) creano e distruggono i recomposer, con coda LRU di sicurezza
(`journey.js`). Swap alla foto piena (`data-full`) al preload della tappa.

## 5. Navigazione e accessibilità

- Punto-logo (firma mascherata) + hamburger fissi, `mix-blend-mode:
  difference`: scuri su carta, chiari su notte senza JS. Overlay menu notte
  con le voci di `NAV` (lib/site) + Instagram/email; Escape chiude, il menu
  aperto ferma Lenis (evento `vg:menu`).
- Territori `aria-hidden` (pura scenografia); ogni opera è un link con
  aria-label descrittivo; il focus da tastiera porta il viaggio all'opera
  composta; didascalie nel DOM sempre (affiorano con `.is-composed`).
- `prefers-reduced-motion`: niente Lenis/GSAP/animazioni, ogni scena dipinge
  il suo campo, didascalie visibili, swap foto via IntersectionObserver.
- Niente WebGL2 → `.vg-nogl`: opere già composte, didascalie visibili.
- Redirect QR `#<slug>` → `/opera/<slug>` inline nell'head (slug embedded
  build-time). FPS meter con `?debug=1` (`window.__vg` per l'ispezione).

## 6. Come aggiungere una tappa

1. Nel frontmatter dell'opera: `journey: { featured: true, order: N }`
   (+ `images.main`, `interaction` se c'è).
2. Genera thumbs/varianti e rigenera `content-notes/images-catalog.json`
   (stessa pipeline delle altre opere): il Viaggio legge da lì.
3. In `index.astro`: aggiungi la voce in `REC` (pattern per orientamento,
   seed nuovo e fisso) e in `TERR` (campo, modo chiaro/scuro, elementi della
   scenografia col vocabolario `ink | hang | raw | floor`); una riga in
   `DESC` per lo screen reader.
4. In `viaggio.css`: posiziona i nuovi elementi (sezione TERRITORI) — mai la
   stessa composizione di un'altra scena, un solo protagonista, eventuale
   rosso uno al massimo.
5. Rispetta il ritmo chiaro/scuro (mai più di due scene consecutive uguali,
   salvo le eccezioni volute) e verifica `?debug=1` che i canvas vivi restino ≤2.

Un'opera `coming-soon` senza foto non richiede i punti 2–3 (REC): diventa
scena-meccanismo — oggi il markup della scena è dedicato alla clessidra; per
un secondo meccanismo servirà generalizzare quella sezione.
