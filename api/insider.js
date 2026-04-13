import { fetchInsiderTransactions } from './_lib/yahoo.js';

// Struttura reale Yahoo Finance insiderTransactions:
// { shares: 30002, value: 7660875, filerName: "...", filerRelation: "Officer",
//   startDate: "2026-04-02T00:00:00.000Z", transactionText: "Sale at price 255.12..." }
// NOTA: shares/value sono numeri diretti (non {raw:...}), startDate è ISO string

// Yahoo Finance insiderTransactions funziona solo per titoli con Form 4 SEC (USA)
// + alcuni ADR europei/UK quotati su NYSE/NASDAQ. I titoli .MI/.PA/.DE non hanno dati.
const FEED_STOCKS = [
  // USA
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','JPM','V','JNJ',
  'XOM','UNH','HD','PG','BAC','ABBV','MRK','CVX','LLY','AVGO',
  'NFLX','AMD','ORCL','CRM','COST','WMT','DIS','IBM','GS','MS',
  'QCOM','INTC','TXN','PYPL','ADBE','NFLX','SBUX','NKE','PEP','KO',
  // ADR europei/UK con dati insider su Yahoo Finance
  'AZN','SHEL','TTE','BP','RIO','BTI','GSK','UL',
];

function fmtDate(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.split('T')[0];  // "2026-04-02T..." → "2026-04-02"
  if (raw instanceof Date) return raw.toISOString().split('T')[0]; // yahoo-finance2 ritorna Date object
  return String(raw);
}

function detectType(t) {
  // FMP usa acquistionOrDisposition: 'A'=buy, 'D'=sell
  if (t.acquistionOrDisposition) return t.acquistionOrDisposition === 'A' ? 'buy' : 'sell';
  // Yahoo usa transactionText: "Sale at price..." / "Purchase at price..."
  const txt = (t.transactionText || '').toLowerCase();
  if (txt.includes('sale') || txt.includes('sold')) return 'sell';
  if (txt.includes('purchase') || txt.includes('bought')) return 'buy';
  return null; // skip transazioni ambigue (award, tax withholding, ecc.)
}

function normalizeFMP(raw, sym) {
  return raw
    .map(t => {
      const type = detectType(t);
      if (!type) return null;
      const shares = Math.abs(t.securitiesTransacted || 0);
      const price  = t.price || 0;
      const value  = shares * price;
      return {
        symbol: t.symbol || sym || '',
        date:   fmtDate(t.transactionDate || t.filingDate),
        name:   t.reportingName  || '',
        role:   t.typeOfOwner    || '',
        type, shares, price, value,
      };
    })
    .filter(t => t && t.shares > 0 && t.date)
    .sort((a, b) => b.date.localeCompare(a.date));
}

function normalizeYahoo(raw, sym) {
  return raw
    .map(t => {
      const type = detectType(t);
      if (!type) return null;
      const shares = Math.abs(typeof t.shares === 'object' ? t.shares?.raw : t.shares) || 0;
      const value  = Math.abs(typeof t.value  === 'object' ? t.value?.raw  : t.value)  || 0;
      // prova a estrarre il prezzo dal testo "Sale at price 255.12 per share."
      const priceMatch = (t.transactionText || '').match(/price\s+([\d.]+)/i);
      const price = priceMatch ? parseFloat(priceMatch[1]) : (shares > 0 && value > 0 ? value / shares : 0);
      return {
        symbol: sym || '',
        date:   fmtDate(t.startDate),
        name:   t.filerName     || '',
        role:   t.filerRelation || '',
        type, shares, price, value,
      };
    })
    .filter(t => t && t.shares > 0 && t.date)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=900');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol } = req.query;
  const TOKEN = process.env.FMP_API_KEY;

  // ── Feed globale (nessun simbolo) ─────────────────────────────────────────
  if (!symbol) {
    if (TOKEN) {
      try {
        const url = `https://financialmodelingprep.com/api/v4/insider-trading?limit=80&apikey=${TOKEN}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (r.ok) {
          const raw = await r.json();
          if (Array.isArray(raw) && raw.length > 0) {
            const transactions = normalizeFMP(raw, '').slice(0, 50);
            return res.json({ ok: true, transactions, source: 'fmp' });
          }
        }
      } catch (_) {}
    }

    // Fallback Yahoo: fetch parallelo top stocks
    try {
      const results = await Promise.allSettled(
        FEED_STOCKS.map(sym =>
          fetchInsiderTransactions(sym).then(d => {
            const txs = d?.insiderTransactions?.transactions || [];
            return normalizeYahoo(txs, sym);
          })
        )
      );
      const all = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 50);
      return res.json({ ok: true, transactions: all, source: 'yahoo' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Simbolo specifico ─────────────────────────────────────────────────────
  if (TOKEN) {
    try {
      const url = `https://financialmodelingprep.com/api/v4/insider-trading?symbol=${encodeURIComponent(symbol)}&limit=25&apikey=${TOKEN}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (r.ok) {
        const raw = await r.json();
        if (Array.isArray(raw) && raw.length > 0) {
          const transactions = normalizeFMP(raw, symbol).slice(0, 20);
          return res.json({ ok: true, transactions, source: 'fmp', symbol });
        }
      }
    } catch (_) {}
  }

  try {
    const d = await fetchInsiderTransactions(symbol);
    const txs = d?.insiderTransactions?.transactions || [];
    const transactions = normalizeYahoo(txs, symbol).slice(0, 20);
    return res.json({ ok: true, transactions, source: 'yahoo', symbol });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
