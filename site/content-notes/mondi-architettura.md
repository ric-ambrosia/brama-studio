# MONDI — Architettura del motore della home (v2)

> CONTRATTO VINCOLANTE. Ogni agente che tocca la home legge questo file e lo segue alla lettera.
> Mandato di Riccardo: farfalla+vortice della v1 come hero (molto migliorati), NIENTE frammenti
> (il motore recompose resta solo in /lab), opere INTERE, un AMBIENTE 3D per opera, scroll =
> viaggio immersivo dentro le opere, sfondi che cambiano bene, tutto tridimensionale.
> Requisito numero uno: SCROLLING FLUIDO. Se una feature costa fluidità, si taglia la feature.

---

## 0. File e responsabilità

```
site/src/scripts/mondi/
  engine.js            ← motore: renderer, scroll, timeline, transizioni, lifecycle, captions, debug
  hero.js              ← ambiente "soglia" (segmento 0): vortice + farfalla. Stesso contratto degli ambienti.
  ambienti/
    vertigine.js  abbandono.js  fuga.js  ti-devo-lasciare.js  pugno-nel-tempo.js
    depressione.js  la-casa-di-mike.js  lu.js  avventura-di-una-vita.js
  lib/
    prng.js            ← mulberry32(hashString(slug)) — UNICA fonte di casualità
    noise.js           ← simplex/curl noise seedato (per ali farfalla, pulviscoli)
    fit.js             ← fitDistance(), texture cache/loader condiviso
    veil.js            ← shader/pass della transizione tra ambienti
site/src/styles/mondi.css
site/src/pages/index.astro   ← track DOM + fallback statico + canvas + captions. PRESERVA lo
                               script inline del redirect QR (#slug → /opera/<slug>) IN TESTA, invariato.
```

Menu: si riusa `src/scripts/viaggio/menu.js` così com'è (punto-logo + hamburger). Emette
`vg:menu {detail:{open}}`: l'engine DEVE ascoltarlo e fare `lenis.stop()/start()`.

Regole trasversali (non negoziabili):
- Nessun `Math.random` non seedato: solo `ctx.prng` (per-slug) o `lib/prng.js`.
- Nessun testo transitorio ("loading…", "scroll down" testuali). Le uniche parole a schermo:
  didascalie opere (titolo + anno + riga interaction) e voci di menu.
- Palette globale: blu notte `#050a1a`/`#0a1430`, azzurro `#4a93e6`, rosso `#c8281c` RARO.
  Font: Fraunces/Cormorant per titoli, Inter Tight testo, JetBrains Mono per anno/dati.
- Hot reload attivo: scrivere SEMPRE file sintatticamente validi, mai stati intermedi rotti.

---

## 1. MOTORE — engine.js

### 1.1 Renderer
- UN solo `WebGLRenderer`, canvas `position:fixed; inset:0`, `z-index` sotto UI/captions.
- `antialias:false` + risoluzione DPR-cappata (desktop `min(devicePixelRatio,2)`, mobile `1.5`,
  tier low `1.25`). `powerPreference:'high-performance'`. Colori: `outputColorSpace = SRGBColorSpace`,
  tone mapping ACESFilmic, exposure 1.0.
- Una `PerspectiveCamera` unica, FOV 50 desktop / 58 mobile (portrait), near 0.1 far 60.
  LA CAMERA È DELL'ENGINE. Gli ambienti NON toccano mai camera, renderer o scene altrui.

### 1.2 Scroll e timeline
- Track DOM: `<div id="mondi-track">` alto `HERO_SVH + 9 × SEG_SVH + CODA_SVH` =
  `200 + 9×250 + 60 = 2510svh`. Scroll nativo del documento pilotato da Lenis
  (`lerp:0.09` desktop, `0.12` touch, `syncTouch:true`).
- Progress globale `G = scrollY / (trackHeight − innerHeight)` ∈ [0,1].
  Segmenti in unità-scroll: hero pesa 0.8 segmenti, ogni opera 1, coda 0.24.
  L'engine espone `segmentOf(G) → {index, p}` con `p` progress locale 0–1.
- Doppio smoothing (Lenis + camera): la camera insegue il target con damping esponenziale
  `pos += (target−pos) × (1 − exp(−λ·dt))`, `λ = 5.5`. MAI assegnazioni secche di posizione
  camera su scroll. dt clampato a 48ms.
