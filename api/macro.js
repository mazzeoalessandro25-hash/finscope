// Indicatori macroeconomici live da FRED API (St. Louis Fed)
// Cache Vercel edge 6h · stale-while-revalidate 24h
// Richiede env: FRED_API_KEY (gratuito su fred.stlouisfed.org)

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

// Prossime riunioni CB 2026 (hardcoded per anno in corso)
const CB_MEETINGS = {
  fomc: ['2026-07-29','2026-09-16','2026-10-28','2026-12-09'],
  ecb:  ['2026-07-23','2026-09-10','2026-10-22','2026-12-10'],
  boe:  ['2026-08-06','2026-09-18','2026-11-05','2026-12-17'],
  boj:  ['2026-07-17','2026-09-18','2026-10-29','2026-12-18'],
};

function nextMeeting(dates) {
  const today = new Date().toISOString().slice(0,10);
  return dates.find(d => d >= today) || dates[dates.length - 1];
}

function fmtMeetingDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
}

// Helper per Redis KV (Upstash REST)
async function kvGet(key) {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!base || !token) return null;
  try {
    const r = await fetch(`${base}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const d = await r.json();
    return d.result ?? null;
  } catch { return null; }
}

async function kvSet(key, value, ttlSeconds) {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!base || !token) return;
  try {
    await fetch(`${base}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, ex: ttlSeconds })
    });
  } catch { /* ignora */ }
}

// Fetch osservazioni FRED con timeout 5s
async function fredFetch(seriesId, limit) {
  const key = process.env.FRED_API_KEY;
  if (!key) return null;
  try {
    const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${key}&file_type=json&sort_order=desc&limit=${limit}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const d = await r.json();
    // Filtra valori mancanti (FRED usa '.' per dati non disponibili)
    return (d.observations || []).filter(o => o.value !== '.');
  } catch { return null; }
}

// Variazione YoY da 13 osservazioni mensili (decrescente: obs[0]=ultimo, obs[12]=12 mesi fa)
function yoy(obs) {
  if (!obs || obs.length < 13) return null;
  const v0 = parseFloat(obs[0].value);
  const v12 = parseFloat(obs[12].value);
  if (isNaN(v0) || isNaN(v12) || v12 === 0) return null;
  return ((v0 / v12 - 1) * 100);
}

// Valore più recente
function latest(obs) {
  if (!obs || !obs[0]) return null;
  const v = parseFloat(obs[0].value);
  return isNaN(v) ? null : v;
}

// Valore precedente (indice 1)
function prev(obs) {
  if (!obs || !obs[1]) return null;
  const v = parseFloat(obs[1].value);
  return isNaN(v) ? null : v;
}

// Variazione mensile assoluta (NFP: migliaia → unità)
function monthlyChange(obs) {
  const v0 = latest(obs);
  const v1 = prev(obs);
  if (v0 === null || v1 === null) return null;
  return Math.round(v0 - v1);
}

// YoY da osservazioni trimestrali (5 obs → confronto con anno fa = obs[4])
function yoyQuarterly(obs) {
  if (!obs || obs.length < 5) return null;
  const v0 = parseFloat(obs[0].value);
  const v4 = parseFloat(obs[4].value);
  if (isNaN(v0) || isNaN(v4) || v4 === 0) return null;
  return ((v0 / v4 - 1) * 100);
}

