import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// §4.1 — Opere: pezzi unici. `id` è lo slug stabile usato da URL e QR fisici.
const works = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/works' }),
  schema: z.object({
    title: z.string(),
    year: z.number(),
    city: z.string().optional(),
    size: z.object({ w: z.number(), h: z.number() }).nullable().default(null), // cm
    materials: z.array(z.string()).default([]),
    collection: z.enum(['core', 'emozioni', 'disegni', 'cinetica']).default('core'),
    // Nome della serie (es. cinetica "Clessidra"), mostrato nell'eyebrow. Le
    // opere cinetiche possono appartenere a serie diverse (Battiti, Clessidra...).
    series: z.string().optional(),
    images: z
      .object({
        main: z.string().optional(),
        details: z.array(z.string()).default([]),
      })
      .default({ details: [] }),
    // Opere cinetiche: modello 3D (glTF binari Draco) per il visore montaggio.
    // `animato` = GLB con l'animazione del meccanismo. `parti` (opzionale) = GLB
    // statico per il montaggio a scroll (Battiti). Senza `parti` il visore mostra
    // il meccanismo che gira + rotazione libera, senza montaggio (Clessidra).
    model3d: z
      .object({ parti: z.string().optional(), animato: z.string() })
      .optional(),
    // Video hero in loop (mp4): mostra il movimento dell'opera al posto della foto.
    video: z.string().optional(),
    interaction: z.string().optional(),
    philosophy: z.string().optional(),
    status: z
      .enum(['available', 'sold', 'reserved', 'not-for-sale', 'coming-soon'])
      .default('not-for-sale'),
    // `price` = prezzo attuale, quello effettivamente addebitato (l'eventuale
    // scontato). `priceFull` = prezzo pieno/di listino: se > price viene mostrato
    // barrato accanto allo scontato. 0 = da fornire.
    price: z.number().default(0), // EUR — prezzo corrente (scontato se c'è sconto)
    priceFull: z.number().default(0), // EUR — prezzo pieno di listino (0 = nessuno)
    stripeProductId: z.string().default(''),
    shippingClass: z.enum(['small', 'medium', 'large']).default('medium'),
    journey: z
      .object({ featured: z.boolean().default(false), order: z.number().default(0) })
      .default({ featured: false, order: 0 }),
    // Dati non confermati: incongruenze sito/PDF flaggate qui (punto aperto §9.7)
    dataNotes: z.string().optional(),
  }),
});

// §4.2 — Prodotti (abbigliamento/stampe, futuro). Categoria dietro feature flag.
const products = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/products' }),
  schema: z.object({
    type: z.enum(['apparel', 'print']),
    title: z.string(),
    images: z.array(z.string()).default([]),
    variants: z
      .array(
        z.object({
          sku: z.string(),
          size: z.string().optional(),
          color: z.string().optional(),
          stock: z.number().default(0),
          stripePriceId: z.string().default(''),
        })
      )
      .default([]),
    price: z.number().default(0),
    status: z.enum(['hidden', 'preorder', 'available', 'sold-out']).default('hidden'),
    shippingClass: z.enum(['small', 'medium', 'large', 'apparel']).default('apparel'),
    stripeProductId: z.string().default(''),
  }),
});

export const collections = { works, products };
