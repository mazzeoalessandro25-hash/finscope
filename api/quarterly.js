// Risultati trimestrali: Revenue + EPS actual vs estimate
// Fonti: FMP → yahoo-finance2 (earningsHistory + incomeStatementHistoryQuarterly)
// Cache 1h

import { yf } from './_lib/yahoo.js';

const tout = ms => new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms));

// Unix timestamp → "Q3'25"
function tsToLabel(ts) {
  const d = new Date(Number(ts) * 1000);
  if (isNaN(d)) return '';
  return `Q${Math.ceil((d.getMonth() + 1) / 3)}'${String(d.getFullYear()).slice(2)}`;
}
// Estrae valore raw da {raw:N} o numero diretto
const rv = v => (v != null && typeof v === 'object' && 'raw' in v) ? v.raw : (typeof v === 'number' ? v : null);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');

  // ── 1. FMP: 8 trimestri, income-statement + earnings-surprises ───────────
  const FMP_KEY = process.env.FMP_API_KEY;
  if (FMP_KEY) {
    try {
      const base = symbol.split('.')[0];
      const [incR, surR] = await Promise.all([
        fetch(`https://financialmodelingprep.com/api/v3/income-statement/${base}?period=quarter&limit=8&apikey=${FMP_KEY}`,
          { signal: AbortSignal.timeout(6000) }),
        fetch(`https://financialmodelingprep.com/api/v3/earnings-surprises/${base}?limit=12&apikey=${FMP_KEY}`,
          { signal: AbortSignal.timeout(6000) }),
      ]);
      const inc = incR.ok ? await incR.json() : [];
      const sur = surR.ok ? await surR.json() : [];

      if (Array.isArray(inc) && inc.length > 0 && inc[0]?.revenue != null) {
        const quarters = inc.map(q => {
          const from  = new Date(q.date); from.setDate(from.getDate() - 10);
          const until = new Date(q.date); until.setDate(until.getDate() + 90);
          const s = Array.isArray(sur)
            ? sur.find(x => { const d = new Date(x.date); return d >= from && d <= until; })
            : null;
          const yr = q.calendarYear || String(q.date || '').slice(2, 4);
          return {
            label:       `${q.period || ''}'${String(yr).slice(-2)}`,
            revenue:     q.revenue   ?? null,
            netIncome:   q.netIncome ?? null,
            epsActual:   q.eps       ?? s?.actualEarningResult ?? null,
            epsEstimate: s?.estimatedEarning ?? null,
          };
        }).reverse();
        return res.json({ ok: true, source: 'fmp', quarters });
      }
    } catch (_) { /* fall through */ }
  }

  // ── 2. yahoo-finance2: gestisce cookie/crumb automaticamente ─────────────
  try {
    const data = await Promise.race([
      yf.quoteSummary(symbol, {
        modules: ['earningsHistory', 'incomeStatementHistoryQuarterly'],
      }),
      tout(9000),
    ]);

    const epsHist = data?.earningsHistory?.history || [];
    const incHist = data?.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];

    if (epsHist.length || incHist.length) {
      const incByTs = incHist.map(q => ({
        ts:        rv(q.endDate),
        revenue:   rv(q.totalRevenue),
        netIncome: rv(q.netIncome),
      })).filter(q => q.ts);

      let quarters = epsHist.map(e => {
        const ts  = rv(e.quarter);
        const lbl = ts ? tsToLabel(ts) : '';
        const inc = ts ? incByTs.find(q => Math.abs(q.ts - ts) < 50 * 86400) : null;
        return {
          label:       lbl,
          revenue:     inc?.revenue   ?? null,
          netIncome:   inc?.netIncome ?? null,
          epsActual:   rv(e.epsActual),
          epsEstimate: rv(e.epsEstimate),
        };
      }).filter(q => q.label);

      // Solo income statement (senza EPS)
      if (!quarters.length && incHist.length) {
        quarters = [...incHist].reverse().map(q => {
          const ts = rv(q.endDate);
          return {
            label:       ts ? tsToLabel(ts) : '',
            revenue:     rv(q.totalRevenue),
            netIncome:   rv(q.netIncome),
            epsActual:   null,
            epsEstimate: null,
          };
        }).filter(q => q.label);
      }

      if (quarters.length) return res.json({ ok: true, source: 'yahoo', quarters });
    }
  } catch (_) { /* fall through */ }

  return res.json({ ok: false, quarters: [] });
}
