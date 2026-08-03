# Report fasi 0–4 (prima sessione di sviluppo — 2026-07-20)

## Fase 0 — Fondazioni ✅
- **Stack scelto: Astro 5 su Vercel** (opzione A del piano). Motivi: content collections
  tipizzate con zod per opere/prodotti (schema §4 del piano), pagine statiche veloci di
  default, API routes serverless per Stripe nello stesso progetto, zero framework UI
  client-side (gli script di animazione restano vanilla e portabili), adapter Vercel
  ufficiale. L'alternativa vanilla estesa avrebbe richiesto di reinventare routing,
  build dei contenuti e SEO per ~20 pagine senza alcun vantaggio.
- Branch di rollback `v1-legacy` creato (la v1 resta anche in `deploy/`).
- Design token portati da styles.css v1 in `src/styles/tokens.css` (+ palette carta/
  inchiostro per i territori di disegno); layout base con header/menu/footer brand.

## Fase 1 — Contenuti & dati ✅
- PDF estratto integralmente (`content-notes/pdf-extraction.md`): 15 incongruenze
  sito/PDF identificate e flaggate nei `dataNotes` dei file opera (il PDF fa fede).
- 35 voci contenuto in `src/content/works/`: 9 core (slug QR invariati), 24 Emozioni
  (mancano ~9 nomi: `emozioni-mancanti.md`), 2 gruppi disegni.
- Catalogo immagini con dimensioni reali; territori di disegno per il Viaggio:
  page-16, page-06, page-01, page-03, page-07.
- Pipeline immagini sharp: 38 varianti AVIF/WebP in `public/images/gen/`.
- Bozze testi: manifesto (5 sezioni), contatti, shop, 5 pagine legali (BOZZA DA VALIDARE).

## Fase 2 — Struttura & pagine ✅
- Rotte: `/` (interim + **redirect QR `#slug` → `/opera/<slug>`**), `/opera/[slug]`
  (35 pagine, JSON-LD VisualArtwork, acquisto con selettore zona), `/shop`, `/manifesto`,
  `/archivio`, `/portfolio` (sfoglia senza pagine con dati personali), `/contatti`,
  `/legal/*` (5), `/grazie` (noindex). Sitemap (senza /lab e /grazie), robots.txt.
- Instagram passa dal redirect interno `/instagram` (config Vercel): l'handle personale
  non compare nell'HTML pubblicato.

## Fase 3a — Studio del Viaggio ✅ (in attesa di decisione)
- Tre prototipi completi su Vertigine + Abbandono + territori: `/lab/p1` (filo 2D
  SVG+GSAP), `/lab/p2` (camera Three.js), `/lab/p3` (ibrido DOM+canvas, favorito del
  piano). README tecnici in `content-notes/lab/`. FPS meter con `?debug=1`.
- **La Fase 3b (estensione a tutto il percorso) parte solo dopo la scelta di Riccardo.**

## Fase 4 — Shop & Stripe ✅ (test mode, senza chiavi)
- `POST /api/checkout`: verifica disponibilità → prenotazione atomica KV (SET NX,
  TTL 35') → Checkout Session (scadenza 30', spedizione per zona da shipping.json).
- `POST /api/webhook`: completed → sold su KV + Deploy Hook + email Resend;
  expired → rilascio. `GET /api/state` per il controllo client-side.
- `npm run stripe:sync` idempotente (Product+Price per slug; live solo con ALLOW_LIVE=1).
- Feature flag (`config/features.json`) tutti off; con flag off nessuna traccia nel
  markup (verificato: zero "abbigliamento" nello shop).

## QA ✅
- Build pulita; audit brand sull'output: nome SOLO in `/legal/*` (placeholder
  venditore), zero email/telefono personali, zero braminator.com.
- Smoke test: tutte le rotte rispondono; JSON-LD presente; banner bozza sulle legali.

## Non fatto (dipende da input o da fasi successive)
- Fase 3b (Viaggio completo) — attende scelta P1/P2/P3.
- Fase 4b (apparel/prints/EN/newsletter dietro flag) — architettura flag pronta,
  esperienze da costruire.
- Test end-to-end Stripe — servono account e chiavi test (punto aperto 10).
- Deploy: cambiare Root Directory Vercel in `site` (istruzioni nel README).
