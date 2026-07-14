// Risultati trimestrali: Revenue + EPS actual vs estimate
// Fonti: FMP → Yahoo Finance v10 (tutti i ticker, anche EU) → Yahoo chart events
// Cache 1h

import { yf } from './_lib/yahoo.js';

const tout = ms => new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms));

// Unix timestamp → "Q3'25"
function tsToLabel(ts) {
  const d = new Date(Number(ts) * 1000);
  if (isNaN(d)) return null;
  return `Q${Math.ceil((d.getMonth() + 1) / 3)}'${String(d.getFullYear()).slice(2)}`;
}
// ISO string → "Q3'25"
function isoToLabel(s) {
  const d = new Date(s);
  if (isNaN(d)) return null;
  return `Q${Math.ceil((d.getMonth() + 1) / 3)}'${String(d.getFullYear()).slice(2)}`;
}
// "3Q2025" → "Q3'25"
function yahooToLabel(s) {
  const m = String(s || '').match(/^(\d)Q(\d{4})$/);
  return m ? `Q${m[1]}'${m[2].slice(2)}` : null;
}
// {raw:N} o numero
const rv = v => (v != null && typeof v === 'object' && 'raw' in v) ? v.raw : (typeof v === 'number' ? v : null);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');

  // ── 1. FMP (US primario, 8 trimestri) ──────────────────────────────────
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

  // ── 2. Yahoo Finance v10 quoteSummary (funziona per TUTTI i ticker) ─────
  // Richiesta HTTP diretta senza yahoo-finance2, copre EU, JP, etc.
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=incomeStatementHistoryQuarterly%2CearningsHistory`;
    const r = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (!r.ok) throw new Error('v10 failed');
    const data   = await r.json();
    const result = data?.quoteSummary?.result?.[0];

    const incHist = result?.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
    const epsHist = result?.earningsHistory?.history || [];

    if (incHist.length || epsHist.length) {
      // Mappa EPS per timestamp quarter (±45gg dal fine trimestre)
      const epsArr = epsHist.map(e => ({
        ts:          rv(e.quarter),
        epsActual:   rv(e.epsActual),
        epsEstimate: rv(e.epsEstimate),
      }));

      // Base: income statement trimestrale
      let quarters = incHist.map(q => {
        const ts  = rv(q.endDate);
        const lbl = ts ? tsToLabel(ts) : null;
        const eps = ts ? epsArr.find(e => e.ts && Math.abs(e.ts - ts) < 45 * 86400) : null;
        return {
          label:       lbl || '',
          revenue:     rv(q.totalRevenue),
          netIncome:   rv(q.netIncome),
          epsActual:   eps?.epsActual   ?? null,
          epsEstimate: eps?.epsEstimate ?? null,
        };
      }).reverse(); // oldest first

      // Se income statement vuoto ma EPS disponibili, usa EPS history
      if (!quarters.length && epsArr.length) {
        quarters = epsArr.filter(e => e.ts).map(e => ({
          label:       tsToLabel(e.ts) || '',
          revenue:     null,
          netIncome:   null,
          epsActual:   e.epsActual,
          epsEstimate: e.epsEstimate,
        })).sort((a, b) => a.label.localeCompare(b.label));
      }

      if (quarters.length) return res.json({ ok: true, source: 'yahoo-v10', quarters });
    }
  } catch (_) { /* fall through */ }

  // ── 3. Yahoo chart API — earnings events (EPS only, fallback finale) ───
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=3mo&range=3y&events=earnings`;
    const r = await fetch(url, {
      signal: AbortSignal.timeout(7000),
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (!r.ok) throw new Error();
    const data   = await r.json();
    const events = data?.chart?.result?.[0]?.events?.earnings || {};

    const quarters = Object.values(events)
      .sort((a, b) => a.date - b.date)
      .slice(-8)
      .map(e => ({
        label:       yahooToLabel(e.quarter) || tsToLabel(e.date) || '',
        revenue:     null,
        netIncome:   null,
        epsActual:   e.epsActual   ?? null,
        epsEstimate: e.epsEstimate ?? null,
      }))
      .filter(q => q.label && q.epsActual != null);

    if (quarters.length) return res.json({ ok: true, source: 'yahoo-chart', quarters });
  } catch (_) { /* fall through */ }

  return res.json({ ok: false, quarters: [] });
}
