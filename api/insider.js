import { fetchInsiderTransactions } from './_lib/yahoo.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  // ── 1. FMP — dati più completi (include prezzo per azione) ────────────────
  const TOKEN = process.env.FMP_API_KEY;
  if (TOKEN) {
    try {
      const url = `https://financialmodelingprep.com/api/v4/insider-trading?symbol=${encodeURIComponent(symbol)}&limit=25&apikey=${TOKEN}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (r.ok) {
        const raw = await r.json();
        if (Array.isArray(raw) && raw.length > 0) {
          const transactions = raw
            .map(t => ({
              date:   t.transactionDate || t.filingDate || '',
              name:   t.reportingName   || '',
              role:   t.typeOfOwner     || '',
              type:   t.acquistionOrDisposition === 'A' ? 'buy' : 'sell',
              shares: Math.abs(t.securitiesTransacted || 0),
              price:  t.price || 0,
              value:  Math.abs((t.securitiesTransacted || 0) * (t.price || 0)),
            }))
            .filter(t => t.shares > 0)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 20);
          return res.json({ ok: true, transactions, source: 'fmp', symbol });
        }
      }
    } catch (_) { /* fall through */ }
  }

  // ── 2. Yahoo Finance fallback ─────────────────────────────────────────────
  try {
    const d = await fetchInsiderTransactions(symbol);
    const raw = d?.insiderTransactions?.transactions || [];
    const transactions = raw
      .map(t => ({
        date:   t.startDate?.fmt || '',
        name:   t.filerName      || '',
        role:   t.filerRelation  || '',
        type:   (t.transactionDescription || '').toLowerCase().includes('sale') ? 'sell' : 'buy',
        shares: Math.abs(t.shares?.raw || 0),
        price:  0,
        value:  Math.abs(t.value?.raw  || 0),
      }))
      .filter(t => t.shares > 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20);
    return res.json({ ok: true, transactions, source: 'yahoo', symbol });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
