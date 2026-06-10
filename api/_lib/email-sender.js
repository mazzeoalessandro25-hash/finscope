/**
 * api/_lib/email-sender.js
 * Interfaccia astratta per l'invio di email.
 *
 * Uso:
 *   import { getEmailSender } from './_lib/email-sender.js';
 *   const sender = getEmailSender();
 *   await sender.send({ to: 'user@example.com', subject: '...', html: '...' });
 *
 * Integrazione Resend: quando pronto, creare ResendEmailSender
 * e aggiornare getEmailSender() per restituirlo se RESEND_API_KEY è presente.
 */

// ── Classe base astratta ──────────────────────────────────────
export class EmailSender {
  /**
   * Invia un'email.
   * @param {{ to: string|string[], subject: string, html: string, from?: string }} opts
   * @returns {Promise<{ ok: boolean, id?: string, error?: string }>}
   */
  // eslint-disable-next-line no-unused-vars
  async send(opts) {
    throw new Error('EmailSender.send() non implementato');
  }
}

// ── No-op: logga ma non invia ─────────────────────────────────
export class NoopEmailSender extends EmailSender {
  async send({ to, subject }) {
    const toList = Array.isArray(to) ? to : [to];
    console.log(`[NoopEmailSender] Email NON inviata — to: ${toList.join(', ')} | subject: ${subject}`);
    return { ok: true, id: 'noop-' + Date.now() };
  }
}

// ── Factory ───────────────────────────────────────────────────
/**
 * Restituisce l'implementazione corretta in base alla configurazione.
 * Quando Resend sarà integrato, aggiungere qui il branch RESEND_API_KEY.
 */
export function getEmailSender() {
  // TODO: se process.env.RESEND_API_KEY → return new ResendEmailSender(...)
  return new NoopEmailSender();
}
