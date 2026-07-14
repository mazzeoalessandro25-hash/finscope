// Risultati trimestrali: Revenue + EPS actual vs estimate
// Fonti: FMP (primario) → yahoo-finance2 quoteSummary → Yahoo chart API
// Cache 1h

import { yf } from './_lib/yahoo.js';

const tout = ms => new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms));

// "2Q2025" → "Q2'25"
function normYahooLabel(s) {
  const m = String(s || '').match(/^(\d)Q(\d{4})$/);
  return m ? `Q${m[1]}'${m[2].slice(2)}` : String(s || '');
}

// Unix timestamp → "Q3'25"
function labelFromTs(ts) {
  const d = new Date(ts * 1000);
  if (isNaN(d)) return null;
  return `Q${Math.ceil((d.getMonth() + 1) / 3)}'${String(d.getFullYear()).slice(2)}`;
}

// ISO date string → "Q3'25"
function labelFromISO(s) {
  const d = new Date(s);
  if (isNaN(d)) return null;
  return `Q${Math.ceil((d.getMonth() + 1) / 3)}'${String(d.getFullYear()).slice(2)}`;
}

// Valore raw da oggetto Yahoo {raw} o numero
const raw = v => (v != null && typeof v === 'object' && 'raw' in v) ? v.raw : (typeof v === 'number' ? v : null);

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
          const qFrom  = new Date(q.date); qFrom.setDate(qFrom.getDate() - 10);
          const qUntil = new Date(q.date); qUntil.setDate(qUntil.getDate() + 90);
          const s = Array.isArray(sur)
            ? sur.find(x => { const d = new Date(x.date); return d >= qFrom && d <= qUntil; })
            : null;
          const yr = q.calendarYear || String(q.date || '').slice(2, 4);
          return {
            label:       `${q.period || ''}'${String(yr).slice(-2)}`,
            revenue:     q.revenue   ?? null,
            netIncome:   q.netIncome ?? null,
            epsActual:   q.eps       ?? s?.actualEarningResult ?? null,
            epsEstimate: s?.estimatedEarning ?? null,
          };
        }).reverse(); // oldest → newest

        return res.json({ ok: true, source: 'fmp', quarters });
      }
    } catch (_) { /* fall through */ }
  }

  // ── 2. yahoo-finance2 quoteSummary (moduli earnings disponibili in v3) ──
  try {
    const data = await Promise.race([
      yf.quoteSummary(symbol, {
        modules: ['earnings', 'incomeStatementHistoryQuarterly'],
      }),
      tout(7000),
    ]);

    const finQ = data?.earnings?.financialsChart?.quarterly || [];
    const epsQ = data?.earnings?.earningsChart?.quarterly   || [];
    const incQ = data?.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];

    if (finQ.length || epsQ.length || incQ.length) {
      const epsMap = {};
      epsQ.forEach(e => { if (e.date) epsMap[normYahooLabel(e.date)] = e; });

      const quarters = (finQ.length ? finQ : incQ).map(q => {
        const lbl  = normYahooLabel(q.date) || labelFromISO(raw(q.endDate));
        const eps  = epsMap[lbl] || {};
        return {
          label:       lbl || '',
          revenue:     raw(q.revenue)    ?? raw(q.totalRevenue) ?? null,
          netIncome:   raw(q.earnings)   ?? raw(q.netIncome)    ?? null,
          epsActual:   raw(eps.actual)   ?? null,
          epsEstimate: raw(eps.estimate) ?? null,
        };
      });

      if (quarters.length) return res.json({ ok: true, source: 'yahoo-qs', quarters });
    }
  } catch (_) { /* fall through */ }

  // ── 3. Yahoo Finance chart API — earnings events (EPS only, no revenue) ──
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=3mo&range=3y&events=earnings`;
    const r = await fetch(url, {
      signal: AbortSignal.timeout(7000),
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (!r.ok) throw new Error('chart api');
    const data   = await r.json();
    const events = data?.chart?.result?.[0]?.events?.earnings || {};

    const quarters = Object.values(events)
      .sort((a, b) => a.date - b.date)
      .slice(-8)
      .map(e => ({
        label:       e.quarter ? normYahooLabel(e.quarter) : labelFromTs(e.date),
        revenue:     null,
        netIncome:   null,
        epsActual:   e.epsActual    ?? null,
        epsEstimate: e.epsEstimate  ?? null,
      }))
      .filter(q => q.label && q.epsActual != null);

    if (quarters.length) return res.json({ ok: true, source: 'yahoo-chart', quarters });
  } catch (_) { /* fall through */ }

  return res.json({ ok: false, quarters: [] });
}
