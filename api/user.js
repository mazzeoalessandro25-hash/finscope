import { createClerkClient } from '@clerk/backend';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// Vercel KV helper
async function kv(method, key, value) {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!base || !token) throw new Error('KV non configurato');

  if (method === 'GET') {
    const r = await fetch(`${base}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const d = await r.json();
    return d.result ? JSON.parse(d.result) : null;
  }
  if (method === 'SET') {
    await fetch(`${base}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(JSON.stringify(value))
    });
    return true;
  }
}

async function getUserFromToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try {
    const tokenData = await clerk.signInTokens.getSignInToken(token);
    if (!tokenData || tokenData.status !== 'pending') return null;
    return await clerk.users.getUser(tokenData.userId);
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Non autenticato' });

  const uid = user.id;
  const { type } = req.query;

  // ── LOAD ALL USER DATA ──
  if (req.method === 'GET' && type === 'all') {
    const [watchlist, portfolio, prefs] = await Promise.all([
      kv('GET', `${uid}:watchlist`),
      kv('GET', `${uid}:portfolio`),
      kv('GET', `${uid}:prefs`),
    ]);
    return res.json({
      watchlist: watchlist || [],
      portfolio: portfolio || [],
      prefs: prefs || {}
    });
  }

  // ── SAVE WATCHLIST ──
  if (req.method === 'POST' && type === 'watchlist') {
    const { watchlist } = req.body;
    await kv('SET', `${uid}:watchlist`, watchlist || []);
    return res.json({ ok: true });
  }

  // ── SAVE PORTFOLIO ──
  if (req.method === 'POST' && type === 'portfolio') {
    const { portfolio } = req.body;
    await kv('SET', `${uid}:portfolio`, portfolio || []);
    return res.json({ ok: true });
  }

  // ── SAVE PREFS ──
  if (req.method === 'POST' && type === 'prefs') {
    const { prefs } = req.body;
    await kv('SET', `${uid}:prefs`, prefs || {});
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Tipo non valido' });
}
