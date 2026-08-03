// Stato di vendita delle opere — letto DIRETTAMENTE da Stripe (fonte unica).
// Nessun database esterno: basta STRIPE_SECRET_KEY.
//  - 'sold'     : esiste una sessione di checkout PAGATA per quello slug;
//  - 'reserved' : esiste una sessione di checkout APERTA e non scaduta (qualcuno sta comprando);
//  - 'available': nessuna delle due.
// Il record durevole resta il campo `status` nel contenuto (.md): questo check
// è il supplemento "live" tra un deploy e l'altro. Se Stripe non è configurato,
// tutto è 'available' (utile in sviluppo).
import Stripe from 'stripe';

export type SaleState = 'available' | 'reserved' | 'sold';

const secretKey = process.env.STRIPE_SECRET_KEY;
const stripe = secretKey ? new Stripe(secretKey) : null;

export async function getSaleState(slug: string): Promise<SaleState> {
  if (!stripe) return 'available';
  try {
    // Le ultime sessioni di checkout; filtro per lo slug messo nei metadata.
    const sessions = await stripe.checkout.sessions.list({ limit: 100 });
    const mine = sessions.data.filter((s) => s.metadata?.slug === slug);
    if (mine.some((s) => s.payment_status === 'paid' || s.status === 'complete')) {
      return 'sold';
    }
    const now = Math.floor(Date.now() / 1000);
    if (mine.some((s) => s.status === 'open' && (s.expires_at ?? 0) > now)) {
      return 'reserved';
    }
    return 'available';
  } catch {
    // In caso di problema con Stripe non blocchiamo la vetrina.
    return 'available';
  }
}

// --- Compatibilità con il vecchio flusso (non più necessari con l'approccio Stripe) ---
// Restano come no-op così i vecchi endpoint continuano a compilare; il webhook
// e il database non servono più. La prenotazione è gestita da getSaleState
// ('reserved' finché la sessione di checkout è aperta).
export async function reserve(): Promise<boolean> {
  return true;
}
export async function release(): Promise<void> {}
export async function markSold(): Promise<void> {}