- Pointer: normalizzato −1..1, smoothato (λ=3). Su desktop dà parallasse camera max ±0.18
  unità + tilt ±1.2°. Su touch: NESSUN parallasse da pointer (il tocco è solo scroll).
- Snap gentile OPZIONALE (default ON desktop, OFF touch): quando `|velocity| < 0.05` e
  `p` del segmento corrente ∈ [0.42, 0.58] ma ≠ 0.5±0.02, `lenis.scrollTo` verso p=0.5 con
  easing 900ms; QUALSIASI input utente (wheel/touch/key) lo cancella immediatamente.

### 1.3 Sotto-fasi di ogni segmento-opera (p locale 0–1)
```
0.00–0.30  avvicinamento   l'ambiente domina, l'opera è lontana/piccola, in avvicinamento
0.30–0.42  arrivo          l'opera cresce fino al pieno, l'ambiente si calma
0.42–0.58  momento-opera   DWELL: opera intera davanti alla camera (~70–80% viewport),
                           camera quasi ferma (solo micro-drift ≤0.02u + parallasse pointer),
                           didascalia visibile, click attivo, snap opzionale qui
0.58–0.72  attraversamento la camera SUPERA l'opera (le passa accanto/oltre il bordo,
                           mai attraverso la texture), l'ambiente riprende moto
0.72–1.00  varco           l'uscita di questo mondo È l'ingresso del prossimo (vedi 1.4)
```
Engine passa agli ambienti `phase: 'approach' | 'dwell' | 'exit'` già calcolata
(approach ≤0.42, dwell 0.42–0.58, exit >0.58) oltre al `p` continuo.

### 1.4 Transizione tra ambienti — tecnica UFFICIALE: "varco a velo" (dual-RT crossfade)
- Ogni ambiente vive nella SUA `THREE.Scene` con la SUA fog/background. Due mondi non
  condividono MAI oggetti: zero contaminazione per costruzione.
- Finestra di handover: `p ∈ [0.72, 1.0]` del segmento N ≡ `p ∈ [0, 0.28]` di N+1 (mappa
  lineare `k = (p−0.72)/0.28`). SOLO dentro questa finestra l'engine renderizza le due scene
  su due render target a mezza risoluzione del canvas e le compone con il pass `veil.js`:
  fullscreen quad, mix guidato da `k` con curva smoothstep + un velo di colore che invade:
  la scena N dissolve VERSO `colors.exit` di N, la N+1 emerge DA `colors.entry` di N+1.
- VINCOLO DI CONTINUITÀ (handshake cromatico): `colors.exit` di N e `colors.entry` di N+1
  DEVONO essere lo stesso colore (tabella al §4 — valori vincolanti). Così anche a metà
  blend lo schermo è coerente: un passaggio di buio/colore, mai due mondi sporchi a metà.
- Fuori dalla finestra: si renderizza UNA sola scena, direttamente a schermo (niente RT).
- Tier low/mobile-basso: variante economica "velo semplice" — nessun doppio render: la scena
  N sfuma nel colore-varco (quad colore sopra), swap di scena a k=0.5, la N+1 emerge dal
  medesimo colore. Stessa grammatica visiva, metà costo.
- Durante il dwell dell'opera N l'engine fa già girare `update` di N+1 a progress 0 con
  render disattivato per 2–3 frame (warm-up shader: evita jank alla prima comparsa).

### 1.5 Ordine dei segmenti
`0 soglia (hero) → 1 vertigine → 2 abbandono → 3 fuga → 4 ti-devo-lasciare →
5 pugno-nel-tempo → 6 depressione → 7 la-casa-di-mike → 8 lu → 9 avventura-di-una-vita → coda`
(= `journey.order` 1–9 della collection works). Coda: dissolvenza al blu notte, punto-logo,
link Portfolio/Archivio/Contatti in DOM. La transizione hero→vertigine è privilegiata: il
vortice dell'hero E il tunnel di vertigine sono parenti stretti (stesso blu, stesso moto
rotatorio) — deve sembrare che il vortice 2½D dell'hero SI APRA in profondità e diventi il
tunnel. È il biglietto da visita del sito: curarla più di ogni altra.

### 1.6 Opera-plane (creato dall'ENGINE, uguale per tutti)
- L'opera è SEMPRE un piano texture INTERO ad alta qualità. MAI frammentazione, MAI
  ricomposizione. Ammessa solo lieve profondità: curvatura via vertex shader ≤ 0.03 unità
  e/o max 3 strati di parallasse (opera + 1–2 layer ambiente davanti/dietro).
