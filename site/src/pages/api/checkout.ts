// POST /api/checkout — crea una Stripe Checkout Session per un'opera (pezzo unico).
// Body JSON: { slug: string, country: string (ISO-2 o 'WORLD'), method: 'courier' | 'pickup' | 'handMilan' }
// La tariffa di spedizione è calcolata QUI dal server (config/shipping.json), mai dal client.
// Flusso anti doppia vendita: verifica contenuto → prenotazione atomica su KV →
// sessione Stripe con scadenza 30 min → redirect. La prenotazione decade da sola
// (TTL) o viene rilasciata dal webhook checkout.session.expired.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import Stripe from 'stripe';
import { getSaleState } from '../../lib/availability';
import {
  zoneForCountry,
  shippingTier,
  courierAmount,
  allowedCountries,
  OPTIONS,
  DELIVERY_DAYS,
  type Zone,
} from '../../lib/shipping';

export const prerender = false;

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const POST: APIRoute = async ({ request }) => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return json(503, { error: 'checkout non configurato' });
  const stripe = new Stripe(secretKey);

  let body: { slug?: string; country?: string; method?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'body non valido' });
  }
  const { slug, country, method } = body;
  if (!slug || !country || (method !== 'courier' && method !== 'pickup' && method !== 'handMilan')) {
    return json(400, { error: 'parametri mancanti' });
  }

  const works = await getCollection('works');
  const work = works.find((w) => w.id === slug);
  if (!work) return json(404, { error: 'opera non trovata' });
  if (work.data.status !== 'available' || work.data.price <= 0) {
    return json(409, { error: 'opera non disponibile' });
  }

  // Spedizione: tariffa calcolata dal server (fonte: config/shipping.json).
  const zone: Zone = zoneForCountry(country);
  const tier = shippingTier(work.data);
  let shippingAmount = 0;
  let shippingLabel = '';
  let collectAddress = true;
  let allowed = allowedCountries(zone);
  const estZone: Zone = zone;
  if (method === 'pickup') {
    shippingAmount = 0;
    shippingLabel = 'Ritiro all’esposizione (The Seed, Milano)';
    collectAddress = false;
  } else if (method === 'handMilan') {
    if (zone !== 'IT') return json(400, { error: 'consegna a mano solo in Italia' });
    shippingAmount = OPTIONS.handMilan.price;
    shippingLabel = 'Consegna a mano a Milano e dintorni';
    allowed = ['IT'];
  } else {
    const amt = courierAmount(tier, zone);
    if (amt == null) {
      return json(409, { error: 'spedizione su preventivo per questa destinazione' });
    }
    shippingAmount = amt;
    shippingLabel = `Corriere assicurato (${zone === 'IT' ? 'Italia' : zone === 'EU' ? 'Europa' : 'Mondo'})`;
  }

  // Stato live letto da Stripe: 'sold' se già pagata, 'reserved' se qualcuno sta
  // completando un checkout aperto per la stessa opera → in entrambi i casi si blocca.
  const state = await getSaleState(slug);
  if (state === 'sold') return json(409, { error: 'opera non disponibile' });
  if (state === 'reserved') return json(409, { error: 'opera momentaneamente riservata' });

  const days = DELIVERY_DAYS[estZone];
  const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] =
    method === 'pickup'
      ? []
      : [
          {
            shipping_rate_data: {
              display_name: shippingLabel,
              type: 'fixed_amount',
              fixed_amount: { amount: shippingAmount, currency: 'eur' },
              delivery_estimate: {
                minimum: { unit: 'business_day', value: days[0] },
                maximum: { unit: 'business_day', value: days[1] },
              },
            },
          },
        ];

  // Base URL presa dalla richiesta: in locale = http://localhost:4321,
  // in produzione = https://brama.studio. Così il ritorno dopo il pagamento
  // (pagina "grazie") va sempre sul sito giusto, non su un dominio che non esiste ancora.
  const site = new URL(request.url).origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: Math.round(work.data.price * 100),
            product_data: {
              name: `${work.data.title}, opera originale`,
              description: [
                work.data.year,
                work.data.size ? `${work.data.size.w}×${work.data.size.h} cm` : null,
                work.data.materials.join(', '),
              ]
                .filter(Boolean)
                .join(' · '),
              images: work.data.images.main ? [`${site}${work.data.images.main}`] : [],
              metadata: { slug },
            },
          },
        },
      ],
      ...(collectAddress
        ? {
            shipping_address_collection: {
              allowed_countries:
                allowed as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
            },
          }
        : {}),
      ...(shippingOptions.length ? { shipping_options: shippingOptions } : {}),
      metadata: { slug, shippingMethod: method, shippingZone: zone },
      success_url: `${site}/grazie?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/opera/${slug}`,
      locale: 'it',
    });
    return json(200, { url: session.url });
  } catch (err) {
    console.error('checkout error', err);
    return json(500, { error: 'errore nella creazione del checkout' });
  }
};
