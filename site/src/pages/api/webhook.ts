// POST /api/webhook — webhook Stripe.
// checkout.session.completed → marca l'opera venduta (KV), rigenera il sito
// (Deploy Hook Vercel) e notifica l'owner via email (Resend, opzionale).
// checkout.session.expired → rilascia la prenotazione.
import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { markSold, release } from '../../lib/availability';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) return new Response('non configurato', { status: 503 });

  const stripe = new Stripe(secretKey);
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('firma mancante', { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await request.text(),
      signature,
      webhookSecret
    );
  } catch {
    return new Response('firma non valida', { status: 400 });
  }

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.expired'
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const slug = session.metadata?.slug;
    if (!slug) return new Response('ok (senza slug)', { status: 200 });

    if (event.type === 'checkout.session.completed') {
      await markSold(slug);

      // Rigenera il sito statico: il badge "Venduto" appare al prossimo build.
      const deployHook = process.env.VERCEL_DEPLOY_HOOK_URL;
      if (deployHook) {
        try {
          await fetch(deployHook, { method: 'POST' });
        } catch (err) {
          console.error('deploy hook failed', err);
        }
      }

      // Notifica owner (best-effort: un errore qui non deve far fallire il webhook,
      // Stripe altrimenti ritenta e markSold è già avvenuto).
      const resendKey = process.env.RESEND_API_KEY;
      const notifyTo = process.env.NOTIFY_EMAIL;
      if (resendKey && notifyTo) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: process.env.NOTIFY_FROM ?? 'brama <onboarding@resend.dev>',
              to: [notifyTo],
              subject: `Opera venduta: ${slug}`,
              text: [
                `L'opera "${slug}" è stata venduta.`,
                `Totale: ${((session.amount_total ?? 0) / 100).toFixed(2)} EUR`,
                `Email cliente: ${session.customer_details?.email ?? 'non fornita'}`,
                `Spedizione: ${JSON.stringify(session.collected_information?.shipping_details ?? session.customer_details?.address ?? {})}`,
                '',
                `Dettagli completi nella dashboard Stripe: ${session.id}`,
              ].join('\n'),
            }),
          });
        } catch (err) {
          console.error('notify email failed', err);
        }
      }
    } else {
      await release(slug);
    }
  }

  return new Response('ok', { status: 200 });
};
