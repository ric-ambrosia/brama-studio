// GET /api/state?slug=<slug> — stato di vendita runtime di un'opera.
// Usato dalle pagine statiche per nascondere il CTA di acquisto se l'opera
// è stata venduta/prenotata dopo l'ultimo deploy.
import type { APIRoute } from 'astro';
import { getSaleState } from '../../lib/availability';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get('slug');
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return new Response(JSON.stringify({ error: 'slug non valido' }), { status: 400 });
  }
  const state = await getSaleState(slug);
  return new Response(JSON.stringify({ slug, state }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
