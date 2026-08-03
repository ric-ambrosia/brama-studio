# brama v2 — sito del brand

Astro 5 su Vercel. Contenuti come file nel repo (nessun CMS), shop Stripe per opere
originali (pezzi unici), homepage-viaggio "Il Tratto". La v1 è preservata nel branch
`v1-legacy` e in `deploy/` (rollback sempre possibile).

## Comandi

```bash
npm run dev          # sviluppo locale
npm run build        # build di produzione (dist/)
npm run preview      # anteprima della build
npm run images       # pipeline immagini: varianti AVIF/WebP in public/images/gen/
npm run stripe:sync  # sync opere → Stripe (richiede STRIPE_SECRET_KEY, test mode)
```

## Struttura

```
src/content/works/      un .md per opera — IL NOME FILE È LO SLUG (URL e QR fisici)
src/content/products/   abbigliamento/stampe (futuro, dietro feature flag)
src/pages/              rotte del sito (/, /opera/[slug], /shop, /manifesto, ...)
src/pages/api/          serverless: checkout, webhook Stripe, state
src/pages/lab/          prototipi del Viaggio (P1/P2/P3) — studio interno, non linkati
src/lib/                site config, disponibilità (KV), helper opere
config/features.json    feature flag: apparel, prints, lang_en, newsletter (tutti off)
config/shipping.json    fasce di spedizione IT/EU (PLACEHOLDER, tariffe da fornire)
content-notes/          materiale di lavorazione: estrazione PDF, bozze testi, report
scripts/                build-images (sharp), stripe-sync
```

## Architettura vendita (anti doppia vendita)

1. "Acquista" → `POST /api/checkout {slug, zone}` → verifica disponibilità
   (frontmatter + KV) → **prenotazione atomica su KV (SET NX, TTL 35 min)** →
   Checkout Session Stripe (scadenza 30 min) → redirect.
2. Webhook `checkout.session.completed` → `sold` su KV → Deploy Hook rigenera il
   sito (badge Venduto) → email di notifica all'owner (Resend).
3. Webhook `checkout.session.expired` → rilascio della prenotazione.

Lo stato runtime vive SOLO su KV; i contenuti restano file. In build le pagine
leggono anche KV (`effectiveStatus`), quindi ogni deploy riflette le vendite.

## Deploy su Vercel

Il progetto Vercel attuale serve `deploy/` (v1). Per pubblicare la v2:

1. Dashboard Vercel → Settings → **Root Directory: `site`** (framework: Astro).
2. Env vars da `.env.example` (Stripe TEST fino al go-live; KV via marketplace
   Upstash; Deploy Hook creato in Settings → Git → Deploy Hooks).
3. Webhook Stripe → endpoint `https://brama.studio/api/webhook`, eventi:
   `checkout.session.completed`, `checkout.session.expired`.

## Checklist go-live (bloccanti)

- [ ] Prezzi reali nelle opere (`price` > 0) — oggi placeholder 0 = "su richiesta"
- [ ] Tariffe corriere reali in `config/shipping.json` (oggi `placeholder: true`)
- [ ] Chiavi Stripe LIVE + webhook live + `ALLOW_LIVE=1` per il sync
- [ ] Testi legali validati (oggi marcati BOZZA — DA VALIDARE)
- [ ] Alias email brand attivo (studio@brama.studio) — nel sito non c'è email personale
- [ ] Conferma dati opere dove sito e PDF divergono (vedi `dataNotes` nei file opera)
- [ ] Audit brand sull'output: nessun nome personale fuori da /legal/*
- [ ] Redirect braminator.com

## Regole

- Mai committare chiavi (env su Vercel; `.env` è in .gitignore).
- `battiti/` è un progetto separato: non toccare.
- Gli slug delle 9 opere core non devono mai cambiare (QR fisici stampati).
