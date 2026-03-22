export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const base  = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!base || !token) {
    return res.status(500).json({ error: 'KV non configurato' });
  }

  try {
    if (req.method === 'POST') {
      // Incrementa il contatore atomicamente
      const r = await fetch(`${base}/incr/finedge:visits`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      return res.json({ visits: d.result ?? 0 });
    }

    // GET — restituisce il valore corrente senza incrementare
    const r = await fetch(`${base}/get/finedge:visits`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    return res.json({ visits: d.result ? parseInt(d.result, 10) : 0 });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
