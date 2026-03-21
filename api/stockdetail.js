// Cache crumb/cookie a livello di modulo (riusato tra warm invocations di Vercel)
let _crumb = null;
let _cookie = null;
let _crumbExpiry = 0;

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

function parseCookies(res) {
  try {
    if (typeof res.headers.getSetCookie === 'function') {
      return res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    }
  } catch (_) {}
  const raw = res.headers.get('set-cookie') || '';
  return raw.split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

async function getYahooCrumb() {
  const now = Date.now();
  if (_crumb && _cookie && now < _crumbExpiry) return { crumb: _crumb, cookie: _cookie };

  try {
    // Step 1: visita Yahoo Finance per ottenere i cookie di sessione
    const r1 = await fetch('https://finance.yahoo.com/', {
      headers: BASE_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    _cookie = parseCookies(r1);

    // Step 2: recupera il crumb usando i cookie
    const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { ...BASE_HEADERS, Cookie: _cookie },
      signal: AbortSignal.timeout(5000),
    });
    if (!r2.ok) return null;
    _crumb = await r2.text();
    if (!_crumb || _crumb.includes('<')) { _crumb = null; return null; } // risposta HTML = fail
    _crumbExpiry = now + 3600000; // 1 ora di cache
    return { crumb: _crumb, cookie: _cookie };
  } catch (_) {
    return null;
  }
}

async function fetchSummary(symbol) {
  const auth = await getYahooCrumb();
  if (!auth) return null;
  const { crumb, cookie } = auth;
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics,summaryDetail,financialData,assetProfile&crumb=${encodeURIComponent(crumb)}`;
    const r = await fetch(url, {
      headers: { ...BASE_HEADERS, Cookie: cookie },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      // Crumb scaduto — invalida cache e riprova una volta
      _crumb = null; _cookie = null; _crumbExpiry = 0;
      const auth2 = await getYahooCrumb();
      if (!auth2) return null;
      const url2 = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics,summaryDetail,financialData,assetProfile&crumb=${encodeURIComponent(auth2.crumb)}`;
      const r2 = await fetch(url2, {
        headers: { ...BASE_HEADERS, Cookie: auth2.cookie },
        signal: AbortSignal.timeout(8000),
      });
      if (!r2.ok) return null;
      const d2 = await r2.json();
      return d2?.quoteSummary?.result?.[0] ?? null;
    }
    const data = await r.json();
    return data?.quoteSummary?.result?.[0] ?? null;
  } catch (_) {
    return null;
  }
}

async function fetchQuote(symbol) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      { headers: BASE_HEADERS, signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return null;
    const data = await r.json();
    return data?.chart?.result?.[0]?.meta ?? null;
  } catch (_) { return null; }
}

