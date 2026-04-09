// Restituisce i risultati dell'ultimo trimestre per un singolo ticker
// Fonti: FMP earnings-surprises + income-statement, fallback Yahoo Finance
import { fetchQuoteSummary } from './_lib/yahoo.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });

  // Cache 30 min (i risultati trimestrali non cambiano spesso)
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=900');

  const TOKEN = process.env.FMP_API_KEY;

  // ── 1. FMP: earnings-surprises (EPS) + income-statement (revenue) ──────────
  if (TOKEN) {
    try {
      const [surpriseR, incomeR] = await Promise.all([
        fetch(
          `https://financialmodelingprep.com/api/v3/earnings-surprises/${symbol}?limit=4&apikey=${TOKEN}`,
          { signal: AbortSignal.timeout(6000) }
        ),
        fetch(
          `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?period=quarter&limit=2&apikey=${TOKEN}`,
          { signal: AbortSignal.timeout(6000) }
        ),
      ]);

      const surprises = surpriseR.ok ? await surpriseR.json() : [];
      const income    = incomeR.ok  ? await incomeR.json()  : [];

      if (Array.isArray(surprises) && surprises.length > 0) {
        const s = surprises[0];
        const q = Array.isArray(income) && income.length > 0 ? income[0] : null;
        return res.json({
          ok:              true,
          source:          'fmp',
          symbol,
          date:            s.date        ?? q?.date ?? null,
          quarter:         q?.period     ?? null,
          fiscalYear:      q?.calendarYear ?? null,
          epsActual:       s.actualEarningResult  ?? null,
          epsEstimate:     s.estimatedEarning      ?? null,
          revenueActual:   q?.revenue              ?? null,
          netIncome:       q?.netIncome            ?? null,
        });
      }
    } catch (_) { /* fall through */ }
  }

  // ── 2. Yahoo Finance: quoteSummary con modulo earnings ───────────────────────
  try {
    const data = await fetchQuoteSummary(symbol);
    const quarterly = data?.earnings?.financialsChart?.quarterly;
    if (Array.isArray(quarterly) && quarterly.length > 0) {
      const q = quarterly[quarterly.length - 1];
      const rev = data?.earnings?.financialsChart?.quarterly; // stessa struttura
      return res.json({
        ok:              true,
        source:          'yahoo',
        symbol,
        date:            null,
        quarter:         q.date    ?? null,
        fiscalYear:      null,
        epsActual:       q.actual?.raw  ?? q.actual  ?? null,
        epsEstimate:     q.estimate?.raw ?? q.estimate ?? null,
        revenueActual:   null,
        netIncome:       null,
      });
    }
  } catch (_) { /* fall through */ }

  return res.json({ ok: false, symbol });
}