- Geometria: plane 64×64 segmenti, aspect = aspect reale dell'immagine, altezza 2.4 unità
  (lato lungo 2.4; convenzione unità §2.2). Cornice: bordo emissivo sottile opzionale
  definito dall'ambiente, spento fuori dal dwell.
- Texture: da `/images/gen/` (WebP/AVIF convertiti) se esiste, altrimenti `/images/thumbs/
  <nome>-1200`; lato max 2048 desktop / 1408 mobile, `generateMipmaps:true`, anisotropy 4.
  ECCEZIONE avventura-di-una-vita: niente foto → texture `/viaggio/avventura-clessidra.webp`
  (fallback .png), materiale con `transparent:true` (alpha del disegno), stessa metrica.
- Posizione: origine locale del modulo `(0, 0, 0)`, fronte verso +Z. A `p=0.5` l'engine
  pone la camera a `fitDistance(plane, 0.75)` (helper in `lib/fit.js`: distanza per cui il
  piano riempie il 75% del viewport sul lato vincolante) sull'asse del piano.
- Click → `/opera/<slug>`: NIENTE raycast. La didascalia DOM (vedi 1.7) è un `<a>` che
  durante il dwell copre l'area proiettata del piano (l'engine aggiorna il rect via
  `Vector3.project()` solo in dwell). Accessibile da tastiera, cursor pointer.

### 1.7 Didascalie
- Markup in index.astro (server-rendered, per-opera):
  `<a class="mondo-caption" href="/opera/<slug>"><h2>Titolo</h2><span class="anno">2025</span>
  <p class="interaction">…riga interaction dalla collection…</p></a>`
  SOLO titolo + anno + interaction. Niente altro testo.
- Affiora quando l'opera è piena davanti alla camera: engine aggiunge `.is-visible` quando
  `phase==='dwell'` e `|velocity|<0.1`; fade CSS 500ms, translateY 12px→0. Sparisce a fine dwell.
- Posizione: sotto/di fianco al piano secondo aspect (landscape → sotto; portrait → destra
  su desktop, sotto su mobile).

### 1.8 Debug e misura
- `?debug=1`: overlay JetBrains Mono con FPS (media 30 frame), tier, segmento+p, draw calls
  (`renderer.info.render.calls`), triangoli, ambienti live/parked, memoria texture.
- Auto-tier: si parte dal tier stimato (vedi §6); se la media FPS dei primi 90 frame di
  scroll attivo < 45 → scendi di un tier (una sola volta, mai risalire in sessione).

---

## 2. CONTRATTO MODULO AMBIENTE — ambienti/<slug>.js

### 2.1 Forma del modulo
```js
export default {
  id: 'vertigine',                       // = slug opera
  colors: {                              // VINCOLANTI, dalla tabella §4
    entry: '#06102c',                    // colore da cui il mondo emerge
    exit:  '#030308',                    // colore in cui il mondo dissolve
    fog:   '#0a1430',                    // fog/background della scena
  },
  async init(ctx) { …; return handle },  // costruisce il mondo NELLA ctx.scene
  update(handle, frame) { … },           // pura funzione di frame, niente allocazioni
  dispose(handle) { … },                 // libera TUTTO (geometrie, materiali, texture proprie)
};
```

### 2.2 `ctx` (fornito da engine a `init`) — contenuto ESATTO
```js
ctx = {
  scene,        // THREE.Scene del modulo, vuota tranne operaPlane. Il modulo aggiunge qui.
  operaPlane,   // Mesh dell'opera già creato/posizionato dall'engine a (0,0,0) fronte +Z.
                // Il modulo PUÒ: aggiungere luci che lo illuminano, bordo emissivo, layer
                // parallasse. NON PUÒ: muoverlo, scalarlo, sostituire la texture, frammentarlo.
  camera,       // READ-ONLY (per billboard/LOD). Mai modificarla.
  loadTexture,  // (url) => Promise<Texture> — loader+cache CONDIVISO (lib/fit.js). Unico
                // modo ammesso di caricare texture (dedup + conteggio memoria).
  palette,      // { notte:'#050a1a', notte2:'#0a1430', azzurro:'#4a93e6', rosso:'#c8281c',
                //   carta:'#f4f0e0' } — token globali
  viewport,     // { w, h, aspect, dpr } — aggiornato dall'engine al resize (stesso oggetto)
  quality,      // { tier:'high'|'mid'|'low', maxParticles, maxDrawCalls, maxTexSize }
  prng,         // mulberry32 seedato con hash(slug): () => [0,1). UNICA casualità ammessa.
  assets,       // { ink:(nome)=>'/viaggio/<nome>.webp|png' } — helper path asset inchiostro
};
```

