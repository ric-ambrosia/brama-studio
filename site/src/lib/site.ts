import features from '../../config/features.json';
import shipping from '../../config/shipping.json';

// Identità pubblica del brand. Nessun nome proprio fuori da /legal/* e certificati.
export const SITE = {
  name: 'brama',
  domain: 'https://brama.studio',
  // Email pubblica del brand: la stessa del sito v1 online, reale e attiva
  // (decisione Riccardo 2026-07-25). Unico punto in cui il nome proprio compare nel sito.
  email: 'riccardo@brama.studio',
  // Redirect interno (vedi astro.config.mjs): l'handle reale contiene il nome
  // personale e non deve comparire nell'HTML pubblicato (audit brand §8).
  instagram: '/instagram',
  tagline: 'brama traduce le emozioni in materia',
};

export const FEATURES = features as {
  apparel: boolean;
  prints: boolean;
  lang_en: boolean;
  newsletter: boolean;
};

export const SHIPPING = shipping;

// Sezioni della barra di navigazione (la home è il logo).
// L'Esposizione è in fondo e staccata: è una mostra a tempo (flag `temp`).
export const NAV = [
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/shop', label: 'Shop' },
  { href: '/contatti', label: 'Contatti' },
  { href: '/esposizione', label: 'Esposizione', temp: true },
];

// The Seed Milano, sede dell'esposizione dal vivo.
export const VENUE = {
  name: 'The Seed',
  city: 'Milano',
  address: 'Viale Monte Nero 78',
  cap: '20135',
  maps: 'https://maps.google.com/?q=The+Seed+Milano,+Viale+Monte+Nero+78,+20135+Milano',
  from: '2026-05-01',
  to: '2026-09-09',
  dateLabel: 'dal 1 maggio al 9 settembre 2026',
};

export const LEGAL_NAV = [
  { href: '/legal/termini', label: 'Termini di vendita' },
  { href: '/legal/privacy', label: 'Privacy' },
  { href: '/legal/cookie', label: 'Cookie' },
  { href: '/legal/recesso', label: 'Recesso' },
  { href: '/legal/spedizioni', label: 'Spedizioni e resi' },
];
