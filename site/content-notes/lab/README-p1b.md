# P1-BIS — "IL TRATTO · BLU" · variante scelta da Riccardo

Pagina: `/lab/p1b` (`src/pages/lab/p1b.astro`)
Moduli: `src/scripts/lab/p1b/journey.js` · `src/scripts/lab/p1b/recompose.js` · `src/styles/lab/p1b.css`
Base: P1 (che resta intatto su `/lab/p1` per confronto). Stesso scheletro — Lenis +
un unico timeline GSAP scrub, camera 2D simulata, filo SVG Catmull-Rom, easing
`cubic-bezier(0.32,0.72,0,1)` / CustomEase "brama", fallback reduced-motion,
FPS meter `?debug=1` — con le tre variazioni chieste.

## Le tre variazioni

1. **Palette brand, niente carta.** Le fasi carta↔notte di P1 sono sostituite da un
   respiro blu notte `#050a1a` ↔ blu profondo `#0a1430` (stesse finestre temporali,
   proxy `env.deep`). Il filo è azzurro (`#5ea0ec` → `#9cc8ff` nei territori, con
   drop-shadow luminoso); tre ramificazioni sono rosse `#c8281c` (flag `red` in
   `BRANCHES`). Le pagine b/n del portfolio restano come materia grafica ma
   reinterpretate: `invert(1)` + `mix-blend-mode: screen` su fondo `#0b1631` +
   velo `multiply` azzurro → tratto azzurro elettrico su notte; nastro carta → rosso.
   Corsivi emotivi in rosso chiaro `#e2544a` (leggibile su scuro). Firma finale
   tintata cyan (`--sig-tint` dei token).
2. **Niente torcia.** Rimossi alone, pointer-tracking, layer `lit/glow/fibre/punti/
   mirror`, finestre `TORCH`, `cursor:none`. Le opere, una volta composte, sono
   l'immagine piena e vivida (nessun grayscale d'ingresso).
3. **Ricomposizione su scroll** — la nuova interazione firma, in `recompose.js`.

## Il motore di ricomposizione (`recompose.js`)

- **Architettura.** `createRecomposer({canvas, frame, src, aspect, seed, pattern})`
  → `{setProgress(0..1), resize(), dispose(), isReady()}`. Un renderer three.js per
  opera, **render on-demand**: si disegna un frame solo quando il progress cambia
  (scrub) o al resize — niente RAF continuo, costo ≈ 0 quando non si scrolla.
