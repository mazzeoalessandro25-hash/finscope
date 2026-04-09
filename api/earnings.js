import { yf } from './_lib/yahoo.js';

// Tutti i ticker monitorati per gli earnings
const WATCH_TICKERS = [
  // USA — Top S&P 500
  'AAPL','NVDA','MSFT','AMZN','GOOGL','META','TSLA','AVGO','LLY','V',
  'MA','JPM','BAC','GS','JNJ','UNH','MRK','ABBV','XOM','CVX',
  'KO','PEP','PG','WMT','COST','HD','DIS','NFLX','CRM','ORCL',
  'AMD','IBM','BA','CAT',
  // Europa
  'ASML','SAP','AZN','SHEL','MC.PA','AIR.PA','SIE.DE',
  // Italia
  'ENI.MI','UCG.MI','RACE.MI','ENEL.MI','STM.MI','LDO.MI',
];

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

async function fetchCalendarYahoo(symbol) {
  try {
    return await Promise.race([
      yf.quoteSummary(symbol, { modules: ['calendarEvents', 'price'] }),
      timeout(6000),
    ]);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');

  const now   = new Date();
  const year  = parseInt(req.query.year  || now.getFullYear(), 10);
  const month = parseInt(req.query.month || (now.getMonth() + 1), 10);

  const from    = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to      = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

  // ── Tentativo FMP earning_calendar ──────────────────────────────────────
  const TOKEN = process.env.FMP_API_KEY;
  if (TOKEN) {
    try {
      const url = `https://financialmodelingprep.com/api/v3/earning_calendar?from=${from}&to=${to}&apikey=${TOKEN}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const raw = await r.json();
        if (Array.isArray(raw) && raw.length > 0) {
          const watchSet = new Set(WATCH_TICKERS);
          const events = raw
            .filter(e => e.symbol && e.date && watchSet.has(e.symbol))
            .map(e => ({
              date:            String(e.date).split(' ')[0],
              symbol:          e.symbol,
              name:            e.name || e.symbol,
              epsEstimate:     e.epsEstimated  ?? null,
              epsActual:       e.eps           ?? null,
              revenueEstimate: e.revenueEstimated ?? null,
              revenueActual:   e.revenue       ?? null,
              time:            e.time          || null, // 'bmo' | 'amc'
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

          if (events.length > 0) {
            return res.json({ ok: true, events, source: 'fmp', from, to });
          }
        }
      }
    } catch (_) { /* fall through */ }
  }

  // ── Fallback: Yahoo Finance calendarEvents in parallelo ──────────────────
  const results = await Promise.allSettled(
    WATCH_TICKERS.map(async (ticker) => {
      const data = await fetchCalendarYahoo(ticker);
      if (!data) return null;
      const ed = data?.calendarEvents?.earnings?.earningsDate;
      if (!ed || !ed.length) return null;
      const dateStr = new Date(ed[0]).toISOString().split('T')[0];
      if (dateStr < from || dateStr > to) return null;
      return {
        date:            dateStr,
        symbol:          ticker,
        name:            data?.price?.shortName || data?.price?.longName || ticker,
        epsEstimate:     data?.calendarEvents?.earnings?.earningsAverage ?? null,
        epsActual:       null,
        revenueEstimate: data?.calendarEvents?.earnings?.revenueAverage  ?? null,
        revenueActual:   null,
        time:            null,
      };
    })
  );

  const events = results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value)
    .sort((a, b) => a.date.localeCompare(b.date));

  return res.json({ ok: true, events, source: 'yahoo', from, to });
}
