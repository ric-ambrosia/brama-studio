// POST /api/request-buy — richiesta di INFORMAZIONI su un'opera "grande" (non Emozioni).
// Il cliente lascia nome, cognome, email e un messaggio facoltativo. Il server:
// (1) invia la notifica a brama (reply-to = interessato), (2) manda all'interessato
// una conferma automatica. Titolo e prezzo li ricava il SERVER dallo slug (mai dal
// client). Nessun acquisto qui: il contatto è diretto, spedizione ecc. si vedono dopo.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../../lib/site';
import { sendMail, esc } from '../../lib/mailer';

export const prerender = false;

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Destinatari della notifica: da REQUEST_NOTIFY (lista separata da virgole, tenuta
// fuori dal repo perché contiene indirizzi personali); default = solo brand email.
const notifyList = (): string[] => {
  const env = process.env.REQUEST_NOTIFY;
  const list = env ? env.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return list.length ? list : [SITE.email];
};

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'body non valido' });
  }

  const nome = String(body.nome ?? '').trim();
  const cognome = String(body.cognome ?? '').trim();
  const email = String(body.email ?? '').trim();
  const messaggio = String(body.messaggio ?? '').trim().slice(0, 2000);
  const slug = String(body.slug ?? '').trim();
  const consenso = body.consenso === true;

  if (!nome || !cognome) return json(400, { error: 'Nome e cognome sono obbligatori.' });
  if (!EMAIL_RE.test(email)) return json(400, { error: 'Email non valida.' });
  if (!consenso) return json(400, { error: 'Serve il consenso al trattamento dei dati.' });

  // Opera dal contenuto = fonte di verità per titolo e prezzo.
  const works = await getCollection('works');
  const work = works.find((w) => w.id === slug);
  if (!work) return json(404, { error: 'Opera non trovata.' });

  const title = work.data.title;
  const price = work.data.price || 0;
  const size = work.data.size ? `${work.data.size.w}×${work.data.size.h} cm` : '';
  const priceLabel = price > 0 ? `€ ${price.toLocaleString('it-IT')}` : 'su richiesta';
  const url = new URL(`/opera/${slug}`, SITE.domain).href;
  const person = `${nome} ${cognome}`;
  const when = new Date().toLocaleString('it-IT', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Rome',
  });
  const from = process.env.REQUEST_FROM || `brama <${SITE.email}>`;

  // (1) Notifica a brama — reply-to = interessato, così si risponde direttamente.
  const rows: [string, string][] = [
    ['Opera', `${title}${size ? ` — ${size}` : ''}`],
    ['Prezzo', priceLabel],
    ['Da', person],
    ['Email', email],
    ['Messaggio', messaggio || '—'],
    ['Pagina', url],
    ['Ricevuta il', when],
  ];
  const notifyHtml = `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#111">
    <h2 style="margin:0 0 12px;font-weight:600">Nuova richiesta di informazioni</h2>
    <table style="border-collapse:collapse">${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 14px 4px 0;color:#666;vertical-align:top;white-space:nowrap">${esc(
            k
          )}</td><td style="padding:4px 0">${esc(v)}</td></tr>`
      )
      .join('')}</table>
    <p style="margin:16px 0 0;color:#666">Rispondi a questa email per scrivere direttamente a ${esc(person)}.</p>
  </div>`;
  const notifyText =
    `Nuova richiesta di informazioni\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
    `\n\nRispondi a questa email per scrivere alla persona.`;

  const notify = await sendMail({
    to: notifyList(),
    from,
    replyTo: email,
    subject: `Richiesta informazioni: «${title}»`,
    html: notifyHtml,
    text: notifyText,
  });

  // (2) Conferma automatica all'interessato (best-effort, non blocca la richiesta).
  if (notify.ok || notify.skipped) {
    const confHtml = `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.7;color:#111">
      <p>Ciao ${esc(nome)},</p>
      <p>ho ricevuto la tua richiesta di informazioni su <strong>«${esc(title)}»</strong>${
        size ? ` (${esc(size)})` : ''
      }. Ti scrivo io a breve, di persona, con tutte le informazioni.</p>
      <p>A presto,<br>brama</p>
    </div>`;
    const confText =
      `Ciao ${nome},\n\n` +
      `ho ricevuto la tua richiesta di informazioni su «${title}»${size ? ` (${size})` : ''}. ` +
      `Ti scrivo io a breve, di persona, con tutte le informazioni.\n\n` +
      `A presto,\nbrama`;
    await sendMail({
      to: email,
      from,
      replyTo: SITE.email,
      subject: `Abbiamo ricevuto la tua richiesta — ${title}`,
      html: confHtml,
      text: confText,
    }).catch(() => {});
  }

  // Esito.
  if (notify.ok) return json(200, { ok: true });
  if (notify.skipped) {
    // In sviluppo (nessuna chiave) il flusso è comunque verificabile; in
    // produzione una configurazione mancante è un errore da segnalare.
    if (import.meta.env.PROD)
      return json(503, { error: `Le richieste non sono ancora attive. Scrivimi a ${SITE.email}.` });
    return json(200, { ok: true, dev: true });
  }
  return json(502, {
    error: `Non è stato possibile inviare la richiesta. Riprova tra poco o scrivimi a ${SITE.email}.`,
  });
};
