import { createClerkClient } from '@clerk/backend';
import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { Resend } from 'resend';

const scryptAsync = promisify(scrypt);

async function hashPw(password) {
  const salt = randomBytes(16).toString('hex');
  const buf = await scryptAsync(password, salt, 64);
  return `${salt}:${buf.toString('hex')}`;
}

async function verifyPw(password, stored) {
  const [salt, hash] = stored.split(':');
  const hashBuf = Buffer.from(hash, 'hex');
  const derivedBuf = await scryptAsync(password, salt, 64);
  return timingSafeEqual(hashBuf, derivedBuf);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SECRET = process.env.CLERK_SECRET_KEY;
  if (!SECRET) return res.status(500).json({ error: 'Configurazione mancante' });

  const clerk = createClerkClient({ secretKey: SECRET });
  const { action } = req.query;

  // ── REGISTER ──
  if (action === 'register' && req.method === 'POST') {
    try {
      const { email, password, name } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email e password richiesti' });
      if (password.length < 8) return res.status(400).json({ error: 'Password minimo 8 caratteri' });

      const pwHash = await hashPw(password);

      const createBody = { emailAddress: [email], skipPasswordRequirement: true };
      if (name) createBody.firstName = name;

      const user = await clerk.users.createUser(createBody);

      await clerk.users.updateUserMetadata(user.id, {
        privateMetadata: { pwHash },
      });

      return res.json({
        ok: true,
        token: user.id,
        user: { id: user.id, email: user.emailAddresses?.[0]?.emailAddress, name: user.firstName || null },
      });
    } catch (e) {
      const msg = e.errors?.[0]?.longMessage || e.errors?.[0]?.message || e.message || 'Errore registrazione';
      return res.status(400).json({ error: msg });
    }
  }

  // ── LOGIN ──
  if (action === 'login' && req.method === 'POST') {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email e password richiesti' });

      const result = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
      const users = result.data ?? result;
      if (!Array.isArray(users) || !users.length) {
        return res.status(401).json({ error: 'Email non trovata' });
      }
      const user = users[0];
      const pwHash = user.privateMetadata?.pwHash;

      if (!pwHash) {
        // Account vecchio senza hash — chiedi di re-registrarsi
        return res.status(401).json({
          error: 'Account non aggiornato. Elimina l\'account e registrati di nuovo.',
        });
      }

      const valid = await verifyPw(password, pwHash);
      if (!valid) return res.status(401).json({ error: 'Password non corretta' });

      return res.json({
        ok: true,
        token: user.id,
        user: { id: user.id, email: user.emailAddresses?.[0]?.emailAddress, name: user.firstName || null },
      });
    } catch (e) {
      return res.status(500).json({ error: 'Errore del server: ' + e.message });
    }
  }

  // ── FORGOT PASSWORD ──
  if (action === 'forgot' && req.method === 'POST') {
    try {
      const { email, lang } = req.body;
      const isEN = lang === 'en';
      if (!email) return res.status(400).json({ error: 'Email richiesta' });

      const result = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
      const users = result.data ?? result;
      if (!Array.isArray(users) || !users.length) {
        // Non rivelare se l'email esiste (sicurezza)
        return res.json({ ok: true });
      }

      const user = users[0];
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiry = Date.now() + 15 * 60 * 1000; // 15 minuti

      await clerk.users.updateUserMetadata(user.id, {
        privateMetadata: {
          ...user.privateMetadata,
          resetCode: code,
          resetExpiry: expiry,
        },
      });

      // Invia codice via email con Resend
      const RESEND_KEY = process.env.RESEND_API_KEY;
      if (RESEND_KEY) {
        const resend = new Resend(RESEND_KEY);
        await resend.emails.send({
          from: 'FinEdge <noreply@finedge.it>',
          to: email,
          subject: isEN
            ? `Your password reset code — FinEdge`
            : `Il tuo codice di reset password — FinEdge`,
          html: isEN ? `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#F0F4FA;border-radius:12px">
              <div style="font-size:22px;font-weight:800;color:#1448A8;margin-bottom:8px">FinEdge</div>
              <h2 style="font-size:18px;font-weight:700;color:#0F1C2E;margin-bottom:16px">Password reset</h2>
              <p style="color:#4A6080;font-size:14px;margin-bottom:24px">
                You requested a password reset. Use the code below — valid for 15 minutes.
              </p>
              <div style="background:#fff;border:1px solid #D8E2EF;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px">
                <div style="font-family:monospace;font-size:36px;font-weight:700;letter-spacing:8px;color:#1448A8">${code}</div>
              </div>
              <p style="color:#8499B0;font-size:12px">
                If you did not request a password reset, ignore this email. Your account is safe.
              </p>
            </div>
          ` : `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#F0F4FA;border-radius:12px">
              <div style="font-size:22px;font-weight:800;color:#1448A8;margin-bottom:8px">FinEdge</div>
              <h2 style="font-size:18px;font-weight:700;color:#0F1C2E;margin-bottom:16px">Reset della password</h2>
              <p style="color:#4A6080;font-size:14px;margin-bottom:24px">
                Hai richiesto il reset della password. Usa il codice qui sotto — valido per 15 minuti.
              </p>
              <div style="background:#fff;border:1px solid #D8E2EF;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px">
                <div style="font-family:monospace;font-size:36px;font-weight:700;letter-spacing:8px;color:#1448A8">${code}</div>
              </div>
              <p style="color:#8499B0;font-size:12px">
                Se non hai richiesto il reset della password, ignora questa email. Il tuo account è al sicuro.
              </p>
            </div>
          `,
        });
      }

      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: 'Errore del server: ' + e.message });
    }
  }

  // ── RESET PASSWORD ──
  if (action === 'reset' && req.method === 'POST') {
    try {
      const { email, code, newPassword } = req.body;
      if (!email || !code || !newPassword) return res.status(400).json({ error: 'Dati mancanti' });
      if (newPassword.length < 8) return res.status(400).json({ error: 'Password minimo 8 caratteri' });

      const result = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
      const users = result.data ?? result;
      if (!Array.isArray(users) || !users.length) {
        return res.status(401).json({ error: 'Codice non valido o scaduto' });
      }

      const user = users[0];
      const meta = user.privateMetadata || {};

      if (!meta.resetCode || !meta.resetExpiry) {
        return res.status(401).json({ error: 'Nessun reset richiesto. Genera prima un nuovo codice.' });
      }
      if (Date.now() > meta.resetExpiry) {
        return res.status(401).json({ error: 'Codice scaduto (15 min). Richiedi un nuovo codice.' });
      }
      if (meta.resetCode !== String(code)) {
        return res.status(401).json({ error: 'Codice non corretto' });
      }

      const pwHash = await hashPw(newPassword);
      await clerk.users.updateUserMetadata(user.id, {
        privateMetadata: {
          ...meta,
          pwHash,
          resetCode: null,
          resetExpiry: null,
        },
      });

      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: 'Errore del server: ' + e.message });
    }
  }

  // ── VERIFY TOKEN ──
  if (action === 'verify' && req.method === 'GET') {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Token mancante' });

      const user = await clerk.users.getUser(token);
      return res.json({
        ok: true,
        user: { id: user.id, email: user.emailAddresses?.[0]?.emailAddress, name: user.firstName || null },
      });
    } catch (e) {
      return res.status(401).json({ error: 'Token non valido' });
    }
  }

  return res.status(404).json({ error: 'Azione non trovata' });
}
