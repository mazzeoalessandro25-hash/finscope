// Helper per Vercel KV (Upstash Redis REST)
async function kvCmd(...args) {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!base || !token) return null;
  try {
    const r = await fetch(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    const d = await r.json();
    return d.result ?? null;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minuti = "online ora"
  const cutoff = now - windowMs;
  const visitorKey = 'fs:visitors:active';
  const totalKey = 'fs:visits:total';

  // ── Registra visita (POST o GET con ?visit=1) ──
  const isVisit = req.method === 'POST' || req.query.visit === '1';
  if (isVisit) {
    // Genera ID visita univoco (timestamp + random)
    const vid = `${now}-${Math.random().toString(36).slice(2, 8)}`;
    // ZADD: aggiungi visitatore con score = timestamp
    await kvCmd('ZADD', visitorKey, now, vid);
    // Rimuovi visitatori più vecchi di 15 min
    await kvCmd('ZREMRANGEBYSCORE', visitorKey, 0, cutoff);
    // Imposta TTL 20 min sulla chiave per pulizia automatica
    await kvCmd('EXPIRE', visitorKey, 1200);
    // Incrementa contatore totale visite
    await kvCmd('INCR', totalKey);
  }

  // ── Leggi dati in parallelo ──
  const SECRET = process.env.CLERK_SECRET_KEY;

  const [visitorsActiveRaw, totalViewsRaw, clerkRes] = await Promise.all([
    kvCmd('ZCOUNT', visitorKey, cutoff, '+inf'),
    kvCmd('GET', totalKey),
    SECRET ? fetch('https://api.clerk.com/v1/users/count', {
      headers: { Authorization: `Bearer ${SECRET}` }
    }).then(r => r.json()).catch(() => ({ total_count: 0 })) : Promise.resolve({ total_count: 0 })
  ]);

  const registeredCount = clerkRes?.total_count ?? 0;
  const activeVisitors = parseInt(visitorsActiveRaw) || 0;
  const totalViews = parseInt(totalViewsRaw) || 0;

  // Cache breve: 30 secondi
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=10');
  return res.json({
    count: registeredCount,       // utenti registrati
    online: activeVisitors,       // visitatori attivi negli ultimi 15 min
    views: totalViews             // visite totali di sempre
  });
}
