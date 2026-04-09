// Dati hardcoded Q1/Q2 2026 — affidabili, sempre disponibili
// (date approssimative basate sui pattern storici, aggiornare a ogni trimestre)
const HARDCODED_EARNINGS = [
  // ── Q1 2026 — Aprile ──
  { date:'2026-04-11', symbol:'JPM',    name:'JPMorgan Chase',       time:'bmo' },
  { date:'2026-04-11', symbol:'WFC',    name:'Wells Fargo',           time:'bmo' },
  { date:'2026-04-14', symbol:'GS',     name:'Goldman Sachs',         time:'bmo' },
  { date:'2026-04-14', symbol:'MS',     name:'Morgan Stanley',        time:'bmo' },
  { date:'2026-04-15', symbol:'BAC',    name:'Bank of America',       time:'bmo' },
  { date:'2026-04-15', symbol:'JNJ',    name:'Johnson & Johnson',     time:'bmo' },
  { date:'2026-04-15', symbol:'ASML',   name:'ASML',                  time:'bmo' },
  { date:'2026-04-16', symbol:'NFLX',   name:'Netflix',               time:'amc' },
  { date:'2026-04-17', symbol:'UNH',    name:'UnitedHealth',          time:'bmo' },
  { date:'2026-04-22', symbol:'TSLA',   name:'Tesla',                 time:'amc' },
  { date:'2026-04-23', symbol:'META',   name:'Meta Platforms',        time:'amc' },
  { date:'2026-04-23', symbol:'SAP',    name:'SAP',                   time:'bmo' },
  { date:'2026-04-24', symbol:'GOOGL',  name:'Alphabet',              time:'amc' },
  { date:'2026-04-28', symbol:'V',      name:'Visa',                  time:'amc' },
  { date:'2026-04-28', symbol:'UCG.MI', name:'UniCredit',             time:'bmo' },
  { date:'2026-04-29', symbol:'MSFT',   name:'Microsoft',             time:'amc' },
  { date:'2026-04-29', symbol:'MA',     name:'Mastercard',            time:'amc' },
  { date:'2026-04-29', symbol:'ENI.MI', name:'Eni',                   time:'bmo' },
  { date:'2026-04-30', symbol:'CVX',    name:'Chevron',               time:'bmo' },
  { date:'2026-04-30', symbol:'XOM',    name:'ExxonMobil',            time:'bmo' },
  { date:'2026-04-30', symbol:'ENEL.MI',name:'Enel',                  time:'bmo' },
  // ── Q1 2026 — Maggio ──
  { date:'2026-05-01', symbol:'AAPL',   name:'Apple',                 time:'amc' },
  { date:'2026-05-01', symbol:'AMZN',   name:'Amazon',                time:'amc' },
  { date:'2026-05-05', symbol:'DIS',    name:'Walt Disney',           time:'bmo' },
  { date:'2026-05-06', symbol:'ABBV',   name:'AbbVie',                time:'bmo' },
  { date:'2026-05-06', symbol:'RACE.MI',name:'Ferrari',               time:'bmo' },
  { date:'2026-05-07', symbol:'LLY',    name:'Eli Lilly',             time:'bmo' },
  { date:'2026-05-08', symbol:'WMT',    name:'Walmart',               time:'bmo' },
  { date:'2026-05-12', symbol:'AVGO',   name:'Broadcom',              time:'amc' },
  { date:'2026-05-12', symbol:'AZN',    name:'AstraZeneca',           time:'bmo' },
  { date:'2026-05-14', symbol:'COST',   name:'Costco',                time:'amc' },
  { date:'2026-05-19', symbol:'HD',     name:'Home Depot',            time:'bmo' },
  { date:'2026-05-19', symbol:'IBM',    name:'IBM',                   time:'amc' },
  { date:'2026-05-20', symbol:'AMD',    name:'AMD',                   time:'amc' },
  { date:'2026-05-21', symbol:'ORCL',   name:'Oracle',                time:'amc' },
  { date:'2026-05-26', symbol:'MRK',    name:'Merck',                 time:'bmo' },
  { date:'2026-05-28', symbol:'NVDA',   name:'NVIDIA',                time:'amc' },
  { date:'2026-05-29', symbol:'CRM',    name:'Salesforce',            time:'amc' },
  { date:'2026-05-29', symbol:'STM.MI', name:'STMicroelectronics',    time:'bmo' },
  // ── Q2 2026 — Luglio ──
  { date:'2026-07-14', symbol:'JPM',    name:'JPMorgan Chase',        time:'bmo' },
  { date:'2026-07-15', symbol:'GS',     name:'Goldman Sachs',         time:'bmo' },
  { date:'2026-07-15', symbol:'BAC',    name:'Bank of America',       time:'bmo' },
  { date:'2026-07-16', symbol:'NFLX',   name:'Netflix',               time:'amc' },
  { date:'2026-07-22', symbol:'TSLA',   name:'Tesla',                 time:'amc' },
  { date:'2026-07-23', symbol:'META',   name:'Meta Platforms',        time:'amc' },
  { date:'2026-07-24', symbol:'GOOGL',  name:'Alphabet',              time:'amc' },
  { date:'2026-07-29', symbol:'MSFT',   name:'Microsoft',             time:'amc' },
  { date:'2026-07-29', symbol:'V',      name:'Visa',                  time:'amc' },
  { date:'2026-07-30', symbol:'AAPL',   name:'Apple',                 time:'amc' },
  { date:'2026-07-30', symbol:'AMZN',   name:'Amazon',                time:'amc' },
  { date:'2026-07-30', symbol:'META',   name:'Meta Platforms',        time:'amc' },
  // ── Q2 2026 — Agosto ──
  { date:'2026-08-25', symbol:'NVDA',   name:'NVIDIA',                time:'amc' },
  { date:'2026-08-26', symbol:'CRM',    name:'Salesforce',            time:'amc' },
];

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

  // ── 1. FMP earning_calendar — dati live con EPS e BMO/AMC ────────────────
  const TOKEN = process.env.FMP_API_KEY;
  if (TOKEN) {
    try {
      const url = `https://financialmodelingprep.com/api/v3/earning_calendar?from=${from}&to=${to}&apikey=${TOKEN}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (r.ok) {
        const raw = await r.json();
        if (Array.isArray(raw) && raw.length > 0) {
          // Costruiamo un Set dei ticker hardcoded per filtrare solo aziende rilevanti
          const watchSet = new Set(HARDCODED_EARNINGS.map(e => e.symbol));
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
              time:            e.time          || null,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

          if (events.length > 0) {
            return res.json({ ok: true, events, source: 'fmp', from, to });
          }
        }
      }
    } catch (_) { /* fall through */ }
  }

  // ── 2. Hardcoded fallback — sempre disponibile, ~0ms ─────────────────────
  const events = HARDCODED_EARNINGS
    .filter(e => e.date >= from && e.date <= to)
    .map(e => ({
      ...e,
      epsEstimate:     null,
      epsActual:       null,
      revenueEstimate: null,
      revenueActual:   null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return res.json({ ok: true, events, source: 'hardcoded', from, to });
}