### 2.3 `frame` (passato a `update`) — contenuto ESATTO
```js
frame = {
  progress,        // p locale 0–1 nel segmento (già smoothato dal damping camera)
  globalProgress,  // G 0–1 sull'intero viaggio
  phase,           // 'approach' | 'dwell' | 'exit'
  time, dt,        // secondi; dt clampato ≤ 0.048
  pointer,         // { x, y } smoothati −1..1 (0,0 su touch)
  velocity,        // velocità scroll normalizzata (unità: segmenti/secondo, con segno)
  quality,         // come ctx.quality (il tier può scendere a runtime)
}
```

### 2.4 Convenzioni spaziali (per TUTTI gli ambienti)
- 1 unità ≈ 1 metro percepito. Contenuto disposto lungo l'asse Z locale: la camera entra
  da `z = +D` (D ≈ 10–14 dichiarato dal mondo) e avanza verso `z ≤ 0`. È l'ENGINE a
  muovere la camera lungo questo binario (con curve/offset propri per fase); il modulo
  costruisce il mondo attorno al binario, con l'opera a z=0.
- A `p=0.5` la camera è a `fitDistance(opera, 0.75)` davanti al piano (engine). Il mondo
  deve reggere visivamente da ogni z del binario (no backfaces vuote sull'asse).
- Verticalità/discese (es. abbandono) si OTTENGONO con l'orientamento del contenuto e
  camera-roll suggerito (il modulo può chiedere all'engine `handle.cameraHints = {roll, …}`
  — unico canale ammesso per influenzare la camera, valori clampati dall'engine).

### 2.5 Budget per tier (HARD CAP, verificati con ?debug=1)
| tier  | draw calls/ambiente | particelle GPU | luci dinamiche | tex ambiente |
|-------|--------------------:|---------------:|---------------:|-------------:|
| high  | ≤ 40                | ≤ 12.000       | ≤ 3            | ≤ 2048px     |
| mid   | ≤ 24                | ≤ 5.000        | ≤ 2            | ≤ 1408px     |
| low   | ≤ 14                | ≤ 1.500        | ≤ 1            | ≤ 1024px     |

- Particelle = SEMPRE `THREE.Points` o `InstancedMesh` (1 draw call), mai mesh singole.
- Trasparenze full-screen sovrapposte: max 3 layer.
- `update` NON alloca (niente `new Vector3` per frame: pre-allocare in `init`).
- Asset inchiostro `/viaggio/*.png|webp`: ammessi come sprite/card/estrusioni SOLO dove la
  scheda §4 li nomina, opacità ≤ 0.5, mai più di 2 per ambiente. Parsimonia.

---

## 3. LIFECYCLE

Stati di un ambiente: `cold → warm → live → parked → disposed`.
- **live** (init fatto, riceve update, renderizzato quando tocca): SOLO corrente + successivo.
- **warm**: texture precaricate (via `loadTexture`), init non ancora chiamato.
- **parked**: il precedente appena superato resta init-izzato ma senza update/render finché
  la camera non è oltre `p=0.5` del segmento successivo (permette scroll-back istantaneo);
  poi → `dispose`.
- Preload: durante il dwell di N, l'engine chiama `loadTexture` per le texture di N+2
  (l'ambiente dichiara `export const preload = ['/images/gen/….webp', …]` in cima al modulo)
  e porta N+1 a live (init + warm-up shader §1.4). Init MAI durante scroll veloce: si
  schedula in `requestIdleCallback` con fallback timeout.
- `dispose(handle)` DEVE liberare geometrie/materiali/RT propri. Le texture del loader
  condiviso le libera l'engine (refcount). Test: dopo un viaggio completo avanti+indietro,
  `renderer.info.memory` torna ai valori del segmento corrente ±10%.

---

## 4. SPEC DEI 9 AMBIENTI (VINCOLANTI)

Catena cromatica (exit N ≡ entry N+1 — valori obbligatori):
```
soglia  ──#06102c── vertigine ──#030308── abbandono ──#0b0a10── fuga ──#171008── ti-devo-lasciare
──#0d0b06── pugno-nel-tempo ──#050505── depressione ──#0d0a08── la-casa-di-mike ──#061020── lu
──#0b0a08── avventura-di-una-vita ──#050a1a── coda
```

### 4.1 vertigine — «il tunnel del vortice» (order 1)
- **Concetto**: il vortice del quadro diventa un tunnel che ruota ATTORNO alla camera:
  entrare nell'opera = essere risucchiati. Kierkegaard, vertigine della libertà.
- **Elementi 3D**: cilindro-vortice di `Points` (high 8k) su spirali logaritmiche, moto in
  vertex shader (angolo = f(z, t, raggio)); schegge rosse = `InstancedMesh` di ~60 tetraedri
  controrotanti (`#c8281c`/`#a31818` — qui il rosso È giustificato, è il quadro); striature
  di schiuma = 6 ribbon (TubeGeometry sottili additive `#f0f4ff`); core luminoso celeste
  (`#d2ebf8`) sprite additivo in fondo al tunnel, dietro l'opera. Porting delle idee di
  `deploy/vertigine.js` (spirale, claw-streaks, core) in 3D.
- **Palette locale**: BLUES v1 (`#0a1a3d→#7fb9f0`), fog `#0a1430`.
- **Scroll**: approach = rotazione veloce e raggio che si stringe (risucchio); dwell =
  rotazione al 30%, schegge quasi ferme, opera retroilluminata dal core; exit = la camera
  scivola oltre il bordo del piano, il blu muore nel nero ossidiana. Pointer: tilt asse ±3°.
- **Costo**: ~8 draw calls, 8k particles (high).

### 4.2 abbandono — «il pozzo d'ossidiana» (order 2)
- **Concetto**: discesa in un pozzo di ossidiana che assorbe la luce; in fondo, lo specchio
  infinito. L'abbandono come caduta lenta e silenziosa.
- **Elementi 3D**: lastre d'ossidiana = `InstancedMesh` ~80 box scuri (MeshStandard, roughness
  0.25, envMap sottile) a formare una canna verticale attorno al binario; riflessi che SI
  SPENGONO (uniform di intensità → 0 con p); specchio infinito in fondo = plane con shader
  di cornici concentriche recedenti + punti luce che si allontanano (emulato, NIENTE RT
  ricorsivi); pulviscolo 1k che sale lentissimo. `cameraHints.roll` lieve (≤2°) per la
  vertigine da discesa. Opera (verticale, portrait) sospesa sopra lo specchio.
- **Palette**: nero `#030308`, grafite `#12141c`, riflessi freddi `#4a93e6` al 10%.
- **Scroll**: approach = i riflessi si spengono lastra dopo lastra scendendo; dwell = buio
  totale tranne l'opera, illuminata da una sola luce fredda dall'alto; exit = gli anelli
  dello specchio collassano in un punto → nero → fuga.
- **Costo**: ~7 dc, 1k particles. Ink `abbandono-figura` ammesso: silhouette lontana sopra
  lo specchio, opacità 0.3, solo tier high.

### 4.3 fuga — «il corridoio romano» (order 3)
- **Concetto**: Roma di notte, la fuga prospettica e il tasto ESC: correre dentro un
  colonnato che non finisce. Il tempo si ferma solo davanti all'opera.
- **Elementi 3D**: arcate/colonne = `InstancedMesh` ~40 silhouette d'arco (ShapeGeometry
  estrusa, quasi nere) in prospettiva centrale serrata; pozze di luce ocra-sodio (2 sprite
  additivi caldi); UN glifo ESC rosso `#c8281c` — piccolo, lontano, uno solo (rosso raro);
  fog caldo-scuro. Ink `fuga-reticolo` come card di fondale lontana (op. 0.35).
- **Palette**: notte bruna `#0b0a10`, ocra spenta `#8a6a3a` al 25%, rosso puntuale.
- **Scroll**: approach VELOCE (le arcate sfrecciano: senso di fuga, parallasse forte);
  dwell = tutto si FERMA di colpo (le luci smettono di pulsare: davanti all'opera il tempo
  si sospende); exit = il corridoio si piega verso l'alto, le luci diventano striate.
- **Costo**: ~6 dc, 800 particles.

### 4.4 ti-devo-lasciare — «pulviscolo d'oro nel vuoto caldo» (order 4)
- **Concetto**: oro e gesso; il distacco come due correnti di polvere dorata che si tengono
  e poi si lasciano.
- **Elementi 3D**: 6k `Points` d'oro (`#d7a94b`, size variabile, curl-noise lentissimo da
  `lib/noise.js`); DUE correnti di pulviscolo intrecciate lungo il binario; cono di luce
  morbida dall'alto (mesh cono additivo, god-ray finto); 2–3 archi di gesso = nastri curvi
  (mesh matte bianco-gesso `#e8e2d2`, luce radente). Ink `lasciarti-mano` ammesso: una sola
  card semitrasparente vicino all'opera, op. 0.4.