// Formatta mese da ISO date string "YYYY-MM-DD"
function fmtMonth(iso) {
  if (!iso) return null;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m] = iso.split('-');
  return months[parseInt(m) - 1] + ' ' + y;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Cache Vercel edge 6h, stale 24h
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');

  // Prova cache Redis (TTL 6h)
  const CACHE_KEY = 'finedge:macro:v2';
  const cached = await kvGet(CACHE_KEY);
  if (cached) {
    try { return res.json(JSON.parse(cached)); } catch { /* ignora, ri-fetch */ }
  }

  if (!process.env.FRED_API_KEY) {
    return res.status(503).json({ error: 'FRED_API_KEY not configured' });
  }

  // Fetch US e EU in parallelo
  const [
    cpiObs, coreCpiObs, pceObs, corePceObs,
    unrateObs, payemsObs, gdpObs, fedRateObs,
    euCpiObs, euUnrateObs, euGdpObs, euCoreCpiObs
  ] = await Promise.all([
    fredFetch('CPIAUCSL',   13),  // CPI All Items mensile
    fredFetch('CPILFESL',   13),  // Core CPI mensile
    fredFetch('PCEPI',      13),  // PCE mensile
    fredFetch('PCEPILFE',   13),  // Core PCE mensile
    fredFetch('UNRATE',      2),  // Disoccupazione USA
    fredFetch('PAYEMS',      2),  // Buste paga non-agricole (migliaia)
    fredFetch('GDPC1',       5),  // PIL reale USA (trimestrale)
    fredFetch('DFEDTARU',    1),  // Fed Funds Rate upper target
    fredFetch('CP0000EZ17M086NEST', 13), // HICP Eurozona (indice)
    fredFetch('LRHUTTTTEZM156S',     2), // Disoccupazione Eurozona
    fredFetch('CLVMNACSCAB1GQEA19',  5), // PIL reale Eurozona (trimestrale)
    fredFetch('CPGRLE01EZM659N',    13), // Core HICP Eurozona (se disponibile)
  ]);

  // Calcola valori
  const cpiYoy      = yoy(cpiObs);
  const coreCpiYoy  = yoy(coreCpiObs);
  const pceYoy      = yoy(pceObs);
  const corePceYoy  = yoy(corePceObs);
  const unrate      = latest(unrateObs);
  const unratePrev  = prev(unrateObs);
  const nfpChange   = monthlyChange(payemsObs); // in migliaia
  const gdpYoy      = yoyQuarterly(gdpObs);
  const fedRate     = latest(fedRateObs);
  const euCpiYoy    = yoy(euCpiObs);
  const euCoreCpiYoy = yoy(euCoreCpiObs);
  const euUnrate    = latest(euUnrateObs);
  const euUnratePrev = prev(euUnrateObs);
  const euGdpYoy    = yoyQuarterly(euGdpObs);

  // Calcola prossime riunioni CB
  const nextFomc = fmtMeetingDate(nextMeeting(CB_MEETINGS.fomc));
  const nextEcb  = fmtMeetingDate(nextMeeting(CB_MEETINGS.ecb));
  const nextBoe  = fmtMeetingDate(nextMeeting(CB_MEETINGS.boe));
  const nextBoj  = fmtMeetingDate(nextMeeting(CB_MEETINGS.boj));

  const result = {
    us: {
      cpiYoy:     cpiYoy !== null     ? parseFloat(cpiYoy.toFixed(1))     : null,
      coreCpiYoy: coreCpiYoy !== null ? parseFloat(coreCpiYoy.toFixed(1)) : null,
      pceYoy:     pceYoy !== null     ? parseFloat(pceYoy.toFixed(1))     : null,
      corePceYoy: corePceYoy !== null ? parseFloat(corePceYoy.toFixed(1)) : null,
      unrate:     unrate,
      unratePrev: unratePrev,
      nfpChange:  nfpChange,          // in migliaia
      gdpYoy:     gdpYoy !== null     ? parseFloat(gdpYoy.toFixed(1))     : null,
      fedRate:    fedRate,
      // Date dei dati (per aggiornare le etichette)
      cpiDate:    cpiObs?.[0]?.date     ? fmtMonth(cpiObs[0].date)     : null,
      pceDate:    pceObs?.[0]?.date     ? fmtMonth(pceObs[0].date)     : null,
      nfpDate:    payemsObs?.[0]?.date  ? fmtMonth(payemsObs[0].date)  : null,
      gdpDate:    gdpObs?.[0]?.date     ? fmtMonth(gdpObs[0].date)     : null,
      unrateDate: unrateObs?.[0]?.date  ? fmtMonth(unrateObs[0].date)  : null,
    },
    eu: {
      cpiYoy:     euCpiYoy !== null     ? parseFloat(euCpiYoy.toFixed(1))     : null,
      coreCpiYoy: euCoreCpiYoy !== null ? parseFloat(euCoreCpiYoy.toFixed(1)) : null,
      unrate:     euUnrate,
      unratePrev: euUnratePrev,
      gdpYoy:     euGdpYoy !== null     ? parseFloat(euGdpYoy.toFixed(1))     : null,
      cpiDate:    euCpiObs?.[0]?.date   ? fmtMonth(euCpiObs[0].date)   : null,
      unrateDate: euUnrateObs?.[0]?.date ? fmtMonth(euUnrateObs[0].date) : null,
    },
    cb: { nextFomc, nextEcb, nextBoe, nextBoj, fedRate },
    fetchedAt: new Date().toISOString(),
  };

  // Salva in Redis 6h
  await kvSet(CACHE_KEY, JSON.stringify(result), 21600);

  return res.json(result);
}
