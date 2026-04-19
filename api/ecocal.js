// Dati hardcoded 2026 come fallback sempre affidabile
const HARDCODED_2026 = [
  // ── FOMC (Fed) ──
  {date:'2026-01-28',label:'Fed Meeting (FOMC)',type:'fed',impact:'High',country:'US',detail:'Decisione tassi Fed'},
  {date:'2026-03-18',label:'Fed Meeting (FOMC)',type:'fed',impact:'High',country:'US',detail:'Decisione tassi Fed'},
  {date:'2026-04-29',label:'Fed Meeting (FOMC)',type:'fed',impact:'High',country:'US',detail:'Decisione tassi Fed'},
  {date:'2026-06-10',label:'Fed Meeting (FOMC)',type:'fed',impact:'High',country:'US',detail:'Decisione tassi Fed'},
  {date:'2026-07-29',label:'Fed Meeting (FOMC)',type:'fed',impact:'High',country:'US',detail:'Decisione tassi Fed'},
  {date:'2026-09-16',label:'Fed Meeting (FOMC)',type:'fed',impact:'High',country:'US',detail:'Decisione tassi Fed'},
  {date:'2026-10-28',label:'Fed Meeting (FOMC)',type:'fed',impact:'High',country:'US',detail:'Decisione tassi Fed'},
  {date:'2026-12-09',label:'Fed Meeting (FOMC)',type:'fed',impact:'High',country:'US',detail:'Decisione tassi Fed'},
  // ── BCE ──
  {date:'2026-01-15',label:'BCE Meeting',type:'bce',impact:'High',country:'EU',detail:'Decisione tassi BCE'},
  {date:'2026-03-05',label:'BCE Meeting',type:'bce',impact:'High',country:'EU',detail:'Decisione tassi BCE'},
  {date:'2026-04-16',label:'BCE Meeting',type:'bce',impact:'High',country:'EU',detail:'Decisione tassi BCE'},
  {date:'2026-06-04',label:'BCE Meeting',type:'bce',impact:'High',country:'EU',detail:'Decisione tassi BCE'},
  {date:'2026-07-23',label:'BCE Meeting',type:'bce',impact:'High',country:'EU',detail:'Decisione tassi BCE'},
  {date:'2026-09-10',label:'BCE Meeting',type:'bce',impact:'High',country:'EU',detail:'Decisione tassi BCE'},
  {date:'2026-10-22',label:'BCE Meeting',type:'bce',impact:'High',country:'EU',detail:'Decisione tassi BCE'},
  {date:'2026-12-10',label:'BCE Meeting',type:'bce',impact:'High',country:'EU',detail:'Decisione tassi BCE'},
  // ── CPI USA ──
  {date:'2026-01-14',label:'CPI USA (Dic)',type:'macro',impact:'High',country:'US',detail:'Inflazione al consumo'},
  {date:'2026-02-11',label:'CPI USA (Gen)',type:'macro',impact:'High',country:'US',detail:'Inflazione al consumo'},
  {date:'2026-03-11',label:'CPI USA (Feb)',type:'macro',impact:'High',country:'US',detail:'Inflazione al consumo'},
  {date:'2026-04-10',label:'CPI USA (Mar)',type:'macro',impact:'High',country:'US',detail:'Inflazione al consumo'},
  {date:'2026-05-13',label:'CPI USA (Apr)',type:'macro',impact:'High',country:'US',detail:'Inflazione al consumo'},
  {date:'2026-06-11',label:'CPI USA (Mag)',type:'macro',impact:'High',country:'US',detail:'Inflazione al consumo'},
  {date:'2026-07-14',label:'CPI USA (Giu)',type:'macro',impact:'High',country:'US',detail:'Inflazione al consumo'},
  {date:'2026-08-12',label:'CPI USA (Lug)',type:'macro',impact:'High',country:'US',detail:'Inflazione al consumo'},
  {date:'2026-09-11',label:'CPI USA (Ago)',type:'macro',impact:'High',country:'US',detail:'Inflazione al consumo'},
  {date:'2026-10-14',label:'CPI USA (Set)',type:'macro',impact:'High',country:'US',detail:'Inflazione al consumo'},
  {date:'2026-11-12',label:'CPI USA (Ott)',type:'macro',impact:'High',country:'US',detail:'Inflazione al consumo'},
  {date:'2026-12-10',label:'CPI USA (Nov)',type:'macro',impact:'High',country:'US',detail:'Inflazione al consumo'},
  // ── NFP ──
  {date:'2026-01-09',label:'NFP USA (Dic)',type:'macro',impact:'High',country:'US',detail:'Buste paga non agricole'},
  {date:'2026-02-06',label:'NFP USA (Gen)',type:'macro',impact:'High',country:'US',detail:'Buste paga non agricole'},
  {date:'2026-03-06',label:'NFP USA (Feb)',type:'macro',impact:'High',country:'US',detail:'Buste paga non agricole'},
  {date:'2026-04-03',label:'NFP USA (Mar)',type:'macro',impact:'High',country:'US',detail:'Buste paga non agricole'},
  {date:'2026-05-08',label:'NFP USA (Apr)',type:'macro',impact:'High',country:'US',detail:'Buste paga non agricole'},
  {date:'2026-06-05',label:'NFP USA (Mag)',type:'macro',impact:'High',country:'US',detail:'Buste paga non agricole'},
  {date:'2026-07-10',label:'NFP USA (Giu)',type:'macro',impact:'High',country:'US',detail:'Buste paga non agricole'},
  {date:'2026-08-07',label:'NFP USA (Lug)',type:'macro',impact:'High',country:'US',detail:'Buste paga non agricole'},
  {date:'2026-09-04',label:'NFP USA (Ago)',type:'macro',impact:'High',country:'US',detail:'Buste paga non agricole'},
  {date:'2026-10-02',label:'NFP USA (Set)',type:'macro',impact:'High',country:'US',detail:'Buste paga non agricole'},
  {date:'2026-11-06',label:'NFP USA (Ott)',type:'macro',impact:'High',country:'US',detail:'Buste paga non agricole'},
  {date:'2026-12-04',label:'NFP USA (Nov)',type:'macro',impact:'High',country:'US',detail:'Buste paga non agricole'},
  // ── PCE USA ──
  {date:'2026-01-30',label:'PCE USA (Dic)',type:'macro',impact:'High',country:'US',detail:'Inflazione preferita dalla Fed'},
  {date:'2026-02-27',label:'PCE USA (Gen)',type:'macro',impact:'High',country:'US',detail:'Inflazione preferita dalla Fed'},
  {date:'2026-03-27',label:'PCE USA (Feb)',type:'macro',impact:'High',country:'US',detail:'Inflazione preferita dalla Fed'},
  {date:'2026-04-30',label:'PCE USA (Mar)',type:'macro',impact:'High',country:'US',detail:'Inflazione preferita dalla Fed'},
  {date:'2026-05-29',label:'PCE USA (Apr)',type:'macro',impact:'High',country:'US',detail:'Inflazione preferita dalla Fed'},
  {date:'2026-06-26',label:'PCE USA (Mag)',type:'macro',impact:'High',country:'US',detail:'Inflazione preferita dalla Fed'},
  {date:'2026-07-31',label:'PCE USA (Giu)',type:'macro',impact:'High',country:'US',detail:'Inflazione preferita dalla Fed'},
  {date:'2026-08-28',label:'PCE USA (Lug)',type:'macro',impact:'High',country:'US',detail:'Inflazione preferita dalla Fed'},
  {date:'2026-09-25',label:'PCE USA (Ago)',type:'macro',impact:'High',country:'US',detail:'Inflazione preferita dalla Fed'},
  {date:'2026-10-30',label:'PCE USA (Set)',type:'macro',impact:'High',country:'US',detail:'Inflazione preferita dalla Fed'},
  {date:'2026-11-25',label:'PCE USA (Ott)',type:'macro',impact:'High',country:'US',detail:'Inflazione preferita dalla Fed'},
  {date:'2026-12-18',label:'PCE USA (Nov)',type:'macro',impact:'High',country:'US',detail:'Inflazione preferita dalla Fed'},
  // ── PIL USA (GDP) ──
  {date:'2026-01-29',label:'PIL USA Q3 (finale)',type:'macro',impact:'High',country:'US',detail:'GDP USA - dato finale'},
  {date:'2026-04-29',label:'PIL USA Q1 (prel.)',type:'macro',impact:'High',country:'US',detail:'GDP USA - stima preliminare'},
  {date:'2026-07-29',label:'PIL USA Q2 (prel.)',type:'macro',impact:'High',country:'US',detail:'GDP USA - stima preliminare'},
  {date:'2026-10-28',label:'PIL USA Q3 (prel.)',type:'macro',impact:'High',country:'US',detail:'GDP USA - stima preliminare'},
];

