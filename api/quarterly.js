// Risultati trimestrali: Revenue + EPS actual vs estimate
// Fonti: FMP → yahoo-finance2 (earningsHistory + incomeStatementHistoryQuarterly)
// Cache 1h

import { yf } from './_lib/yahoo.js';

const tout = ms => new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms));

// Converte qualsiasi formato data (Date, ISO string, Unix ts, {raw:N}) → Date o null
function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'string') { const d = new Date(v); return isNaN(d) ? null : d; }
  if (typeof v === 'number') return new Date(v * 1000); // Unix timestamp in secondi
  if (typeof v === 'object' && 'raw' in v) return new Date(Number(v.raw) * 1000);
  return null;
}

// Date → "Q3'25"
function dateToLabel(d) {
  if (!d) return '';
  return `Q${Math.ceil((d.getMonth() + 1) / 3)}'${String(d.getFullYear()).slice(2)}`;
}

// Estrae valore numerico da {raw:N} o numero diretto (NON usare per date)
const rv = v => (v != null && typeof v === 'object' && 'raw' in v) ? v.raw : (typeof v === 'number' ? v : null);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');

  // ── 1. FMP: 8 trimestri, income-statement + earnings-surprises + analyst-estimates ───
  const FMP_KEY = process.env.FMP_API_KEY;
  if (FMP_KEY) {
    try {
      const base = symbol.split('.')[0];
      const [incR, surR, estR] = await Promise.all([
        fetch(`https://financialmodelingprep.com/api/v3/income-statement/${base}?period=quarter&limit=8&apikey=${FMP_KEY}`,
          { signal: AbortSignal.timeout(6000) }),
        fetch(`https://financialmodelingprep.com/api/v3/earnings-surprises/${base}?limit=12&apikey=${FMP_KEY}`,
          { signal: AbortSignal.timeout(6000) }),
        fetch(`https://financialmodelingprep.com/api/v3/analyst-estimates/${base}?period=quarter&limit=8&apikey=${FMP_KEY}`,
          { signal: AbortSignal.timeout(6000) }),
      ]);
      const inc = incR.ok ? await incR.json() : [];
      const sur = surR.ok ? await surR.json() : [];
      const est = estR.ok ? await estR.json() : [];

      if (Array.isArray(inc) && inc.length > 0 && inc[0]?.revenue != null) {
        // inc[0] = trimestre più recente, inc[n-1] = più vecchio (FMP ordine desc)
        // Mostriamo i 4 più recenti; inc[i+4] = stesso trimestre anno precedente (YoY)
        const MS45D = 45 * 86400 * 1000;
        const display = inc.slice(0, Math.min(4, inc.length));
        const quarters = display.map((q, i) => {
          const qDate = new Date(q.date);
          const from  = new Date(q.date); from.setDate(from.getDate() - 10);
          const until = new Date(q.date); until.setDate(until.getDate() + 90);
          const s = Array.isArray(sur)
            ? sur.find(x => { const d = new Date(x.date); return d >= from && d <= until; })
            : null;
          // analyst-estimates (piano premium FMP) — fallback a YoY se null
          const e = Array.isArray(est)
            ? est.find(x => Math.abs(new Date(x.date) - qDate) < MS45D)
            : null;
          // Stesso trimestre anno precedente (4 posizioni in avanti nell'array desc)
          const prevQ = inc[i + 4] ?? null;
          const yr = q.calendarYear || String(q.date || '').slice(2, 4);
          return {
            label:           `${q.period || ''}'${String(yr).slice(-2)}`,
            revenue:         q.revenue   ?? null,
            revenueEstimate: e?.estimatedRevenueAvg ?? null,
            revenuePrevYear: prevQ?.revenue ?? null,
            netIncome:       q.netIncome ?? null,
            epsActual:       q.eps       ?? s?.actualEarningResult ?? null,
            epsEstimate:     s?.estimatedEarning ?? null,
          };
        }).reverse();
        return res.json({ ok: true, source: 'fmp', quarters });
      }
    } catch (_) { /* fall through */ }
  }

  // ── 2. yahoo-finance2: gestisce cookie/crumb automaticamente ─────────────
  // earningsTrend fornisce previsioni future: 0q (trimestre corrente) e +1q (prossimo)
  try {
    const data = await Promise.race([
      yf.quoteSummary(symbol, {
        modules: ['earningsHistory', 'incomeStatementHistoryQuarterly', 'earningsTrend'],
      }),
      tout(9000),
    ]);

    const epsHist = data?.earningsHistory?.history || [];
    const incHist = data?.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];

    if (epsHist.length || incHist.length) {
      const incByDate = incHist.map(q => ({
        date:      toDate(q.endDate),
        revenue:   rv(q.totalRevenue),
        netIncome: rv(q.netIncome),
      })).filter(q => q.date);

      const MS50D = 50 * 86400 * 1000;

      let quarters = epsHist.map(e => {
        const d   = toDate(e.quarter);
        const lbl = d ? dateToLabel(d) : '';
        const inc = d ? incByDate.find(q => Math.abs(q.date - d) < MS50D) : null;
        return {
          label:          lbl,
          revenue:        inc?.revenue   ?? null,
          revenuePrevYear: null,
          netIncome:      inc?.netIncome ?? null,
          epsActual:      rv(e.epsActual),
          epsEstimate:    rv(e.epsEstimate),
          isForecast:     false,
        };
      }).filter(q => q.label);

      // Fallback solo income statement (senza EPS)
      if (!quarters.length && incHist.length) {
        quarters = [...incHist].reverse().map(q => {
          const d = toDate(q.endDate);
          return {
            label:          d ? dateToLabel(d) : '',
            revenue:        rv(q.totalRevenue),
            revenuePrevYear: null,
            netIncome:      rv(q.netIncome),
            epsActual:      null,
            epsEstimate:    null,
            isForecast:     false,
          };
        }).filter(q => q.label);
      }

      // Previsioni future da earningsTrend (0q = trimestre corrente, +1q = prossimo)
      const trendItems = (data?.earningsTrend?.trend || [])
        .filter(t => t.period === '0q' || t.period === '+1q')
        .sort((a, b) => (toDate(a.endDate) || 0) - (toDate(b.endDate) || 0));

      const forecastQs = trendItems.map(t => {
        const d = toDate(t.endDate);
        return {
          label:          d ? dateToLabel(d) : '',
          revenue:        null,
          revenueEstimate: rv(t.revenueEstimate?.avg),
          revenuePrevYear: null,
          netIncome:      null,
          epsActual:      null,
          epsEstimate:    rv(t.earningsEstimate?.avg),
          isForecast:     true,
        };
      }).filter(q => q.label && (q.revenueEstimate != null || q.epsEstimate != null));

      const allQuarters = [...quarters, ...forecastQs];
      if (allQuarters.length) return res.json({ ok: true, source: 'yahoo', quarters: allQuarters });
    }
  } catch (_) { /* fall through */ }

  return res.json({ ok: false, quarters: [] });
}
