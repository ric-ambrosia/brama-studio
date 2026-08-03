// Sync opere → Stripe (Product + Price) e riscrittura di stripeProductId nei file.
// Fonte di verità dei contenuti: src/content/works/*.md. Stripe è la fonte
// runtime di prezzi/disponibilità al checkout.
// Uso: STRIPE_SECRET_KEY=sk_test_... npm run stripe:sync
// Idempotente: cerca il Product esistente per metadata.slug prima di crearne uno.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Stripe from 'stripe';
import YAML from 'yaml';

const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) {
  console.error('STRIPE_SECRET_KEY mancante. Uso: STRIPE_SECRET_KEY=sk_test_... npm run stripe:sync');
  process.exit(1);
}
if (!KEY.startsWith('sk_test_') && process.env.ALLOW_LIVE !== '1') {
  console.error('Chiave LIVE rilevata. Per sicurezza il sync live richiede ALLOW_LIVE=1 (go-live esplicito).');
  process.exit(1);
}

const stripe = new Stripe(KEY);
const DIR = new URL('../src/content/works', import.meta.url).pathname;

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  return { data: YAML.parse(m[1]), body: m[2], yamlRaw: m[1] };
}

const files = (await readdir(DIR)).filter((f) => f.endsWith('.md'));
let synced = 0;

for (const file of files) {
  const slug = file.replace(/\.md$/, '');
  const path = join(DIR, file);
  const raw = await readFile(path, 'utf8');
  const parsed = parseFrontmatter(raw);
  if (!parsed) {
    console.warn(`⚠ ${file}: frontmatter non riconosciuto, salto`);
    continue;
  }
  const { data, body } = parsed;

  // Sincronizza solo ciò che può essere venduto e ha un prezzo reale.
  if (data.status !== 'available' || !data.price || data.price <= 0) continue;

  // Cerca un Product esistente per slug (idempotenza).
  const search = await stripe.products.search({
    query: `metadata['slug']:'${slug}'`,
  });
  let product = search.data[0];

  const productPayload = {
    name: `${data.title} — opera originale`,
    description:
      [data.year, data.size ? `${data.size.w}×${data.size.h} cm` : null, (data.materials ?? []).join(', ')]
        .filter(Boolean)
        .join(' · ') || undefined,
    metadata: { slug, collection: data.collection ?? 'core' },
  };

  if (!product) {
    product = await stripe.products.create(productPayload);
    console.log(`+ creato Product ${product.id} per ${slug}`);
  } else {
    await stripe.products.update(product.id, productPayload);
  }

  // Un Price attivo per il prezzo corrente; se cambia, disattiva i vecchi.
  const unitAmount = Math.round(data.price * 100);
  const prices = await stripe.prices.list({ product: product.id, active: true });
  let price = prices.data.find((p) => p.unit_amount === unitAmount && p.currency === 'eur');
  if (!price) {
    for (const old of prices.data) {
      await stripe.prices.update(old.id, { active: false });
    }
    price = await stripe.prices.create({
      product: product.id,
      currency: 'eur',
      unit_amount: unitAmount,
    });
    console.log(`+ nuovo Price ${price.id} (${data.price} EUR) per ${slug}`);
  }

  if (data.stripeProductId !== product.id) {
    // Riscrive solo la riga stripeProductId nel frontmatter, senza toccare il resto.
    const updatedYaml = parsed.yamlRaw.match(/^stripeProductId:/m)
      ? parsed.yamlRaw.replace(/^stripeProductId:.*$/m, `stripeProductId: "${product.id}"`)
      : parsed.yamlRaw + `\nstripeProductId: "${product.id}"`;
    await writeFile(path, `---\n${updatedYaml}\n---\n${body}`);
    console.log(`✎ ${file}: stripeProductId aggiornato`);
  }
  synced++;
}

console.log(`Sync completato: ${synced} opere sincronizzate su Stripe (${KEY.startsWith('sk_test_') ? 'TEST' : 'LIVE'} mode).`);
