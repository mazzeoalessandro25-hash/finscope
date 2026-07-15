// Prossima data earnings per simbolo — Yahoo calendarEvents + Redis cache 24h
// GET /api/earnings-next?symbols=AAPL,MSFT,UCG.MI (max 20 simboli)

import { yf } from './_lib/yahoo.js';

const tout = ms => new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms));

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
    await fetch(`${base}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['SET', key, value, 'EX', ttlSeconds]])
    });
  } catch { /* ignora */ }
}

// Fetch data earnings da Yahoo calendarEvents per un singolo simbolo
async function fetchEarningsDate(symbol) {
  try {
    const data = await Promise.race([
      yf.quoteSummary(symbol, { modules: ['calendarEvents'] }),
      tout(6000),
    ]);
    const dates = data?.calendarEvents?.earnings?.earningsDate;
    if (!Array.isArray(dates) || !dates.length) return null;

    // In yahoo-finance2 v3 earningsDate è un array di Date objects
    const raw = dates[0];
    const d = raw instanceof Date ? raw : new Date(raw);
    if (isNaN(d)) return null;

    // Scarta date più vecchie di 30 giorni (dati non ancora aggiornati post-earnings)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    if (d < cutoff) return null;

    return d.toISOString().slice(0, 10);
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const raw = req.query.symbols || req.query.symbol || '';
  const symbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);
  if (!symbols.length) return res.status(400).json({ error: 'symbols required' });

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=3600');

  const CACHE_TTL = 86400; // 24h — le date earnings cambiano raramente

  // Legge cache Redis per tutti i simboli in parallelo
  const cached = await Promise.all(symbols.map(s => kvGet(`fe:earn:${s}`)));

  const result = {};
  const toFetch = [];

  symbols.forEach((sym, i) => {
    if (cached[i]) {
      try { result[sym] = JSON.parse(cached[i]); } catch { toFetch.push(sym); }
    } else {
      toFetch.push(sym);
    }
  });

  // Fetch Yahoo per simboli non in cache (parallelo con timeout 6s per simbolo)
  if (toFetch.length) {
    const fetched = await Promise.all(toFetch.map(async sym => ({
      sym,
      date: await fetchEarningsDate(sym),
    })));

    await Promise.all(fetched.map(async ({ sym, date }) => {
      result[sym] = date ? { date } : null;
      if (date) await kvSet(`fe:earn:${sym}`, JSON.stringify({ date }), CACHE_TTL);
    }));
  }

  return res.json({ ok: true, result });
}
