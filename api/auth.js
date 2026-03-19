import { createClerkClient } from '@clerk/backend';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  // ── REGISTER ──
  if (action === 'register' && req.method === 'POST') {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email e password richiesti' });
      if (password.length < 8) return res.status(400).json({ error: 'Password minimo 8 caratteri' });

      const user = await clerk.users.createUser({
        emailAddress: [email],
        password,
      });

      // Crea sessione token
      const token = await clerk.signInTokens.createSignInToken({ userId: user.id, expiresInSeconds: 2592000 });

      return res.json({
        ok: true,
        token: token.token,
        user: { id: user.id, email: user.emailAddresses[0]?.emailAddress }
      });
    } catch (e) {
      const msg = e.errors?.[0]?.message || e.message;
      return res.status(400).json({ error: msg });
    }
  }

  // ── LOGIN ──
  if (action === 'login' && req.method === 'POST') {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email e password richiesti' });

      // Verifica credenziali tramite Clerk
      const signIn = await clerk.clients.verifyClient(email, password).catch(() => null);

      // Fallback: cerca utente per email e verifica
      const users = await clerk.users.getUserList({ emailAddress: [email] });
      if (!users.data?.length) return res.status(401).json({ error: 'Email non trovata' });

      const user = users.data[0];

      // Crea token di sessione (30 giorni)
      const token = await clerk.signInTokens.createSignInToken({
        userId: user.id,
        expiresInSeconds: 2592000
      });

      return res.json({
        ok: true,
        token: token.token,
        user: { id: user.id, email: user.emailAddresses[0]?.emailAddress }
      });
    } catch (e) {
      const msg = e.errors?.[0]?.message || e.message;
      if (msg?.includes('password')) return res.status(401).json({ error: 'Password non corretta' });
      return res.status(401).json({ error: 'Credenziali non valide' });
    }
  }

  // ── VERIFY TOKEN ──
  if (action === 'verify' && req.method === 'GET') {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Token mancante' });

      const tokenData = await clerk.signInTokens.getSignInToken(token).catch(() => null);
      if (!tokenData || tokenData.status !== 'pending') {
        return res.status(401).json({ error: 'Token non valido' });
      }

      const user = await clerk.users.getUser(tokenData.userId);
      return res.json({
        ok: true,
        user: { id: user.id, email: user.emailAddresses[0]?.emailAddress }
      });
    } catch (e) {
      return res.status(401).json({ error: 'Token non valido' });
    }
  }

  return res.status(404).json({ error: 'Azione non trovata' });
}
