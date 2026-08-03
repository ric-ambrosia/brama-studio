# brama v2 — Art Direction

Direzione artistica del sito completo. Riferimento strutturale: emergenceprojects.com
(scene a schermo pieno, una cosa per volta, micro-navigazione, ritmo chiaro/scuro).
Riferimento grafico: i disegni a pennarello dell'artista (pagine del portfolio),
mai tagliati e incollati, sempre **riadattati al luogo che li ospita**.

---

## 1. Idea portante

Il sito è un **teatro di carta**. Ogni schermata è una scena: un fondale, poche
quinte disegnate a pennarello, un solo protagonista al centro (un'opera, una
frase, un gesto). Come in Emergence, non si scorre mai "una pagina lunga": si
attraversano stanze. Il visitatore compie il Viaggio dell'artista — nove opere,
nove territori emotivi — e ogni territorio è **anticipato** dalla sua scenografia
prima ancora che l'opera appaia.

Tre leggi:

1. **Una cosa per volta.** Ogni scena ha un solo centro d'attenzione. Tutto il
   resto è quinta, fregio, ornamento appeso: presente ma in secondo piano.
2. **Il disegno fa la scena, la foto fa l'opera.** Gli asset a inchiostro
   (neri, tinti via CSS) costruiscono il mondo; le fotografie delle tele sono
   le uniche superfici "piene" e materiche. Il contrasto tra linea e materia è
   il linguaggio del brand.
3. **Il rosso è sangue, non decorazione.** Un solo accento rosso per scena, al
   massimo. Dove non serve, non c'è.

---

## 2. Palette e ruoli

| Token | Valore | Ruolo |
|---|---|---|
| blu notte profondo | `#050a1a` | fondali delle scene scure, il "vuoto" del teatro |
| blu notte | `#0a1430` | variante per pannelli e scene scure secondarie |
| azzurro | `#4a93e6` | tinta degli asset a inchiostro sulle scene scure, link, dettagli vivi |
| rosso | `#c8281c` | accento emotivo raro: cuore della scena, hover decisivi, il sigillo |
| inchiostro | `#0a0a0a` | tinta degli asset sulle scene chiare, testo su chiaro |
| carta azzurrata | `#e8ecf4` / `#dfe6f2` | fondali delle scene chiare, "carta" del taccuino |

**Regola di tinta degli asset.** Tutti gli asset del Viaggio sono prodotti in
NERO puro su PNG trasparente. Il colore lo dà il CSS, mai il file:

```css
/* asset come maschera: prende qualsiasi tinta */
.ink {
  background: currentColor;
  -webkit-mask: url(/viaggio/asset.png) center / contain no-repeat;
  mask: url(/viaggio/asset.png) center / contain no-repeat;
}
/* su scena scura: color: #4a93e6 (o #e8ecf4); su scena chiara: color: #0a0a0a */
```

Così lo stesso disegno vive azzurro nella notte, inchiostro sulla carta, rosso
nel sigillo — senza mai duplicare file.

---

## 3. Ritmo chiaro/scuro

Il Viaggio alterna carta e notte come una respirazione. Non alternanza
meccanica: la luce segue l'emozione.

```
Copertina        CHIARO   carta, taccuino aperto, fregio in alto
Vertigine        SCURO    il vuoto blu che risucchia
Abbandono        SCURO    il più buio del sito (#050a1a pieno)
Fuggire          CHIARO   carta ferita dal reticolo, fuga verso il margine
Lasciarti andare CHIARO   carta calda, respiro, oro simulato dal vuoto
Pugno nel tempo  SCURO    notte metallica, la lama sospesa
Depressione      SCURO    notte bassa, l'occhio che affiora
La casa di Mike  CHIARO   scena domestica, tenera, pavimento a scacchi
Lu               CHIARO   piccola, quasi vuota: una mezzaluna e tanto bianco
Avventura        SCURO→CHIARO  la scena finale si accende mentre il meccanismo gira
Sigillo/CTA      SCURO    emblema rosso su notte
```

Mai più di due scene consecutive della stessa polarità, con l'unica eccezione
voluta Vertigine→Abbandono (la discesa) e Pugno→Depressione (il fondo).

---

## 4. Grammatica delle scene del Viaggio

Ogni scena-territorio ha: **fondale** (colore pieno), **quinte** (asset grandi
ai margini, parzialmente fuori campo), **ornamenti** (elementi appesi o
appoggiati, piccoli), **protagonista** (la foto dell'opera, che entra solo dopo
che la scena l'ha annunciata), **didascalia** (titolo Fraunces + scheda tecnica
JetBrains Mono).

