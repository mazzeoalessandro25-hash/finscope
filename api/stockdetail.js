const YH1 = 'https://query1.finance.yahoo.com';
const YH2 = 'https://query2.finance.yahoo.com';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
};

async function safeFetch(url) {
  try {
    const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbol, priceonly } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  // Modalità solo prezzo (usata per l'auto-refresh ogni 30s)
  if (priceonly === '1') {
    res.setHeader('Cache-Control', 'no-store');
    const data = await safeFetch(
      `${YH1}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
    );
    const meta = data?.chart?.result?.[0]?.meta;
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

  // Cache 5 minuti per dati fondamentali (cambiano di rado)
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  // --- Fetch parallelo: v7/quote (affidabile) + v11/quoteSummary (fondamentali) + news ---
  const sym = encodeURIComponent(symbol);
  const [quoteData, summaryData, newsData] = await Promise.all([
    safeFetch(`${YH1}/v7/finance/quote?symbols=${sym}&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,regularMarketChange,regularMarketChangePercent,marketCap,trailingPE,forwardPE,priceToBook,trailingAnnualDividendYield,epsTrailingTwelveMonths,epsForward,beta,fiftyTwoWeekHigh,fiftyTwoWeekLow,averageVolume3Month,shortRatio,sharesOutstanding,floatShares,currency,shortName,longName`),
    safeFetch(`${YH2}/v11/finance/quoteSummary/${sym}?modules=defaultKeyStatistics,summaryDetail,financialData,assetProfile&formatted=false`),
    safeFetch(`${YH1}/v1/finance/search?q=${sym}&newsCount=6&quotesCount=0`),
  ]);

  const q  = quoteData?.quoteResponse?.result?.[0];
  const sd = summaryData?.quoteSummary?.result?.[0];
  const news = (newsData?.news || []).slice(0, 5).map(n => ({
    title:     n.title,
    publisher: n.publisher,
    link:      n.link,
    time:      n.providerPublishTime,
  }));

  if (!q && !sd) return res.status(404).json({ error: 'no data' });

  // Fonti: v7/quote per dati di mercato, v11/summary per fondamentali dettagliati
  const raw = (field, fallback = null) => sd ? (sd[field]?.raw ?? sd[field] ?? fallback) : fallback;

  return res.json({
    symbol:           q?.symbol || symbol,
    price:            q?.regularMarketPrice ?? null,
    prev:             q?.regularMarketPreviousClose ?? null,
    currency:         q?.currency || 'USD',
    name:             q?.longName || q?.shortName || symbol,
    dayHigh:          q?.regularMarketDayHigh ?? null,
    dayLow:           q?.regularMarketDayLow ?? null,
    volume:           q?.regularMarketVolume ?? null,
    marketCap:        q?.marketCap ?? sd?.summaryDetail?.marketCap?.raw ?? null,
    pe:               q?.trailingPE ?? sd?.summaryDetail?.trailingPE?.raw ?? null,
    forwardPE:        q?.forwardPE ?? sd?.defaultKeyStatistics?.forwardPE?.raw ?? null,
    pb:               q?.priceToBook ?? sd?.defaultKeyStatistics?.priceToBook?.raw ?? null,
    ps:               sd?.summaryDetail?.priceToSalesTrailing12Months?.raw ?? null,
    dividend:         q?.trailingAnnualDividendYield ?? sd?.summaryDetail?.dividendYield?.raw ?? null,
    eps:              q?.epsTrailingTwelveMonths ?? sd?.defaultKeyStatistics?.trailingEps?.raw ?? null,
    forwardEps:       q?.epsForward ?? sd?.defaultKeyStatistics?.forwardEps?.raw ?? null,
    beta:             q?.beta ?? sd?.summaryDetail?.beta?.raw ?? null,
    week52High:       q?.fiftyTwoWeekHigh ?? sd?.summaryDetail?.fiftyTwoWeekHigh?.raw ?? null,
    week52Low:        q?.fiftyTwoWeekLow ?? sd?.summaryDetail?.fiftyTwoWeekLow?.raw ?? null,
    avgVolume:        q?.averageVolume3Month ?? sd?.summaryDetail?.averageVolume3Month?.raw ?? null,
    shortRatio:       q?.shortRatio ?? sd?.defaultKeyStatistics?.shortRatio?.raw ?? null,
    sharesOutstanding:q?.sharesOutstanding ?? sd?.defaultKeyStatistics?.sharesOutstanding?.raw ?? null,
    floatShares:      q?.floatShares ?? sd?.defaultKeyStatistics?.floatShares?.raw ?? null,
    // Solo da v11/summary
    roe:              sd?.financialData?.returnOnEquity?.raw ?? null,
    roa:              sd?.financialData?.returnOnAssets?.raw ?? null,
    grossMargins:     sd?.financialData?.grossMargins?.raw ?? null,
    operatingMargins: sd?.financialData?.operatingMargins?.raw ?? null,
    profitMargins:    sd?.financialData?.profitMargins?.raw ?? null,
    revenueGrowth:    sd?.financialData?.revenueGrowth?.raw ?? null,
    earningsGrowth:   sd?.financialData?.earningsGrowth?.raw ?? null,
    totalRevenue:     sd?.financialData?.totalRevenue?.raw ?? null,
    ebitda:           sd?.financialData?.ebitda?.raw ?? null,
    freeCashflow:     sd?.financialData?.freeCashflow?.raw ?? null,
    totalCash:        sd?.financialData?.totalCash?.raw ?? null,
    totalDebt:        sd?.financialData?.totalDebt?.raw ?? null,
    debtToEquity:     sd?.financialData?.debtToEquity?.raw ?? null,
    currentRatio:     sd?.financialData?.currentRatio?.raw ?? null,
    quickRatio:       sd?.financialData?.quickRatio?.raw ?? null,
    targetPrice:      sd?.financialData?.targetMeanPrice?.raw ?? null,
    targetHigh:       sd?.financialData?.targetHighPrice?.raw ?? null,
    targetLow:        sd?.financialData?.targetLowPrice?.raw ?? null,
    numAnalysts:      sd?.financialData?.numberOfAnalystOpinions?.raw ?? null,
    rec:              sd?.financialData?.recommendationKey ?? null,
    sector:           sd?.assetProfile?.sector ?? null,
    industry:         sd?.assetProfile?.industry ?? null,
    description:      sd?.assetProfile?.longBusinessSummary ?? null,
    employees:        sd?.assetProfile?.fullTimeEmployees ?? null,
    website:          sd?.assetProfile?.website ?? null,
    news,
  });
}