- **Palette**: vuoto caldo `#171008→#0f0b06`, oro, gesso.
- **Scroll**: approach = la densità d'oro cresce, le due correnti viaggiano insieme;
  dwell = le correnti si sfiorano attorno all'opera, quasi ferme; exit = SI SEPARANO
  definitivamente e l'oro si raffredda nel bruno-pirite del mondo dopo.
- **Costo**: ~6 dc, 6k particles (high).

### 4.5 pugno-nel-tempo — «l'onda d'urto congelata» (order 5)
- **Concetto**: 150×150, pirite e oro: il pugno che ferma il tempo. Un'esplosione minerale
  congelata a metà, attraversabile.
- **Elementi 3D**: ~120 cubi di pirite = `InstancedMesh` (MeshStandard metalness 0.9,
  roughness 0.35, tinta `#c9a44a`/`#6b5a2e`) disposti in gusci concentrici attorno all'opera,
  come schegge d'urto ferme; un'onda radiale lenta (pulse di scale+emissive che viaggia dal
  centro, 1 ogni ~5s in dwell); 1k scintille d'oro. Luce chiave dorata + rim fredda.
- **Palette**: `#0d0b06`, pirite, oro.
- **Scroll**: approach = la camera passa DENTRO i gusci; i cubi scorrono all'indietro
  (il tempo riavvolge); dwell = tutto congelato, solo il pulse; exit = i cubi accelerano
  in avanti (il tempo riparte) e si spengono nel nero.