const ALLOWED_COUNTRIES = new Set(['US', 'EU', 'DE', 'FR', 'IT']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');

  const now   = new Date();
  const year  = parseInt(req.query.year  || now.getFullYear(),  10);
  const month = parseInt(req.query.month || now.getMonth() + 1, 10);

  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to   = `${year}-${String(month).padStart(2,'0')}-${lastDay}`;

  // ── Finnhub economic calendar ──
  const TOKEN = process.env.FINNHUB_API_KEY;
  if (TOKEN) {
    try {
      const url = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${TOKEN}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const raw = await r.json();
        const list = Array.isArray(raw.economicCalendar) ? raw.economicCalendar : [];
        const events = list
          .filter(e => {
            const country = (e.country || '').toUpperCase();
            const impact  = (e.impact  || '').toLowerCase();
            return ALLOWED_COUNTRIES.has(country) && (impact === 'high' || impact === 'medium');
          })
          .map(e => {
            const date = String(e.time || e.date || '').slice(0, 10);
            const ev   = (e.event || '').toLowerCase();
            let type   = 'macro';
            if (ev.includes('fed') || ev.includes('fomc') || ev.includes('federal reserve')) type = 'fed';
            else if (ev.includes('ecb') || ev.includes('european central') || ev.includes('bce')) type = 'bce';
            return {
              date,
              label:   e.event || '',
              type,
              country: (e.country || '').toUpperCase(),
              impact:  e.impact === 'high' ? 'High' : 'Medium',
              actual:  e.actual   ?? null,
              estimate:e.estimate ?? null,
              prev:    e.prev     ?? null,
              unit:    e.unit     || '',
            };
          })
          .filter(e => e.date && e.label)
          .sort((a, b) => a.date.localeCompare(b.date));

        if (events.length > 0) {
          return res.json({ ok: true, events, source: 'finnhub', from, to });
        }
      }
    } catch (_) {
      // fall through to hardcoded
    }
  }

  // Fallback: dati hardcoded filtrati per il mese richiesto
  const events = HARDCODED_2026
    .filter(e => e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ ...e, actual: null, estimate: null, prev: null, unit: '' }));

  return res.json({ ok: true, events, source: 'hardcoded', from, to });
}
