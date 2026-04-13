import { fetchInsiderTransactions } from './_lib/yahoo.js';

// Titoli di riferimento per il feed globale (fallback Yahoo quando non c'è FMP)
const FEED_STOCKS = [
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','JPM','V','JNJ',
  'XOM','UNH','HD','PG','BAC','ABBV','MRK','CVX','LLY','AVGO',
  'NFLX','AMD','ORCL','CRM','COST','WMT','DIS','IBM','GS','MS'
];

function normalize(raw) {
  return raw
    .map(t => ({
      symbol: t.symbol || '',
      date:   t.transactionDate || t.filingDate || t.startDate?.fmt || '',
      name:   t.reportingName   || t.filerName  || '',
      role:   t.typeOfOwner     || t.filerRelation || '',
      type:   (t.acquistionOrDisposition === 'A' || (t.transactionDescription||'').toLowerCase().includes('purchase'))
              ? 'buy' : 'sell',
      shares: Math.abs(t.securitiesTransacted || t.shares?.raw || 0),
      price:  t.price || 0,
      value:  Math.abs(
        (t.securitiesTransacted || t.shares?.raw || 0) * (t.price || 0)
        || t.value?.raw || 0
      ),
    }))
    .filter(t => t.shares > 0 && t.date)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=900');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol } = req.query;
  const TOKEN = process.env.FMP_API_KEY;

  // ── Modalità feed globale (nessun simbolo) ────────────────────────────────
  if (!symbol) {
    // 1. FMP senza simbolo → feed di tutti i mercati
    if (TOKEN) {
      try {
        const url = `https://financialmodelingprep.com/api/v4/insider-trading?limit=80&apikey=${TOKEN}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (r.ok) {
          const raw = await r.json();
          if (Array.isArray(raw) && raw.length > 0) {
            const transactions = normalize(raw).slice(0, 50);
            return res.json({ ok: true, transactions, source: 'fmp' });
          }
        }
      } catch (_) {}
    }

    // 2. Yahoo Finance — fetch parallelo su lista top stocks
    try {
      const results = await Promise.allSettled(
        FEED_STOCKS.map(sym => fetchInsiderTransactions(sym).then(d => {
          const txs = d?.insiderTransactions?.transactions || [];
          return txs.map(t => ({ ...t, symbol: sym }));
        }))
      );
      const all = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value);
      const transactions = normalize(all).slice(0, 50);
      return res.json({ ok: true, transactions, source: 'yahoo' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Modalità simbolo specifico ────────────────────────────────────────────
  if (TOKEN) {
    try {
      const url = `https://financialmodelingprep.com/api/v4/insider-trading?symbol=${encodeURIComponent(symbol)}&limit=25&apikey=${TOKEN}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (r.ok) {
        const raw = await r.json();
        if (Array.isArray(raw) && raw.length > 0) {
          const transactions = normalize(raw.map(t => ({ ...t, symbol }))).slice(0, 20);
          return res.json({ ok: true, transactions, source: 'fmp', symbol });
        }
      }
    } catch (_) {}
  }

  try {
    const d = await fetchInsiderTransactions(symbol);
    const raw = (d?.insiderTransactions?.transactions || []).map(t => ({ ...t, symbol }));
    const transactions = normalize(raw).slice(0, 20);
    return res.json({ ok: true, transactions, source: 'yahoo', symbol });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