- **Costo**: ~5 dc, 1k particles.

### 4.6 depressione — «la crepa d'oro nel nero» (order 6)
- **Concetto**: ossidiana e oro, kintsugi: nel buio totale l'unica guida è una crepa di
  luce dorata sul pavimento nero, che porta all'opera.
- **Elementi 3D**: pavimento nero specchiante finto (plane con shader gradiente + riflesso
  fake dell'opera, NIENTE RT su mid/low; su high un solo RT planare a 1/4 res è ammesso nel
  budget); crepa dorata = mesh nastro emissivo (`#d7a94b`) serpeggiante lungo il binario;
  fog nera pesante (near); 800 punti d'oro sparsi. Ink `depressione-occhio` SOLO tier high,
  fantasma nella fog, op. 0.25.
- **Palette**: `#050505`, oro; l'azzurro qui NON entra.
- **Scroll**: approach = quasi cecità, si segue la crepa; dwell = l'opera si accende della
  sua stessa doratura (bordo emissivo dell'operaPlane ON, luce bassa dal pavimento);
  exit = la crepa si allarga in luce → toni legno del mondo dopo.
- **Costo**: ~5 dc (+1 RT solo high), 800 particles.

### 4.7 la-casa-di-mike — «la casa dentro la casa» (order 7)
- **Concetto**: legno, alluminio, vetro: il rifugio. Cornici-casa annidate da attraversare,
  fino alla stanza più interna dove vive l'opera.
- **Elementi 3D**: ~24 telai rettangolari "casa" (profilo a capanna) = `InstancedMesh` di
  frame estrusi tono legno (`#5a4630`), annidati e recedenti lungo il binario; spigoli
  d'alluminio = linee emissive fredde (`LineSegments`/edge geometry, 1 dc); 3 lastre di
  vetro = plane trasparenti con fresnel shader (no transmission vera); pulviscolo caldo 1.2k
  in un taglio di luce pomeridiana. Ink `mike-casa` come emblema lontano oltre l'ultima
  finestra, op. 0.4.
- **Palette**: `#0d0a08`, legno caldo, alluminio `#9fb2c8` al 20%.
- **Scroll**: approach = si attraversano i telai uno a uno (soglie successive: entrare in
  casa); dwell = dentro il telaio più interno con l'opera, pulviscolo quieto; exit = si
  esce dalla finestra sul retro nel blu freddo della notte di lu.
- **Costo**: ~7 dc, 1.2k particles.

### 4.8 lu — «macro di vetro e fibra» (order 8)
- **Concetto**: Lu è piccolo: mondo in scala macro, intimo. Sfere di vetro e fibre ottiche
  i cui impulsi di luce convergono verso l'opera.
- **Elementi 3D**: ~40 sfere di vetro = `InstancedMesh` (fresnel shader, riflessi azzurri);
  12 filamenti di fibra = curve (TubeGeometry raggio 0.01) con shader di impulsi luminosi
  `#4a93e6` che viaggiano lungo la curva; vignette+blur leggerissimo ai bordi (uniform del
  veil pass, ammesso: dà la sensazione di lente macro); 1k micro-glint. Ink `lu-mezzaluna`
  fioca in fondale, op. 0.3.
- **Palette**: `#061020`, azzurro `#4a93e6`, bianco-vetro.
- **Scroll**: approach = gli impulsi corrono in avanti indicando la strada; dwell = TUTTI
  gli impulsi convergono ritmicamente sull'opera (respiro ~4s); exit = le luci si staccano
  e disperdono come lucciole nel buio meccanico del finale.
- **Costo**: ~8 dc, 1k particles.

### 4.9 avventura-di-una-vita — «il meccanismo» (order 9, finale)
- **Concetto**: nessuna foto: l'opera è il disegno stesso (clessidra) e l'ambiente è il suo
  meccanismo — ingranaggi e viti di Archimede che misurano una vita. Il tempo qui si
  SCRUBBA con lo scroll.
- **Opera-plane**: texture `/viaggio/avventura-clessidra.webp` (alpha), regole standard §1.6.
- **Elementi 3D**: 7–9 ingranaggi = `ShapeGeometry` estrusa (denti parametrici da prng),
  nero-inchiostro con filo di luce dorata sul bordo, rapporti di rotazione concatenati
  (i:i+1 = −r_i/r_{i+1}); 2 viti di Archimede = elicoidi (mesh) che girano; flusso di sabbia
  = stream di `Points` 2k che cade attraverso il centro della clessidra; carta/fondale
  caldo scuro. Ink `avventura-bussola` ammesso come quadrante di fondo, op. 0.4.
- **Palette**: carta bruciata `#0b0a08`, osso `#f4f0e0` per i fili, oro per la sabbia.
- **Scroll**: gli ingranaggi sono ACCOPPIATI a progress+velocity (scrubbing: scroll avanti
  = il meccanismo gira, fermo = quasi fermo, indietro = riavvolge); dwell = regime minimo,
  sabbia costante; exit/coda = TUTTO si arresta, la sabbia resta sospesa a mezz'aria,
  dissolvenza al blu notte `#050a1a` della coda.
- **Costo**: ~12 dc (finale, il più ricco), 2k particles.

---

## 5. HERO — la soglia (segmento 0, `hero.js`, id `soglia`)

Implementa lo STESSO contratto degli ambienti (init/update/dispose, colors
`{entry:'#050a1a', exit:'#06102c', fog:'#081028'}`), montato come segmento 0 (peso 0.8).

### 5.1 Vortice (porting/riscrittura di `deploy/vertigine.js` in three.js — MIGLIORATO)
- Da canvas 2D a GPU: `Points` (high 10k / mid 5k / low 2k) su spirali logaritmiche
  distribuite su un IMBUTO 3D (z da −8 a −1: il vortice ha PROFONDITÀ, non è più un disco).
  Moto in vertex shader: θ += ω(r)·t con accelerazione verso il centro come nella v1
  (specie water/shard mantenute: 72% blu/schiuma additive con streak, 28% schegge rosse).
- Claw-streaks della v1 → shader su un disco (polar UV, 9 bracci spiraliformi in rotazione
  oraria, glow additivo) + core celeste `#d2ebf8` con halo (sprite additivo + bloom fake:
  secondo sprite largo a bassa opacità — NIENTE postprocessing bloom full-screen).
- Reattività pointer: uniform `uPointer` deflette il flusso (attrazione water / repulsione
  shard, come v1); click/tap = shockwave (uniform ring + speedBoost con decay 0.012, identico
  feeling v1). Startup ramp 2.6s easeInOutCubic conservata.
- Fondale: gradiente radiale blu notte + vignette, fog `#081028`.

### 5.2 Farfalla (PROTAGONISTA, molto più curata della v1)
- Mesh three.js, non DOM. Corpo: estrusione low-poly sfaccettata (dal profilo del g-body
  v1: testa pentagonale, corpo affusolato), materiale vetro scuro con glint animato
  (uniform che fa scorrere una banda speculare, come `.body-glint` v1).
- Ali: 2 piani sagomati DOUBLE-SIDED (geometria dal contorno v1, 24×24 segmenti), shader
  custom "vetro iridescente": alpha/pattern da texture baked del design a schegge v1
  (SVG→canvas→texture in init, niente asset extra), fresnel + iridescenza thin-film
  (hue shift col view angle sui toni azzurro→viola→oro tenue), rifrazione finta del vortice
  dietro (offset UV del fondale campionato — economico, niente transmission).
- Battito: rotazione delle ali attorno all'asse del corpo, frequenza base 0.9Hz modulata da
  simplex noise seedato (mai loop meccanico), ampiezza legata alla "calma": pointer vicino
  → battito lento e ampio; vertex shader piega l'ala lungo l'apertura (non rotazione rigida).
- Reattività: la farfalla veleggia in un'area ±0.6u attorno al centro, vira DOLCEMENTE
  verso il pointer (bank roll nella virata, damping λ=2.5); idle = deriva su curva di
  Lissajous seedata.
- Scroll (p del segmento 0): 0–0.4 la farfalla si alza e si orienta verso il core del
  vortice; 0.4–0.8 SI INVOLA verso il core rimpicciolendo, la camera la SEGUE (è lei che
  ci conduce dentro); 0.8–1 scompare nel core mentre il vortice si apre in profondità e
  diventa l'ingresso del tunnel di vertigine (varco §1.4 con blend già "parente": stesso
  blu, stessa rotazione — deve sembrare UN unico movimento).
