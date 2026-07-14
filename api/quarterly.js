// Risultati trimestrali: Revenue + EPS actual vs estimate
// Fonte primaria: FMP (8 trimestri) | Fallback: Yahoo Finance (4 trimestri)
// Cache 1h (dati che cambiano solo ogni 3 mesi)

import { yf } from './_lib/yahoo.js';

const tout = ms => new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms));

// "2Q2025" → "Q2'25"
function normYahooLabel(d) {
  const m = String(d || '').match(/^(\d)Q(\d{4})$/);
  return m ? `Q${m[1]}'${m[2].slice(2)}` : String(d || '');
}

// Estrae il valore raw da un oggetto Yahoo {raw, fmt} o un numero diretto
function raw(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v.raw ?? null;
  return typeof v === 'number' ? v : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');

  // ── 1. FMP: income-statement quarterly + earnings-surprises ──────────────
  const FMP_KEY = process.env.FMP_API_KEY;
  if (FMP_KEY) {
    try {
      const baseSym = symbol.split('.')[0];
      const [incR, surR] = await Promise.all([
        fetch(`https://financialmodelingprep.com/api/v3/income-statement/${baseSym}?period=quarter&limit=8&apikey=${FMP_KEY}`,
          { signal: AbortSignal.timeout(6000) }),
        fetch(`https://financialmodelingprep.com/api/v3/earnings-surprises/${baseSym}?limit=12&apikey=${FMP_KEY}`,
          { signal: AbortSignal.timeout(6000) }),
      ]);

      const incData = incR.ok ? await incR.json() : [];
      const surData = surR.ok ? await surR.json() : [];

      if (Array.isArray(incData) && incData.length > 0) {
        // Mappa earnings-surprises: per ogni quarter end, trova il report entro 90gg
        const quarters = incData.map(q => {
          const qEnd   = new Date(q.date);
          const qFrom  = new Date(q.date); qFrom.setDate(qFrom.getDate() - 10);
          const qUntil = new Date(q.date); qUntil.setDate(qUntil.getDate() + 90);

          const sur = Array.isArray(surData)
            ? surData.find(s => { const sd = new Date(s.date); return sd >= qFrom && sd <= qUntil; })
            : null;

          const yr  = q.calendarYear || String(q.date || '').slice(2, 4);
          const label = `${q.period || ''}'${String(yr).slice(-2)}`;

          return {
            label,
            revenue:     q.revenue     ?? null,
            netIncome:   q.netIncome   ?? null,
            epsActual:   q.eps         ?? sur?.actualEarningResult ?? null,
            epsEstimate: sur?.estimatedEarning ?? null,
          };
        }).reverse(); // dal più vecchio al più recente

        return res.json({ ok: true, source: 'fmp', quarters });
      }
    } catch (_) { /* fall through */ }
  }

  // ── 2. Yahoo Finance: moduli earnings + incomeStatementHistoryQuarterly ──
  try {
    const data = await Promise.race([
      yf.quoteSummary(symbol, {
        modules: ['earnings', 'incomeStatementHistoryQuarterly'],
      }),
      tout(8000),
    ]);

    // Revenue + net earnings trimestrali da financialsChart
    const finQ = data?.earnings?.financialsChart?.quarterly || [];
    // EPS actual vs estimate da earningsChart
    const epsQ = data?.earnings?.earningsChart?.quarterly || [];

    if (!finQ.length && !epsQ.length) throw new Error('no data');

    // Mappa EPS per date-key
    const epsMap = {};
    epsQ.forEach(e => { if (e.date) epsMap[e.date] = e; });

    const quarters = finQ.map(q => {
      const eps = epsMap[q.date] || {};
      return {
        label:       normYahooLabel(q.date),
        revenue:     raw(q.revenue),
        netIncome:   raw(q.earnings),
        epsActual:   raw(eps.actual),
        epsEstimate: raw(eps.estimate),
      };
    }); // Yahoo restituisce già dal più vecchio al più recente

    if (!quarters.length) throw new Error('empty');

    return res.json({ ok: true, source: 'yahoo', quarters });
  } catch (_) { /* fall through */ }

  return res.json({ ok: false, quarters: [] });
}
