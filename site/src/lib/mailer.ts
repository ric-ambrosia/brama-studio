// Invio email transazionali per il flusso "richiesta d'acquisto" delle opere grandi.
// Due modi, in ordine di preferenza:
//   1) SMTP (nodemailer) sulla casella brama.studio già esistente — nessun account
//      esterno, nessun record DNS: bastano host/porta/utente/password.
//   2) Resend (HTTP API) se è impostata RESEND_API_KEY.
// Se non è configurato nulla, l'invio viene saltato e loggato: in sviluppo il
// flusso resta testabile, in produzione /api/request-buy risponde con un errore.
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type Mail = {
  to: string | string[];
  from: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export type SendResult = { ok: boolean; skipped?: boolean; status?: number; detail?: string };

// Transporter SMTP creato una volta sola (riusato tra invocazioni "calde").
let smtp: Transporter | null | undefined;
function getSmtp(): Transporter | null {
  if (smtp !== undefined) return smtp;
  const host = process.env.SMTP_HOST;
  if (!host) {
    smtp = null;
    return smtp;
  }
  const port = Number(process.env.SMTP_PORT || 465);
  smtp = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = SSL/TLS diretto; 587 = STARTTLS (es. iCloud)
    requireTLS: port !== 465, // su 587 pretende STARTTLS: niente invii in chiaro
    auth:
      process.env.SMTP_USER || process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  return smtp;
}

export async function sendMail(mail: Mail): Promise<SendResult> {
  const to = Array.isArray(mail.to) ? mail.to : [mail.to];

  // 1) SMTP sulla casella esistente.
  const tx = getSmtp();
  if (tx) {
    try {
      await tx.sendMail({
        from: mail.from,
        to,
        replyTo: mail.replyTo,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      return { ok: true };
    } catch (err) {
      console.error('[mailer] invio SMTP fallito', err);
      return { ok: false, detail: String(err) };
    }
  }

  // 2) Resend, se configurato.
  const key = process.env.RESEND_API_KEY;
  if (key) {
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: mail.from,
          to,
          reply_to: mail.replyTo,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error('[mailer] invio Resend fallito', res.status, detail);
        return { ok: false, status: res.status, detail };
      }
      return { ok: true };
    } catch (err) {
      console.error('[mailer] errore di rete Resend', err);
      return { ok: false, detail: String(err) };
    }
  }

  // 3) Niente configurato → salta (loggando).
  console.warn(`[mailer] nessun invio configurato (SMTP/Resend assenti) — email NON inviata: "${mail.subject}" → ${to.join(', ')}`);
  return { ok: false, skipped: true };
}

// Escape minimale per interpolare testo dell'utente dentro l'HTML delle email.
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
