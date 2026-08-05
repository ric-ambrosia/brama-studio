import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

// brama v2 — sito statico con API routes serverless (Stripe) su Vercel.
// Le pagine sono prerenderizzate; solo le route sotto /api/* girano on-demand.
export default defineConfig({
  site: 'https://brama.studio',
  output: 'static',
  adapter: vercel(),
  trailingSlash: 'never',
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/lab/') &&
        !page.endsWith('/lab') &&
        !page.includes('/grazie'),
    }),
  ],
  redirects: {
    // Il canale Instagram passa da un redirect interno: l'handle attuale contiene
    // il nome personale e non deve comparire nell'HTML pubblicato (audit brand §8).
    '/instagram': 'https://instagram.com/riccardo_bramani',
    // La pagina Opere era /portfolio: teniamo il vecchio indirizzo con un redirect.
    '/portfolio': '/opere',
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