1. **Vertigine** — territorio: il risucchio. Fondale notte; il vortice a
   inchiostro (`vertigine-vortice`) ruota lentissimo (60s/giro, CSS) dietro il
   punto centrale; schegge appese a fili che oscillano appena. La farfalla al
   centro del vortice è l'unico punto dove può accendersi il rosso. L'opera
   entra in scala crescente, come cadendo verso l'osservatore.
2. **Abbandono** — territorio: il vuoto verticale. La scena più spoglia: la
   figura in piedi (`abbandono-figura`) sola, piccola, in basso a sinistra su
   fondale `#050a1a`; sopra di lei tutta l'altezza dello schermo vuota. L'opera
   (verticale, 80×150) appare come uno specchio davanti alla figura.
3. **Fuggire** — territorio: la carta ferita. Fondale chiaro attraversato dal
   reticolo di aste e croci (`fuga-reticolo`) che entra dal margine destro come
   filo spinato; la figura alata in fuga (`fuga-figura`) corre verso il bordo
   sinistro, metà fuori campo. La parola ESC è tipografia viva (JetBrains Mono,
   maiuscolo, tracking largo), MAI dentro l'immagine.
4. **Lasciarti andare** — territorio: l'apertura della mano. Fondale carta
   calda; la mano a inchiostro con le schegge raggiate (`lasciarti-mano`)
   campeggia al centro-basso, le dita verso l'alto; piccole scintille appese
   che salgono. Qui il ritmo rallenta: transizione più lenta del normale.
5. **Pugno nel tempo** — territorio: l'arma sospesa. Fondale notte; la lama
   alata (`pugno-lama`) appesa orizzontale a un filo, come un pendolo fermo;
   sotto, l'emblema lune/triangoli (`pugno-emblema`) appoggiato a terra come
   uno stemma caduto. L'opera irrompe con la transizione più netta del sito
   (taglio secco, nessuna dissolvenza).
6. **Depressione** — territorio: l'occhio che guarda dal fondo. Fondale notte
   bassa; l'occhio realistico (`depressione-occhio`) affiora enorme dal margine
   inferiore, per tre quarti sommerso fuori campo — guarda l'utente, immobile.
   L'unica scena in cui un asset supera per scala il protagonista.
7. **La casa di Mike** — territorio: la stanza. Fondale chiaro; pavimento a
   scacchi (`pavimento-scacchi`, tile) in prospettiva bassa; la casetta
   (`mike-casa`) posata sul pavimento come un giocattolo, alla maniera
   dell'oggetto solitario di Emergence (live-7). Scena affettuosa, ordinata.
8. **Lu** — territorio: il piccolo. Quasi tutto vuoto: una mezzaluna decorata
   (`lu-mezzaluna`) appesa in alto, l'opera piccola al centro, tanto respiro.
   La didascalia qui è più grande dell'opera: è voluto.
9. **Avventura di una vita** — territorio: il meccanismo. Non esistendo foto,
   il disegno È l'opera: la clessidra con viti di Archimede
   (`avventura-clessidra`) al centro, grande; la bussola (`avventura-bussola`)
   e stelle appese intorno. Etichetta "in lavorazione" in JetBrains Mono.
   La scena passa da scura a chiara scrollando: il futuro che si apre.

**Chiusura del Viaggio**: il sigillo (`sigillo-emblema`) tinto rosso su notte,
solo, con una riga in Fraunces. È l'unico asset che vive rosso di default.

---

## 5. Posizionamento degli asset (vocabolario scenico)

- **Quinte**: asset grandi (figura coronata, creatura alata, occhio, vortice)
  ancorati ai margini, sempre parzialmente tagliati dal bordo (mai "appoggiati"
  interi dentro la scena). `position:absolute`, overflow nascosto dalla scena.
- **Fregi**: `fregio-filigrana` ripetuto orizzontalmente (`background-repeat:
  repeat-x`) come cornice alta o bassa delle scene chiave (copertina, portali
  tra capitoli). Altezza 96–140px desktop, 64px mobile. Opacità 0.9 su chiaro,
  tinta azzurra su scuro.