- Titolo hero: wordmark/punto-logo in DOM sopra il canvas, fade-out entro p=0.3. Hint
  scroll: la freccia disegnata `/viaggio/freccia-scroll` (niente testo transitorio).

---

## 6. FALLBACK E TIER

### 6.1 Rilevamento
- `tier high`: desktop, WebGL2, `deviceMemory ≥ 8` (o assente), DPR≤2.
- `tier mid`: mobile recente o desktop modesto. `tier low`: `deviceMemory ≤ 4`, GPU lente.
- Auto-retrocessione runtime: §1.8. DPR cap: 2 / 1.5 / 1.25.
- Tier mobile: particelle ≈ 40% di high, niente parallasse pointer, transizione "velo
  semplice" (§1.4) su low, texture 1408.

### 6.2 Fallback statico (no-WebGL, WebGL fallito, o `prefers-reduced-motion: reduce`)
- Il motore NON si avvia. index.astro contiene GIÀ (server-rendered, sempre nel DOM — è
  anche l'SEO della pagina) la versione statica curata: una `<section class="mondo-static">`
  per opera nell'ordine del viaggio, con:
  - opera INTERA: `<picture>` AVIF/WebP da `/images/gen/` + thumbs `-600/-1200` con
    `srcset`, `loading="lazy"` (prime 1 eager); avventura = `avventura-clessidra`;
  - didascalia identica (titolo + anno + interaction), tutta la card linka `/opera/<slug>`;
  - sfondo: gradiente verticale statico dai colori del mondo (`entry → fog → exit`), così
    anche il fallback "cambia bene gli sfondi" lungo lo scroll;
  - hero statico: un frame del vortice come sfondo CSS (radial-gradient blu + core celeste)
    e la farfalla in SVG ink (riuso del disegno v1) ferma, wordmark, nessuna animazione.
- Quando il motore parte: `document.documentElement.classList.add('js-mondi')` → CSS
  nasconde le immagini statiche e mostra canvas + captions (le captions SONO le stesse card,
  ristilizzate). Reduced-motion CON WebGL disponibile = comunque fallback statico.
- Scroll del fallback: nativo, nessun Lenis, nessuno snap.

---

## 7. CHECKLIST DI ACCETTAZIONE (per ogni PR sulla home)

1. 60fps desktop / ≥45fps mobile mid durante scroll continuo (verifica `?debug=1`).
2. Nessuno scatto al cambio segmento; transizioni sempre attraverso il colore-varco.
3. Opera sempre intera, mai frammentata; dwell = 70–80% viewport; click → `/opera/<slug>`.
4. Didascalie solo titolo+anno+interaction, affiorano solo in dwell.
5. Redirect QR `#slug` intatto in testa all'head.
6. Menu funzionante, `vg:menu` ferma/riavvia Lenis.
7. Fallback statico verificato con WebGL disabilitato E con reduced-motion.
8. Nessun `Math.random` nudo (grep), nessun testo transitorio.
9. Dopo viaggio completo A/R, memoria GPU rientrata (§3).
10. Budget draw call/particelle rispettati per tier (§2.5).
