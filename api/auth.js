import { createClerkClient } from '@clerk/backend';
import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

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
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email richiesta' });

      const result = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
      const users = result.data ?? result;
      if (!Array.isArray(users) || !users.length) {
        // Non rivelare se l'email esiste (sicurezza), ma per questa app personale
        // restituiamo un messaggio generico senza codice
        return res.json({ ok: true, code: null });
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

      // Nota: in produzione integrare un servizio email (es. Resend) per inviare il codice.
      // Per ora il codice viene restituito nella risposta per uso senza email.
      return res.json({ ok: true, code });
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
