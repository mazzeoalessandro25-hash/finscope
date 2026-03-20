export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Cache 6 ore — i dati macro non cambiano ogni minuto
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');

  const TOKEN = process.env.FMP_API_KEY;
  if (!TOKEN) return res.status(500).json({ error: 'FMP_API_KEY non configurata' });

  // Recupera il mese richiesto oppure usa il corrente
  const now = new Date();
  const year  = parseInt(req.query.year  || now.getFullYear(),  10);
  const month = parseInt(req.query.month || now.getMonth() + 1, 10); // 1-based

  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to   = `${year}-${String(month).padStart(2,'0')}-${lastDay}`;

  try {
    const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${from}&to=${to}&apikey=${TOKEN}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`FMP ${r.status}`);
    const raw = await r.json();

    // FMP restituisce un array direttamente
    const list = Array.isArray(raw) ? raw : [];

    const events = list
      .filter(e => {
        const country = (e.country || '').toUpperCase();
        const impact  = (e.impact  || '').toLowerCase();
        return (country === 'US' || country === 'EU' || country === 'DE' || country === 'FR')
            && (impact === 'high' || impact === 'medium');
      })
      .map(e => {
        let type = 'macro';
        const ev = (e.event || '').toLowerCase();
        if (ev.includes('fed') || ev.includes('fomc') || ev.includes('powell')
         || ev.includes('federal reserve')) type = 'fed';
        else if (ev.includes('ecb') || ev.includes('european central bank')
              || ev.includes('lagarde') || ev.includes('bce')) type = 'bce';

        return {
          date:    e.date,          // "YYYY-MM-DD"
          label:   e.event,
          type,
          country: e.country || '',
          impact:  e.impact  || '',
          actual:  e.actual  ?? null,
          estimate:e.estimate?? null,
          prev:    e.previous?? null,
          unit:    e.unit    || '',
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return res.json({ ok: true, events, from, to });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
