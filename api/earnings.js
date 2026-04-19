// Dati hardcoded Q1/Q2 2026 — affidabili, sempre disponibili
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
  { date:'2026-05-29', symbol:'STMMI.MI',name:'STMicroelectronics',   time:'bmo' },
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
  // ── Q2 2026 — Agosto ──
  { date:'2026-08-25', symbol:'NVDA',   name:'NVIDIA',                time:'amc' },
  { date:'2026-08-26', symbol:'CRM',    name:'Salesforce',            time:'amc' },
];

// Simboli da mostrare nella tape (Finnhub usa simboli senza suffisso borsa per EU)
const WATCH_SYMBOLS = new Set(HARDCODED_EARNINGS.map(e => e.symbol));
// Aggiungi varianti senza suffisso .MI / .PA per matching con Finnhub
const WATCH_BASE = new Set(
  HARDCODED_EARNINGS.map(e => e.symbol.split('.')[0])
);
const NAME_MAP = Object.fromEntries(
  HARDCODED_EARNINGS.map(e => [e.symbol, e.name])
);

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

  // ── Finnhub earnings calendar ──
  const TOKEN = process.env.FINNHUB_KEY;
  if (TOKEN) {
    try {
      const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${TOKEN}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (r.ok) {
        const raw = await r.json();
        const list = Array.isArray(raw.earningsCalendar) ? raw.earningsCalendar : [];
        const events = list
          .filter(e => {
            const sym  = e.symbol || '';
            const base = sym.split('.')[0];
            return WATCH_SYMBOLS.has(sym) || WATCH_BASE.has(base);
          })
          .map(e => ({
            date:            String(e.date || '').slice(0, 10),
            symbol:          e.symbol,
            name:            NAME_MAP[e.symbol] || NAME_MAP[e.symbol?.split('.')[0]] || e.symbol,
            epsEstimate:     e.epsEstimate  ?? null,
            epsActual:       e.epsActual    ?? null,
            revenueEstimate: e.revenueEstimate ?? null,
            revenueActual:   e.revenueActual   ?? null,
            time:            e.hour         || null,
          }))
          .filter(e => e.date)
          .sort((a, b) => a.date.localeCompare(b.date));

        if (events.length > 0) {
          return res.json({ ok: true, events, source: 'finnhub', from, to });
        }
      }
    } catch (_) {
      // fall through to hardcoded
    }
  }

  // ── Hardcoded fallback ──
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
