export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Cache 6 ore — i dati macro non cambiano ogni minuto
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');

  const TOKEN = process.env.FINNHUB_API_KEY;
  if (!TOKEN) return res.status(500).json({ error: 'FINNHUB_API_KEY non configurata' });

  // Recupera il mese richiesto oppure usa il corrente
  const now = new Date();
  const year  = parseInt(req.query.year  || now.getFullYear(),  10);
  const month = parseInt(req.query.month || now.getMonth() + 1, 10); // 1-based

  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to   = `${year}-${String(month).padStart(2,'0')}-${lastDay}`;

  try {
    const url = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${TOKEN}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Finnhub ${r.status}`);
    const data = await r.json();

    const events = (data.economicCalendar || [])
      // Solo eventi USA e Eurozona ad alto/medio impatto
      .filter(e => {
        const country = (e.country || '').toUpperCase();
        const impact  = (e.impact  || '').toLowerCase();
        return (country === 'US' || country === 'EU' || country === 'DE' || country === 'FR')
            && (impact === 'high' || impact === 'medium');
      })
      .map(e => {
        // Determina tipo per colore
        let type = 'macro';
        const ev = (e.event || '').toLowerCase();
        if (ev.includes('fed') || ev.includes('fomc') || ev.includes('powell')) type = 'fed';
        else if (ev.includes('ecb') || ev.includes('bce') || ev.includes('lagarde')
              || ev.includes('european central')) type = 'bce';

        return {
          date:   e.time,           // "YYYY-MM-DD"
          label:  e.event,
          type,
          detail: buildDetail(e),
          country: e.country || '',
          impact:  e.impact  || '',
          actual:  e.actual  ?? null,
          estimate:e.estimate?? null,
          prev:    e.prev    ?? null,
          unit:    e.unit    || '',
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return res.json({ ok: true, events, from, to });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function buildDetail(e) {
  const parts = [];
  if (e.country) parts.push(e.country);
  if (e.impact)  parts.push(`Impatto: ${e.impact}`);
  if (e.estimate != null) parts.push(`Stima: ${e.estimate}${e.unit || ''}`);
  if (e.prev     != null) parts.push(`Prec: ${e.prev}${e.unit || ''}`);
  return parts.join(' · ') || e.event;
}
