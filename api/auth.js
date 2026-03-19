export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;
  const SECRET = process.env.CLERK_SECRET_KEY;
  if (!SECRET) return res.status(500).json({ error: 'Configurazione mancante' });

  if (action === 'register' && req.method === 'POST') {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email e password richiesti' });
      if (password.length < 8) return res.status(400).json({ error: 'Password minimo 8 caratteri' });
      const r = await fetch('https://api.clerk.com/v1/users', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_address: [email], password }),
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = data.errors?.[0]?.long_message || data.errors?.[0]?.message || 'Errore registrazione';
        return res.status(400).json({ error: msg });
      }
      const tr = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: data.id, expires_in_seconds: 2592000 }),
      });
      const tokenData = await tr.json();
      return res.json({ ok: true, token: tokenData.token, user: { id: data.id, email: data.email_addresses?.[0]?.email_address } });
    } catch (e) {
      return res.status(500).json({ error: 'Errore del server: ' + e.message });
    }
  }

  if (action === 'login' && req.method === 'POST') {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email e password richiesti' });
      const ur = await fetch(`https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`, {
        headers: { 'Authorization': `Bearer ${SECRET}` },
      });
      const users = await ur.json();
      if (!users?.data?.length) return res.status(401).json({ error: 'Email non trovata' });
      const user = users.data[0];
      const vr = await fetch(`https://api.clerk.com/v1/users/${user.id}/verify_password`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!vr.ok) return res.status(401).json({ error: 'Password non corretta' });
      const tr = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, expires_in_seconds: 2592000 }),
      });
      const tokenData = await tr.json();
      return res.json({ ok: true, token: tokenData.token, user: { id: user.id, email: user.email_addresses?.[0]?.email_address } });
    } catch (e) {
      return res.status(500).json({ error: 'Errore del server: ' + e.message });
    }
  }

  if (action === 'verify' && req.method === 'GET') {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Token mancante' });
      const r = await fetch(`https://api.clerk.com/v1/sign_in_tokens/${token}`, {
        headers: { 'Authorization': `Bearer ${SECRET}` },
      });
      if (!r.ok) return res.status(401).json({ error: 'Token non valido' });
      const data = await r.json();
      if (data.status !== 'pending') return res.status(401).json({ error: 'Token scaduto' });
      const ur = await fetch(`https://api.clerk.com/v1/users/${data.user_id}`, {
        headers: { 'Authorization': `Bearer ${SECRET}` },
      });
      const user = await ur.json();
      return res.json({ ok: true, user: { id: user.id, email: user.email_addresses?.[0]?.email_address } });
    } catch (e) {
      return res.status(401).json({ error: 'Token non valido' });
    }
  }

  return res.status(404).json({ error: 'Azione non trovata' });
}