- **Elementi appesi**: stelle/pianeti (`appeso-*`) pendono da fili sottili di
  1px disegnati in CSS (non nell'asset), lunghezze diverse, leggero dondolio
  (rotate ±2°, 6–9s, ease-in-out, `prefers-reduced-motion` li ferma). Cadenza
  alla Emergence (live-1): grappoli asimmetrici agli angoli alti, mai al centro.
- **Emblemi araldici**: piccoli (64–120px), centrati o a piè di sezione, come
  timbri: `pugno-emblema`, `sigillo-emblema`, `shop-pacco`, `contatti-busta`.
  Sempre soli, con aria intorno.
- **Pavimenti**: `pavimento-scacchi` in banda bassa con prospettiva CSS
  (`transform: perspective(600px) rotateX(55deg)`), come i pavimenti delle
  tapestry di Emergence. Solo nelle scene domestiche/chiare.
- **Cornici-finestra**: `finestra-quinta` incornicia il protagonista nelle
  scene di soglia (ingresso del Viaggio, Abbandono). La figura coronata può
  affacciarsi dal bordo superiore della cornice.

---

## 6. Tipografia

Font già nel progetto: **Fraunces**, **Cormorant**, **Inter Tight**,
**JetBrains Mono**.

- **Fraunces** — voce del brand. Titoli di scena e dei capitoli del Viaggio,
  optical size alto, pesi 500–700. Su scuro: carta azzurrata; mai grigio.
- **Cormorant** — voce dell'artista. Corsivo per le frasi emotive brevi che
  aprono ogni territorio ("Poi il vuoto ha smesso di fare paura."). Solo
  corsivo, solo poche parole, mai per UI.
- **Inter Tight** — prosa e interfaccia: descrizioni, navigazione, bottoni,
  form. Pesi 400–600.
- **JetBrains Mono** — voce tecnica/di laboratorio: schede opera (luogo, anno,
  dimensioni, materiali), etichette tipo "ESC", "IN LAVORAZIONE", numerazione
  scene (01/09), coordinate. Maiuscoletto simulato con uppercase + tracking.

Gerarchia tipo di una scena: numerazione mono (01 — VERTIGINE) → frase
Cormorant corsivo → titolo Fraunces → scheda mono → prosa Inter Tight.

---

## 7. Transizioni (alla Emergence)

- **Tra scene: taglio teatrale.** Il fondale cambia colore con una tendina
  verticale o un fade rapidissimo (≤400ms); MAI parallax morbido continuo.
  Prima entra il fondale, poi le quinte (100ms dopo), poi il protagonista
  (200ms dopo), poi la didascalia. Una cosa per volta anche nel tempo.
- **Dentro la scena: quasi nulla si muove.** Solo i dondolii degli appesi e
  una micro-rotazione del vortice. Il movimento è raro, quindi significativo.
- **Micro-navigazione**: freccia di scroll disegnata (`freccia-scroll`) fissa
  in basso al centro, che rimbalza appena; numerazione scena in mono in un
  angolo; possibilità di saltare capitolo con frecce laterali disegnate.
- **Chiaro→scuro**: la tendina è nera (inchiostro che allaga). **Scuro→chiaro**:
  la tendina è carta (la pagina che si volta). Coerente in tutto il sito.
- **`prefers-reduced-motion`**: tagli secchi senza tendine, nessun dondolio.

---

## 8. Altre pagine

- **Shop**: scena chiara, ordinata; emblema `shop-pacco` come timbro accanto
  alle note di spedizione/cura; fregio basso; nessun rosso tranne il bottone
  d'acquisto.
- **Manifesto**: carta integrale, tipografia dominante; due sole vignette a
  inchiostro (`manifesto-mani`, `manifesto-cuore`) come capilettera visivi
  delle sezioni chiave; le altre sezioni vivono di solo testo.
- **Contatti**: riprende la scena della figura coronata alla finestra (è già
  la pagina contatti del portfolio cartaceo): `figura-coronata` come quinta
  destra, `contatti-busta` come emblema sopra il form.
- **Archivio/Portfolio**: gallerie scure alla Emergence (live-8/9): fondale
  notte, opere fotografiche in cornice sottile chiara, molto vuoto tra l'una
  e l'altra, didascalie mono.

---

## 9. Produzione asset — regole vincolanti

1. Ogni asset nasce dai disegni reali (mode **edit** sulle pagine del
   portfolio) quando la sorgente esiste; **generate** solo dove il disegno non
   esiste (clessidra, casa, emblemi di servizio), con descrizione minuziosa
   del tratto.
2. Ogni prompt esige: fedeltà al tratto a pennarello dell'artista (spessori
   irregolari, tratteggio a mano, imperfezioni, angoli vivi), NERO puro
   `#000000` su sfondo TRASPARENTE, nessun testo, nessuna firma, nessuna
   texture di carta.
3. Qualità **high** per i 4 asset eroe (figura coronata, creatura alata,
   clessidra, fregio filigrana); **medium** per il resto.
4. Formati: figure verticali 1024×1536; fregi e scene orizzontali 1536×1024;
   emblemi/pattern 1024×1024. Destinazione: `/public/viaggio/<id>.png`.
5. I pattern (fregio, scacchi) devono affiancarsi senza cuciture sull'asse
   orizzontale: verificare il tiling con sharp prima dell'uso; ritoccare i
   bordi se necessario.
6. Dopo la produzione, ogni asset va provato in tinta azzurra su `#050a1a` e
   in inchiostro su `#e8ecf4`: se il disegno "sporca" (aloni grigi, fondo non
   pulito), va rigenerato — la maschera CSS amplifica ogni residuo.
