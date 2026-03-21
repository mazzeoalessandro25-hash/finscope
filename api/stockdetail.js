import { YH_HEADERS, fetchQuoteSummary } from './_lib/yahoo.js';

async function fetchQuote(symbol) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      { headers: YH_HEADERS, signal: AbortSignal.timeout(8000) }
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
      { headers: YH_HEADERS, signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) return [];
    const data = await r.json();
    return (data?.news || []).slice(0, 5).map(n => ({
      title: n.title, publisher: n.publisher, link: n.link, time: n.providerPublishTime,
    }));
  } catch (_) { return []; }
}

async function fetchFMP(symbol) {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  try {
    const [profileRes, ratiosRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/api/v3/profile/${encodeURIComponent(symbol)}?apikey=${key}`, { signal: AbortSignal.timeout(6000) }),
      fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${encodeURIComponent(symbol)}?apikey=${key}`, { signal: AbortSignal.timeout(6000) }),
    ]);
    const profile = profileRes.ok ? (await profileRes.json())?.[0] : null;
    const ratios  = ratiosRes.ok  ? (await ratiosRes.json())?.[0]  : null;
    if (!profile) return null;
    return { profile, ratios };
  } catch (_) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbol, priceonly } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  // ── Solo prezzo (auto-refresh 30s) ──
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

  // ── Fetch parallelo ──
  const [meta, sd, news] = await Promise.all([
    fetchQuote(symbol),
    fetchQuoteSummary(symbol),
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
    marketCap:        sd?.summaryDetail?.marketCap?.raw          ?? p?.mktCap ?? null,
    pe:               sd?.summaryDetail?.trailingPE?.raw          ?? r?.peRatioTTM ?? null,
    forwardPE:        sd?.defaultKeyStatistics?.forwardPE?.raw   ?? null,
    pb:               sd?.defaultKeyStatistics?.priceToBook?.raw  ?? r?.priceToBookRatioTTM ?? null,
    ps:               sd?.summaryDetail?.priceToSalesTrailing12Months?.raw ?? r?.priceToSalesRatioTTM ?? null,
    dividend:         sd?.summaryDetail?.dividendYield?.raw       ?? p?.lastDiv ?? null,
    eps:              sd?.defaultKeyStatistics?.trailingEps?.raw  ?? p?.eps ?? null,
    forwardEps:       sd?.defaultKeyStatistics?.forwardEps?.raw  ?? null,
    beta:             sd?.summaryDetail?.beta?.raw                ?? p?.beta ?? null,
    week52High:       sd?.summaryDetail?.fiftyTwoWeekHigh?.raw   ?? null,
    week52Low:        sd?.summaryDetail?.fiftyTwoWeekLow?.raw    ?? null,
    avgVolume:        sd?.summaryDetail?.averageVolume?.raw       ?? null,
    shortRatio:       sd?.defaultKeyStatistics?.shortRatio?.raw  ?? null,
    sharesOutstanding:sd?.defaultKeyStatistics?.sharesOutstanding?.raw ?? null,
    floatShares:      sd?.defaultKeyStatistics?.floatShares?.raw  ?? null,
    roe:              sd?.financialData?.returnOnEquity?.raw       ?? r?.returnOnEquityTTM ?? null,
    roa:              sd?.financialData?.returnOnAssets?.raw       ?? r?.returnOnAssetsTTM ?? null,
    grossMargins:     sd?.financialData?.grossMargins?.raw         ?? r?.grossProfitMarginTTM ?? null,
    operatingMargins: sd?.financialData?.operatingMargins?.raw    ?? r?.operatingProfitMarginTTM ?? null,
    profitMargins:    sd?.financialData?.profitMargins?.raw        ?? r?.netProfitMarginTTM ?? null,
    revenueGrowth:    sd?.financialData?.revenueGrowth?.raw       ?? null,
    earningsGrowth:   sd?.financialData?.earningsGrowth?.raw      ?? null,
    totalRevenue:     sd?.financialData?.totalRevenue?.raw        ?? null,
    ebitda:           sd?.financialData?.ebitda?.raw              ?? null,
    freeCashflow:     sd?.financialData?.freeCashflow?.raw        ?? null,
    totalCash:        sd?.financialData?.totalCash?.raw           ?? null,
    totalDebt:        sd?.financialData?.totalDebt?.raw           ?? null,
    debtToEquity:     sd?.financialData?.debtToEquity?.raw        ?? r?.debtEquityRatioTTM ?? null,
    currentRatio:     sd?.financialData?.currentRatio?.raw        ?? r?.currentRatioTTM ?? null,
    quickRatio:       sd?.financialData?.quickRatio?.raw          ?? r?.quickRatioTTM ?? null,
    targetPrice:      sd?.financialData?.targetMeanPrice?.raw     ?? null,
    targetHigh:       sd?.financialData?.targetHighPrice?.raw     ?? null,
    targetLow:        sd?.financialData?.targetLowPrice?.raw      ?? null,
    numAnalysts:      sd?.financialData?.numberOfAnalystOpinions?.raw ?? null,
    rec:              sd?.financialData?.recommendationKey        ?? null,
    sector:           sd?.assetProfile?.sector                    ?? p?.sector ?? null,
    industry:         sd?.assetProfile?.industry                  ?? p?.industry ?? null,
    description:      sd?.assetProfile?.longBusinessSummary       ?? p?.description ?? null,
    employees:        sd?.assetProfile?.fullTimeEmployees         ?? p?.fullTimeEmployees ?? null,
    website:          sd?.assetProfile?.website                   ?? p?.website ?? null,
    news,
    _source: sd ? 'yahoo' : (fmp ? 'fmp' : 'price_only'),
  });
}
