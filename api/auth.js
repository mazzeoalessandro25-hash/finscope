export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;
  const SECRET = process.env.CLERK_SECRET_KEY;
  if (!SECRET) return res.status(500).json({ error: 'Configurazione mancante' });

  // ── REGISTER ──
  if (action === 'register' && req.method === 'POST') {
    try {
      const { email, password, name } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email e password richiesti' });
      if (password.length < 8) return res.status(400).json({ error: 'Password minimo 8 caratteri' });

      const body = { email_address: [email], password };
      if (name) body.first_name = name;

      const r = await fetch('https://api.clerk.com/v1/users', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = data.errors?.[0]?.long_message || data.errors?.[0]?.message || 'Errore registrazione';
        return res.status(400).json({ error: msg });
      }

      return res.json({
        ok: true,
        token: data.id,
        user: { id: data.id, email: data.email_addresses?.[0]?.email_address, name: data.first_name || null }
      });
    } catch (e) {
      return res.status(500).json({ error: 'Errore del server: ' + e.message });
    }
  }

  // ── LOGIN ──
  if (action === 'login' && req.method === 'POST') {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email e password richiesti' });

      // Cerca utente — parametro corretto è email_address (array)
      const ur = await fetch(
        `https://api.clerk.com/v1/users?email_address[]=${encodeURIComponent(email)}&limit=1`,
        { headers: { 'Authorization': `Bearer ${SECRET}` } }
      );
      const usersData = await ur.json();
      const users = usersData?.data || usersData;
      if (!Array.isArray(users) || !users.length) {
        return res.status(401).json({ error: 'Email non trovata' });
      }
      const user = users[0];

      // Verifica password
      const vr = await fetch(`https://api.clerk.com/v1/users/${user.id}/verify_password`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!vr.ok) {
        return res.status(401).json({ error: 'Password non corretta' });
      }

      return res.json({
        ok: true,
        token: user.id,
        user: { id: user.id, email: user.email_addresses?.[0]?.email_address, name: user.first_name || null }
      });
    } catch (e) {
      return res.status(500).json({ error: 'Errore del server: ' + e.message });
    }
  }

  // ── VERIFY TOKEN ──
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

      return res.json({
        ok: true,
        user: { id: user.id, email: user.email_addresses?.[0]?.email_address }
      });
    } catch (e) {
      return res.status(401).json({ error: 'Token non valido' });
    }
  }

  return res.status(404).json({ error: 'Azione non trovata' });
}
