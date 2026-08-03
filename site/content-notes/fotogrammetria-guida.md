# Guida alla scansione fotogrammetrica delle opere (iPhone 13 mini)

> Obiettivo: modello 3D di ogni opera per la ricomposizione del Viaggio.
> Il 13 mini non ha LiDAR → si usa la fotogrammetria pura (foto multiple).
> Pilota: **Vertigine**. Poi le altre opere in ordine di priorità del Viaggio.

## App consigliata

**RealityScan** (Epic Games, gratuita — modalità foto) oppure **Polycam** (Photo mode).
In alternativa: scattare le foto con la fotocamera nativa (formato massimo, no Live
Photo) e mandarmele: la ricostruzione posso farla io da foto grezze.

## Allestimento

- Opera **verticale e stabile** (appesa o su cavalletto), spazio libero per girarci attorno.
- **Luce diffusa e uniforme**: giornata nuvolosa vicino a una grande finestra, oppure
  due lampade con diffusore (lenzuolo/carta da forno) ai lati. **MAI** spot diretti,
  **MAI** flash: i riflessi che si spostano tra uno scatto e l'altro sono il nemico
  numero uno (resina, vetro, ossidiana, oro).
- Se possibile, blocca esposizione e fuoco (tieni premuto sullo schermo → AE/AF lock).
- 4–6 post-it opachi con segni a penna attaccati ai bordi esterni della tela aiutano
  l'allineamento (li rimuovo digitalmente).

## Sequenza di scatto (per un'opera ~150×100: 120–200 foto)

1. **Orbita larga** (~1,2 m): mezzo giro davanti all'opera, uno scatto ogni ~10°,
   a 3 altezze (basso, centro, alto). ~50 foto.
2. **Orbita media** (~60 cm): stessa cosa. ~50 foto.
3. **Dettagli ravvicinati** (~25–35 cm): le zone materiche — schegge di vetro,
   colate di resina, rilievi — fotografate da 3–4 angolazioni ciascuna,
   con sovrapposizione abbondante (ogni foto condivide il 70–80% con la precedente).
   ~30–60 foto.
4. **Radenti**: 8–10 scatti quasi paralleli alla tela (da sinistra, destra, alto,
   basso) per catturare gli spessori e le facce laterali dei rilievi.

Regole: mai cambiare zoom (sempre 1×), muoviti tu invece di ruotare l'opera,
scatti nitidi (fermati un attimo a ogni scatto), niente persone/ombre in movimento
nell'inquadratura.

## Cosa aspettarsi (gestito in post, non ti preoccupare)

- Tela e superfici opache: ricostruzione eccellente, dettaglio sub-millimetrico.
- Vetro, resina lucida, ossidiana, oro, specchi: rumore/buchi normali → riparo io
  digitalmente i frammenti problematici partendo dalle foto.
- Lo specchio infinito di Abbandono non è ricostruibile per natura: verrà trattato
  come elemento speciale (piano riflettente simulato).

## Consegna

Esporta il progetto RealityScan/Polycam (o mandami la cartella di foto originali,
senza compressione — AirDrop/Drive). Al resto — pulizia, separazione dei frammenti,
ottimizzazione web (draco/KTX2, 2–5 MB per opera), integrazione nel motore di
ricomposizione — penso io.

## Garanzia "come la foto"

Il modello 3D serve solo al volo dei frammenti: a ricomposizione avvenuta la texture
è la foto master proiettata frontalmente + swap invisibile con l'immagine reale.
Il quadro composto è SEMPRE identico alla fotografia.