- **Frammenti = pezzi veri del quadro.** Il piano-quadro (alto 1 unità mondo, largo
  `aspect` reale dell'immagine) è partizionato in poligoni; ogni frammento è una
  mesh centrata sul proprio centroide con UV che mappano la porzione corrispondente
  della texture → nitido, nessuna distorsione (il `.p1b-frame` ha `aspect-ratio`
  identico all'immagine). Tiling perfetto verificato (somma aree = 1.000000).
- **Canvas più grande del telaio.** Il canvas è assoluto con inset negativi attorno
  al `.p1b-frame` (aria sopra per la pioggia di Vertigine, ai lati per le lastre di
  Abbandono); la PerspectiveCamera (fov 38) è posizionata leggendo gli offset DOM
  così che il frustum copra il canvas e il piano coincida esattamente col telaio.
  I frammenti più dispersi entrano da fuori-canvas: effetto "arrivano da lontano".
- **Scrub.** `journey.js` anima due proxy `recProg.{vert,abb}.v` 0→1 nel timeline
  (finestre `RECWIN`: Vertigine 3.45–4.8, Abbandono 7.75–8.95, ease none) e li passa
  a `setProgress` in `applyFrame`. Scrollando indietro il quadro si **scompone** di
  nuovo, gratis. Per-frammento: `delay` di stagger (55% del progress), posizione con
  `easeOutBack` (c=1.1, overshoot ~6% = il "settle" quando la scheggia si posa),
  rotazioni 3D con `easeOutCubic`.
- **Bordi luminosi.** Ogni frammento ha un `LineLoop` di contorno (z +0.002):
  azzurro `#6fb0ff`, o rosso `#d83a2e` per un sottoinsieme deterministico
  (Vertigine ha schegge di vetro rosse reali; `redRatio` 0.13 / 0.09). L'opacità
  è `(1−lp)·0.8`: acceso in volo, spento a quadro composto.
- **Swap invisibile.** A `v > 0.995` il pannello riceve `.is-composed`: il canvas
  sfuma a 0 e sotto c'è la `<img>` (già swappata alla risoluzione piena, preload dal
  timeline come in P1) → il resto della tappa è un'immagine nitida, il canvas resta
  ma non ridisegna (guard su progress invariato).
- **Determinismo.** Tutto il random è `mulberry32` con seed fisso per opera
  (20251 / 4842): stessa pioggia a ogni reload.

## Parametri di frammentazione per opera

| | Vertigine | Abbandono |
|---|---|---|
| pattern | `shards` (schegge triangolari) | `slabs` (lastre orizzontali) |
| griglia desktop | 9×7 warpata → **126 schegge** | 22 righe × 2–4 tagli → **63 lastre** |
| griglia mobile (<720px) | 6×5 → **60** | 13 righe × 1–3 → **28** |
| bias | radiale attorno al vortice `center:[0.5,0.52]`, `gamma:2.1` (celle più piccole/fitte verso il centro, via warp con derivata→0 nel centro) | tagli e bordi riga jitterati (0.55/rows), condivisi tra vicini → nessuna fessura |
| scatter | dall'alto come pioggia: py 0.5–1.7 H, px ±0.58 W, pz 0.08–0.5, rotazioni piene (rz fino a ±2.2 rad) | dai lati e dall'alto: px ±(0.45–1.3) W con lato alternato, py 0.22–0.97, rotazioni contenute (lastre quasi piatte) |
| ordine di posa | dal centro del vortice verso fuori (`delay ∝ 0.72·dist + 0.28·rnd`) | dal basso verso l'alto (`delay ∝ 0.78·quota + 0.22·rnd`) |
| texture | `thumbs/Vertigine-1200.jpg` (aspect reale 2427/1612) | `thumbs/Abbandono-600.jpg` (785/1600) |

## Robustezza

- **DPR cap 2**, `antialias:true`, `setSize(..., false)` (lo stile lo governa il CSS).
- **Resize**: `build()` di journey richiama `rec.resize()` (rilegge offset DOM,
  riposiziona camera, ridisegna); micro-resize barra URL iOS ignorati come in P1.
- **Dispose** su `pagehide`: geometrie, materiali (incluse le LineBasicMaterial
  per-frammento), texture, renderer.
- **Fallback**: three r170 richiede WebGL2 → `webglAvailable()` testa `webgl2` su un
  canvas separato; se assente, classe `p1b-nogl` sul root: canvas nascosti, `<img>`
  sempre visibili (crossfade CSS), viaggio e testi intatti. Con
  `prefers-reduced-motion` niente viaggio: sequenza verticale statica, opere già
  composte, tutto il contenuto (titolo, anno, materiali, citazione, CTA) nel DOM.
- **Texture**: `LinearFilter` senza mipmap (resa ~1:1, meno memoria/shimmer),
  `SRGBColorSpace`.
- Tastiera (spacer reale + `data-focus-t` sui CTA) e touch (scroll nativo via Lenis)
  come in P1; stage `fixed; inset:0`, nessun 100vh hardcoded (svh solo su altezze
  dei telai).

## Estensione alle altre 7 opere

- Il motore è già per-opera e config-driven: basta una entry in `RECONF`
  (`src`, `aspect`, `seed`, `pattern`). I due pattern coprono famiglie diverse;
  nuovi pattern (es. strappi verticali, coriandoli di carta per le opere su carta,
  gocce per Depressione) sono una funzione `verts[] + scatter + delay` ciascuno
  (~40 righe), tutto il resto (mesh, camera, scrub, bordi, dispose) è condiviso.
- In `journey.js` servono per opera: stazione (coordinate mondo), finestra `RECWIN`,
  finestra `RANGES`, un waypoint testo e un `PRELOAD`. Come per P1, con 9 opere
  conviene generare WPS/CAMS/finestre da un array di tappe lungo una spline master.
- Budget: con render on-demand i costi si pagano solo durante lo scrub della tappa;
  ~130 draw call (mesh + contorni) per opera attiva sono tranquilli. Con 9 opere
  conviene però **dispose/rebuild a finestra** (creare il recomposer a ±1 tappa,
  distruggerlo uscendo) — l'hook c'è già (`ensureRec` è lazy, manca solo il
  `dispose` all'uscita dalla finestra): ~1 giorno di lavoro.

## Limiti noti

- Durante lo zoom camera (fino a 1.34×) il canvas è scalato via CSS: le schegge in
  volo possono risultare un filo morbide su schermi non-retina; a quadro composto
  c'è comunque lo swap alla `<img>` piena. (Rimedio possibile: moltiplicare il DPR
  del renderer per lo zoom corrente.)
- Le lastre di Abbandono usano la thumb 600px come texture: in volo è più che
  sufficiente, e a riposo subentra l'immagine piena. Se si genera una
  `Abbandono-1200.jpg` basta cambiare `src` in `RECONF`.
- Un contorno `LineLoop` + material per frammento = tante piccole material; ok a
  queste quantità, per 9+ opere valutare un unico `LineSegments` con vertex-alpha.
- Il flash statico→viaggio al load (~1 frame) è lo stesso di P1.
- Il cambio di `prefers-reduced-motion` a pagina aperta richiede reload (come P1).
- I crop delle pagine portfolio ereditano le percentuali "magiche" di P1 (tarate
  sulle immagini attuali 2304×1296).
