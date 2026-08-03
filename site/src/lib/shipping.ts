// Modello di spedizione: zona (da paese) × taglia (da opera) → tariffa.
// Le cifre vivono in config/shipping.json (unica fonte, modificabile).
import shipping from '../../config/shipping.json';
import type { Work } from './works';

export type Zone = 'IT' | 'EU' | 'WORLD';
export type Tier = 'emozioni' | 'small' | 'medium' | 'large' | 'xlarge' | 'oversize';

const EU: string[] = shipping.zones.EU;

/** Zona di spedizione dal codice paese ISO-2. */
export function zoneForCountry(cc: string): Zone {
  if (cc === 'IT') return 'IT';
  if (EU.includes(cc)) return 'EU';
  return 'WORLD';
}

/** Taglia di spedizione dell'opera, dedotta da collezione e misure (scatola con imballo). */
export function shippingTier(data: Work['data']): Tier {
  if (data.collection === 'emozioni') return 'emozioni';
  const s = data.size;
  if (!s) return 'medium';
  const long = Math.max(s.w, s.h);
  if (s.w >= 150 && s.h >= 150) return 'oversize';
  if (long >= 140) return 'xlarge';
  if (long >= 110) return 'large';
  if (long >= 90) return 'medium';
  return 'small';
}

type TierRow = Record<Zone, number | null>;
const TIERS = shipping.tiers as Record<Tier, TierRow & { label: string }>;

/** Tariffa corriere in centesimi per taglia+zona; null = su preventivo. */
export function courierAmount(tier: Tier, zone: Zone): number | null {
  const row = TIERS[tier];
  return row ? (row[zone] ?? null) : null;
}

export const OPTIONS = shipping.options as {
  pickup: { label: string; price: number; until?: string };
  handMilan: { label: string; price: number; onlyZone?: string };
};

export const DELIVERY_DAYS = shipping.deliveryDays as Record<Zone, number[]>;
export const INSURANCE_NOTE = shipping.insuranceNote;
export const QUOTE_NOTE = shipping.quoteNote;

/** Config compatta passata al calcolatore lato client (JSON nel data-attribute). */
export function shippingClientConfig(tier: Tier) {
  return {
    tier,
    rates: TIERS[tier], // { IT, EU, WORLD } in centesimi (o null)
    options: {
      pickup: OPTIONS.pickup.price,
      handMilan: OPTIONS.handMilan.price,
    },
    days: DELIVERY_DAYS,
    eu: EU,
  };
}

/** Centesimi → "1.234 €" (it-IT, senza decimali se interi). */
export function euro(cents: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

// Paesi del selettore: Italia, poi UE (nomi it), poi "Resto del mondo".
export const EU_COUNTRIES: { code: string; name: string }[] = [
  { code: 'AT', name: 'Austria' }, { code: 'BE', name: 'Belgio' }, { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croazia' }, { code: 'CY', name: 'Cipro' }, { code: 'CZ', name: 'Rep. Ceca' },
  { code: 'DK', name: 'Danimarca' }, { code: 'EE', name: 'Estonia' }, { code: 'FI', name: 'Finlandia' },
  { code: 'FR', name: 'Francia' }, { code: 'DE', name: 'Germania' }, { code: 'GR', name: 'Grecia' },
  { code: 'HU', name: 'Ungheria' }, { code: 'IE', name: 'Irlanda' }, { code: 'LV', name: 'Lettonia' },
  { code: 'LT', name: 'Lituania' }, { code: 'LU', name: 'Lussemburgo' }, { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Paesi Bassi' }, { code: 'PL', name: 'Polonia' }, { code: 'PT', name: 'Portogallo' },
  { code: 'RO', name: 'Romania' }, { code: 'SK', name: 'Slovacchia' }, { code: 'SI', name: 'Slovenia' },
  { code: 'ES', name: 'Spagna' }, { code: 'SE', name: 'Svezia' },
];

// Paesi ammessi al checkout quando la zona è WORLD (destinazioni extra-UE comuni).
export const WORLD_COUNTRIES: string[] = [
  'GB', 'CH', 'NO', 'IS', 'US', 'CA', 'AU', 'NZ', 'JP', 'KR', 'SG', 'HK',
  'AE', 'IL', 'BR', 'MX', 'ZA', 'TR',
];

/** Lista paesi ISO-2 ammessi al checkout per una zona (per Stripe allowed_countries). */
export function allowedCountries(zone: Zone): string[] {
  if (zone === 'IT') return ['IT'];
  if (zone === 'EU') return EU;
  return [...EU, 'IT', ...WORLD_COUNTRIES];
}
