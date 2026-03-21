import { fetchQuoteSummary, fetchYahooQuote } from './_lib/yahoo.js';

async function fetchNews(symbol) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=6&quotesCount=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) return [];
    const data = await r.json();
    return (data?.news || []).slice(0, 5).map(n => ({
      title: n.title, publisher: n.publisher, link: n.link, time: n.providerPublishTime,
    }));
  } catch (_) { return []; }
}

async function translateToItalian(text) {
  if (!text || text.length < 20) return text;
  const chunks = [];
  for (let i = 0; i < text.length; i += 450) chunks.push(text.slice(i, i + 450));
  const parts = [];
  for (const chunk of chunks) {
    try {
      const r = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|it`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!r.ok) { parts.push(chunk); continue; }
      const d = await r.json();
      const t = d?.responseData?.translatedText;
      parts.push(t && !t.includes('MYMEMORY WARNING') ? t : chunk);
    } catch { parts.push(chunk); }
  }
  return parts.join(' ');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbol, priceonly } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  // ── Solo prezzo (auto-refresh 30s) ──
  if (priceonly === '1') {
    res.setHeader('Cache-Control', 'no-store');
    const q = await fetchYahooQuote(symbol);
    if (!q) return res.status(404).json({ error: 'no data' });
    return res.json({
      price:    q.regularMarketPrice ?? null,
      prev:     q.regularMarketPreviousClose ?? null,
      currency: q.currency || 'USD',
      dayHigh:  q.regularMarketDayHigh ?? null,
      dayLow:   q.regularMarketDayLow ?? null,
      volume:   q.regularMarketVolume ?? null,
    });
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  const [q, sd, news] = await Promise.all([
    fetchYahooQuote(symbol),
    fetchQuoteSummary(symbol),
    fetchNews(symbol),
  ]);

  if (!q && !sd) return res.status(404).json({ error: 'no data' });

  return res.json({
    symbol:            q?.symbol || symbol,
    price:             q?.regularMarketPrice ?? null,
    prev:              q?.regularMarketPreviousClose ?? null,
    currency:          q?.currency || 'USD',
    name:              q?.longName || q?.shortName || symbol,
    dayHigh:           q?.regularMarketDayHigh ?? null,
    dayLow:            q?.regularMarketDayLow ?? null,
    volume:            q?.regularMarketVolume ?? null,
    marketCap:         q?.marketCap ?? sd?.summaryDetail?.marketCap ?? null,
    pe:                q?.trailingPE ?? sd?.summaryDetail?.trailingPE ?? null,
    forwardPE:         q?.forwardPE ?? sd?.defaultKeyStatistics?.forwardPE ?? null,
    pb:                sd?.defaultKeyStatistics?.priceToBook ?? null,
    ps:                sd?.summaryDetail?.priceToSalesTrailing12Months ?? null,
    dividend:          q?.trailingAnnualDividendYield ?? sd?.summaryDetail?.dividendYield ?? null,
    eps:               q?.epsTrailingTwelveMonths ?? sd?.defaultKeyStatistics?.trailingEps ?? null,
    forwardEps:        q?.epsForward ?? sd?.defaultKeyStatistics?.forwardEps ?? null,
    beta:              q?.beta ?? sd?.summaryDetail?.beta ?? null,
    week52High:        q?.fiftyTwoWeekHigh ?? sd?.summaryDetail?.fiftyTwoWeekHigh ?? null,
    week52Low:         q?.fiftyTwoWeekLow ?? sd?.summaryDetail?.fiftyTwoWeekLow ?? null,
    avgVolume:         q?.averageVolume3Month ?? sd?.summaryDetail?.averageVolume3Month ?? null,
    shortRatio:        sd?.defaultKeyStatistics?.shortRatio ?? null,
    sharesOutstanding: sd?.defaultKeyStatistics?.sharesOutstanding ?? null,
    floatShares:       sd?.defaultKeyStatistics?.floatShares ?? null,
    roe:               sd?.financialData?.returnOnEquity ?? null,
    roa:               sd?.financialData?.returnOnAssets ?? null,
    grossMargins:      sd?.financialData?.grossMargins ?? null,
    operatingMargins:  sd?.financialData?.operatingMargins ?? null,
    profitMargins:     sd?.financialData?.profitMargins ?? null,
    revenueGrowth:     sd?.financialData?.revenueGrowth ?? null,
    earningsGrowth:    sd?.financialData?.earningsGrowth ?? null,
    totalRevenue:      sd?.financialData?.totalRevenue ?? null,
    ebitda:            sd?.financialData?.ebitda ?? null,
    freeCashflow:      sd?.financialData?.freeCashflow ?? null,
    totalCash:         sd?.financialData?.totalCash ?? null,
    totalDebt:         sd?.financialData?.totalDebt ?? null,
    debtToEquity:      sd?.financialData?.debtToEquity ?? null,
    currentRatio:      sd?.financialData?.currentRatio ?? null,
    quickRatio:        sd?.financialData?.quickRatio ?? null,
    targetPrice:       sd?.financialData?.targetMeanPrice ?? null,
    targetHigh:        sd?.financialData?.targetHighPrice ?? null,
    targetLow:         sd?.financialData?.targetLowPrice ?? null,
    numAnalysts:       sd?.financialData?.numberOfAnalystOpinions ?? null,
    rec:               sd?.financialData?.recommendationKey ?? null,
    sector:            sd?.assetProfile?.sector ?? null,
    industry:          sd?.assetProfile?.industry ?? null,
    description:       sd?.assetProfile?.longBusinessSummary ?? null,
    employees:         sd?.assetProfile?.fullTimeEmployees ?? null,
    website:           sd?.assetProfile?.website ?? null,
    news,
  });
}