async function fetchNews(symbol) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=6&quotesCount=0`,
      { headers: BASE_HEADERS, signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) return [];
    const data = await r.json();
    return (data?.news || []).slice(0, 5).map(n => ({
      title: n.title, publisher: n.publisher, link: n.link, time: n.providerPublishTime,
    }));
  } catch (_) { return []; }
}

// Fallback FMP se disponibile
async function fetchFMP(symbol) {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  try {
    const [profileRes, metricsRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/api/v3/profile/${encodeURIComponent(symbol)}?apikey=${key}`, { signal: AbortSignal.timeout(6000) }),
      fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${encodeURIComponent(symbol)}?apikey=${key}`, { signal: AbortSignal.timeout(6000) }),
    ]);
    const profile = profileRes.ok ? (await profileRes.json())?.[0] : null;
    const ratios  = metricsRes.ok  ? (await metricsRes.json())?.[0]  : null;
    if (!profile) return null;
    return { profile, ratios };
  } catch (_) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbol, priceonly } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  // ── Modalità solo prezzo (auto-refresh 30s) ──
  if (priceonly === '1') {
    res.setHeader('Cache-Control', 'no-store');
    const meta = await fetchQuote(symbol);
    if (!meta) return res.status(404).json({ error: 'no data' });
    return res.json({
      price:    meta.regularMarketPrice ?? null,
      prev:     meta.previousClose ?? meta.chartPreviousClose ?? null,
      currency: meta.currency || 'USD',
      dayHigh:  meta.regularMarketDayHigh ?? null,
      dayLow:   meta.regularMarketDayLow ?? null,
      volume:   meta.regularMarketVolume ?? null,
    });
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  // ── Fetch parallelo: quote + summary + news ──
  const [meta, sd, news] = await Promise.all([
    fetchQuote(symbol),
    fetchSummary(symbol),
    fetchNews(symbol),
  ]);

  // ── Fallback FMP se Yahoo non ha restituito fondamentali ──
  let fmp = null;
  if (!sd) fmp = await fetchFMP(symbol);

  if (!meta && !sd && !fmp) return res.status(404).json({ error: 'no data' });

  const p = fmp?.profile;
  const r = fmp?.ratios;

  return res.json({
    symbol:           meta?.symbol || symbol,
    price:            meta?.regularMarketPrice ?? p?.price ?? null,
    prev:             meta?.previousClose ?? meta?.chartPreviousClose ?? null,
    currency:         meta?.currency || p?.currency || 'USD',
    name:             meta?.shortName || p?.companyName || symbol,
    dayHigh:          meta?.regularMarketDayHigh ?? null,
    dayLow:           meta?.regularMarketDayLow ?? null,
    volume:           meta?.regularMarketVolume ?? null,
    // Fondamentali — Yahoo primary, FMP fallback
    marketCap:        sd?.summaryDetail?.marketCap?.raw         ?? p?.mktCap ?? null,
    pe:               sd?.summaryDetail?.trailingPE?.raw         ?? r?.peRatioTTM ?? null,
    forwardPE:        sd?.defaultKeyStatistics?.forwardPE?.raw  ?? null,
    pb:               sd?.defaultKeyStatistics?.priceToBook?.raw ?? r?.priceToBookRatioTTM ?? null,
    ps:               sd?.summaryDetail?.priceToSalesTrailing12Months?.raw ?? r?.priceToSalesRatioTTM ?? null,
    dividend:         sd?.summaryDetail?.dividendYield?.raw      ?? p?.lastDiv ?? null,
    eps:              sd?.defaultKeyStatistics?.trailingEps?.raw ?? p?.eps ?? null,
    forwardEps:       sd?.defaultKeyStatistics?.forwardEps?.raw ?? null,
    beta:             sd?.summaryDetail?.beta?.raw               ?? p?.beta ?? null,
    week52High:       sd?.summaryDetail?.fiftyTwoWeekHigh?.raw  ?? null,
    week52Low:        sd?.summaryDetail?.fiftyTwoWeekLow?.raw   ?? null,
    avgVolume:        sd?.summaryDetail?.averageVolume?.raw      ?? null,
    shortRatio:       sd?.defaultKeyStatistics?.shortRatio?.raw ?? null,
    sharesOutstanding:sd?.defaultKeyStatistics?.sharesOutstanding?.raw ?? null,
    floatShares:      sd?.defaultKeyStatistics?.floatShares?.raw ?? null,
    roe:              sd?.financialData?.returnOnEquity?.raw      ?? r?.returnOnEquityTTM ?? null,
    roa:              sd?.financialData?.returnOnAssets?.raw      ?? r?.returnOnAssetsTTM ?? null,
    grossMargins:     sd?.financialData?.grossMargins?.raw        ?? r?.grossProfitMarginTTM ?? null,
    operatingMargins: sd?.financialData?.operatingMargins?.raw   ?? r?.operatingProfitMarginTTM ?? null,
    profitMargins:    sd?.financialData?.profitMargins?.raw       ?? r?.netProfitMarginTTM ?? null,
    revenueGrowth:    sd?.financialData?.revenueGrowth?.raw      ?? null,
    earningsGrowth:   sd?.financialData?.earningsGrowth?.raw     ?? null,
    totalRevenue:     sd?.financialData?.totalRevenue?.raw       ?? null,
    ebitda:           sd?.financialData?.ebitda?.raw             ?? null,
    freeCashflow:     sd?.financialData?.freeCashflow?.raw       ?? null,
    totalCash:        sd?.financialData?.totalCash?.raw          ?? null,
    totalDebt:        sd?.financialData?.totalDebt?.raw          ?? null,
    debtToEquity:     sd?.financialData?.debtToEquity?.raw       ?? r?.debtEquityRatioTTM ?? null,
    currentRatio:     sd?.financialData?.currentRatio?.raw       ?? r?.currentRatioTTM ?? null,
    quickRatio:       sd?.financialData?.quickRatio?.raw         ?? r?.quickRatioTTM ?? null,
    targetPrice:      sd?.financialData?.targetMeanPrice?.raw    ?? null,
    targetHigh:       sd?.financialData?.targetHighPrice?.raw    ?? null,
    targetLow:        sd?.financialData?.targetLowPrice?.raw     ?? null,
    numAnalysts:      sd?.financialData?.numberOfAnalystOpinions?.raw ?? null,
    rec:              sd?.financialData?.recommendationKey       ?? null,
    sector:           sd?.assetProfile?.sector                   ?? p?.sector ?? null,
    industry:         sd?.assetProfile?.industry                 ?? p?.industry ?? null,
    description:      sd?.assetProfile?.longBusinessSummary      ?? p?.description ?? null,
    employees:        sd?.assetProfile?.fullTimeEmployees        ?? p?.fullTimeEmployees ?? null,
    website:          sd?.assetProfile?.website                  ?? p?.website ?? null,
    news,
    _source: sd ? 'yahoo' : (fmp ? 'fmp' : 'price_only'),
  });
}
