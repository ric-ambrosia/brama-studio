import type { CollectionEntry } from 'astro:content';

export type Work = CollectionEntry<'works'>;
export type WorkStatus = Work['data']['status'];

/**
 * Stato effettivo di un'opera al momento del build: il campo `status` nel
 * contenuto (.md). Lo stato "live" (venduto/riservato dopo l'ultimo deploy)
 * arriva a runtime dalle pagine opera via /api/state, che legge da Stripe.
 */
export async function effectiveStatus(work: Work): Promise<WorkStatus> {
  return work.data.status;
}

export const STATUS_LABEL: Record<WorkStatus, string> = {
  available: 'Disponibile',
  sold: 'Venduto',
  reserved: 'Riservato',
  'not-for-sale': 'Non in vendita',
  'coming-soon': 'In lavorazione',
};

export function formatSize(size: { w: number; h: number } | null): string {
  return size ? `${size.w}×${size.h} cm` : 'n.d.';
}

const EUR = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export function formatPrice(price: number): string {
  if (price <= 0) return 'Prezzo su richiesta';
  return EUR.format(price);
}

export interface PriceInfo {
  onRequest: boolean; // prezzo non ancora fornito → "su richiesta"
  current: string; // prezzo da pagare, formattato
  full: string | null; // prezzo pieno barrato, se c'è sconto
  discountPct: number | null; // percentuale di sconto arrotondata, se c'è
}

/**
 * Info prezzo con eventuale sconto: mostra il prezzo pieno (`priceFull`) barrato
 * accanto al corrente (`price`) quando priceFull > price. Il prezzo addebitato
 * (checkout/Stripe) resta sempre `price`.
 */
export function priceInfo(data: { price: number; priceFull?: number }): PriceInfo {
  const current = data.price;
  const full = data.priceFull ?? 0;
  if (current <= 0) {
    return { onRequest: true, current: 'Prezzo su richiesta', full: null, discountPct: null };
  }
  const hasDiscount = full > current;
  return {
    onRequest: false,
    current: EUR.format(current),
    full: hasDiscount ? EUR.format(full) : null,
    discountPct: hasDiscount ? Math.round((1 - current / full) * 100) : null,
  };
}

/** Ordina per journey.order (le opere del Viaggio prima, poi le altre per anno). */
export function byJourneyOrder(a: Work, b: Work): number {
  const ao = a.data.journey.featured ? a.data.journey.order : 1000 - a.data.year;
  const bo = b.data.journey.featured ? b.data.journey.order : 1000 - b.data.year;
  return ao - bo;
}
