/**
 * api/newsletter.js
 * Genera il recap giornaliero in JSON per la newsletter FinEdge.
 *
 * GET /api/newsletter?preview=1           → anteprima senza auth (solo in dev / token segreto)
 * GET /api/newsletter?userId=user_xxx     → recap personalizzato per utente (richiede NEWSLETTER_SECRET)
 *
 * Struttura risposta JSON:
 * {
 *   date: "10 giugno 2026",
 *   market: { spx, ndx, stoxx, vix, eurusd },   // indici chiave
 *   portfolio: { totalEUR, dayPnlEUR, dayPnlPct, topMovers } | null,
 *   news: [ { title, link, publisher } ],
 *   generatedAt: ISO timestamp
 * }
 */

import { yf } from './_lib/yahoo.js';

// ── Helper: formatta data in italiano ────────────────────────
function fmtDateIT(date) {
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Helper: cambia percentuale ────────────────────────────────
function pct(price, prev) {
  if (!price || !prev) return null;
  return ((price - prev) / prev) * 100;
}

// ── Helper: formatta numero con segno ─────────────────────────
function fmtPct(v) {
  if (v == null) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

// ── Vercel KV helper (copia da user.js) ──────────────────────
async function kvGet(key) {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!base || !token) return null;
  try {
    const r = await fetch(`${base}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const d = await r.json();
    return d.result ? JSON.parse(d.result) : null;
  } catch { return null; }
}

// ── Fetch quote singola con timeout ──────────────────────────
async function fetchQuote(symbol) {
  try {
    const q = await Promise.race([
      yf.quote(symbol),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
    ]);
    return q;
  } catch { return null; }
}

// ── Fetch news Yahoo ──────────────────────────────────────────
async function fetchTopNews(query = 'stock market finance today', count = 5) {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${count}&quotesCount=0`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000)
    });
    if (!r.ok) return [];
    const data = await r.json();
    return (data?.news || []).slice(0, count).map(n => ({
      title: n.title,
      link: n.link,
      publisher: n.publisher || 'Yahoo Finance',
      time: n.providerPublishTime || null,
    }));
  } catch { return []; }
}

// ── Calcola dati portafoglio ──────────────────────────────────
async function buildPortfolioSection(portfolio, eurUsd) {
  if (!portfolio || !portfolio.length) return null;

  const syms = [...new Set(portfolio.map(p => p.sym))];
  const quotes = await Promise.all(syms.map(fetchQuote));
  const qMap = {};
  syms.forEach((s, i) => { if (quotes[i]) qMap[s] = quotes[i]; });

  let totalUSD = 0, dailyPnlUSD = 0;
  const movers = [];

  for (const item of portfolio) {
    const q = qMap[item.sym];
    if (!q || !q.regularMarketPrice) continue;

    const price = q.regularMarketPrice;
    const prev  = q.regularMarketPreviousClose || price;
    const qty   = item.qty || 0;
    const posVal = price * qty;
    const dayChgPct = pct(price, prev);

    totalUSD += posVal;
    dailyPnlUSD += (price - prev) * qty;

    movers.push({
      sym:    item.sym,
      name:   q.shortName || q.longName || item.sym,
      price,
      dayChgPct,
      posVal,
    });
  }

  // Top 3 movers: migliori e peggiori
  const sorted = movers
    .filter(m => m.dayChgPct != null)
    .sort((a, b) => Math.abs(b.dayChgPct) - Math.abs(a.dayChgPct));
  const topMovers = sorted.slice(0, 3).map(m => ({
    sym:       m.sym,
    name:      m.name,
    dayChgPct: fmtPct(m.dayChgPct),
    up:        m.dayChgPct >= 0,
  }));

  const totalEUR    = totalUSD / (eurUsd || 1);
  const dayPnlEUR   = dailyPnlUSD / (eurUsd || 1);
  const dayPnlPct   = totalUSD > 0 ? (dailyPnlUSD / (totalUSD - dailyPnlUSD)) * 100 : 0;

  return {
    totalEUR:   Math.round(totalEUR),
    dayPnlEUR:  Math.round(dayPnlEUR),
    dayPnlPct:  fmtPct(dayPnlPct),
    dayPnlUp:   dayPnlPct >= 0,
    positions:  portfolio.length,
    topMovers,
  };
}

// ── Handler principale ────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');

  const { preview, userId, secret } = req.query;

  // Autenticazione: preview senza auth (solo con NEWSLETTER_SECRET) oppure userId autenticato
  const isPreview = preview === '1';
  const secretOk  = process.env.NEWSLETTER_SECRET && secret === process.env.NEWSLETTER_SECRET;

  if (!isPreview && !secretOk) {
    return res.status(401).json({ error: 'Non autorizzato' });
  }

  try {
    // ── 1. Fetch indici di mercato in parallelo ───────────────
    const [spxQ, ndxQ, stoxxQ, vixQ, eurUsdQ, newsArr] = await Promise.all([
      fetchQuote('^GSPC'),
      fetchQuote('^IXIC'),
      fetchQuote('^STOXX50E'),
      fetchQuote('^VIX'),
      fetchQuote('EURUSD=X'),
      fetchTopNews('global stock market finance bonds today', 5),
    ]);

    const eurUsd = eurUsdQ?.regularMarketPrice || 1.08;

    const market = {
      spx: {
        price: spxQ?.regularMarketPrice ?? null,
        chgPct: fmtPct(pct(spxQ?.regularMarketPrice, spxQ?.regularMarketPreviousClose)),
        up: (spxQ?.regularMarketPrice ?? 0) >= (spxQ?.regularMarketPreviousClose ?? 0),
      },
      ndx: {
        price: ndxQ?.regularMarketPrice ?? null,
        chgPct: fmtPct(pct(ndxQ?.regularMarketPrice, ndxQ?.regularMarketPreviousClose)),
        up: (ndxQ?.regularMarketPrice ?? 0) >= (ndxQ?.regularMarketPreviousClose ?? 0),
      },
      stoxx: {
        price: stoxxQ?.regularMarketPrice ?? null,
        chgPct: fmtPct(pct(stoxxQ?.regularMarketPrice, stoxxQ?.regularMarketPreviousClose)),
        up: (stoxxQ?.regularMarketPrice ?? 0) >= (stoxxQ?.regularMarketPreviousClose ?? 0),
      },
      vix: {
        price: vixQ?.regularMarketPrice ?? null,
        up: (vixQ?.regularMarketPrice ?? 0) >= (vixQ?.regularMarketPreviousClose ?? 0),
      },
      eurusd: {
        price: eurUsd?.toFixed ? eurUsd.toFixed(4) : eurUsd,
        up: (eurUsdQ?.regularMarketPrice ?? 0) >= (eurUsdQ?.regularMarketPreviousClose ?? 0),
      },
    };

    // ── 2. Portafoglio utente (opzionale) ─────────────────────
    let portfolioSection = null;
    const targetUid = userId || (isPreview ? null : null);
    if (targetUid) {
      const portfolio = await kvGet(`${targetUid}:portfolio`);
      portfolioSection = await buildPortfolioSection(portfolio, eurUsd);
    }

    // ── 3. Risposta JSON ──────────────────────────────────────
    return res.json({
      date:        fmtDateIT(new Date()),
      market,
      portfolio:   portfolioSection,
      news:        newsArr,
      generatedAt: new Date().toISOString(),
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
