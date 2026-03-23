import { fetchQuoteSummary, fetchYahooQuote } from './_lib/yahoo.js';

// Costruisce parole chiave dal ticker e dal nome azienda per filtrare i risultati
function buildCompanyKeywords(symbol, companyName) {
  const baseSym = symbol.replace(/\.[A-Z0-9]+$/, '').toLowerCase(); // es. "eni" da "ENI.MI"
  const keywords = new Set([baseSym]);

  if (companyName) {
    // Aggiunge ogni parola del nome > 3 caratteri (esclude "Inc", "SpA", "Corp", ecc.)
    const stopwords = new Set(['inc','corp','plc','spa','nv','ltd','llc','the','and','group','holding','holdings','sa','ag','se']);
    companyName.toLowerCase().split(/[\s,.\-&]+/).forEach(w => {
      if (w.length > 3 && !stopwords.has(w)) keywords.add(w);
    });
  }
  return [...keywords];
}

function articleMatchesCompany(article, keywords) {
  const text = ((article.title || '') + ' ' + (article.publisher || '')).toLowerCase();
  return keywords.some(kw => text.includes(kw));
}

async function fetchNews(symbol, companyName) {
  const keywords = buildCompanyKeywords(symbol, companyName);
  const baseSym  = symbol.replace(/\.[A-Z0-9]+$/, '');

  // Yahoo Finance: cerca per ticker base + nome azienda
  const yahooFetch = async () => {
    try {
      // Prima query: ticker puro (es. "AAPL", "ENI")
      // Seconda query: nome azienda (es. "Apple", "Ferrari")
      const queries = [baseSym, companyName].filter(Boolean);
      const results = await Promise.all(queries.map(async q => {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=8&quotesCount=0`,
          { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, signal: AbortSignal.timeout(6000) }
        );
        if (!r.ok) return [];
        const data = await r.json();
        return (data?.news || []).map(n => ({
          title: n.title, publisher: n.publisher, link: n.link,
          time: n.providerPublishTime, thumbnail: n.thumbnail?.resolutions?.[0]?.url || null,
        }));
      }));
      // Filtra: tiene solo articoli che menzionano il ticker o il nome azienda nel titolo
      return results.flat().filter(a => articleMatchesCompany(a, keywords));
    } catch { return []; }
  };

  // Finnhub: company-news è già specifico per ticker
  const finnhubFetch = async () => {
    const token = process.env.FINNHUB_KEY || '';
    if (!token) return [];
    try {
      const to   = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10); // ultimi 14gg
      const r = await fetch(
        `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(baseSym)}&from=${from}&to=${to}&token=${token}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!r.ok) return [];
      const data = await r.json();
      return (Array.isArray(data) ? data : []).slice(0, 8).map(n => ({
        title: n.headline, publisher: n.source, link: n.url, time: n.datetime, thumbnail: n.image || null,
      }));
    } catch { return []; }
  };

  const [yahoo, finnhub] = await Promise.all([yahooFetch(), finnhubFetch()]);

  // Merge, deduplication, ordinamento per data
  const seen = new Set();
  return [...finnhub, ...yahoo]  // Finnhub prima (più preciso)
    .filter(a => {
      if (!a?.title || !a?.link) return false;
      const key = a.title.slice(0, 60).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key); return true;
    })
    .sort((a, b) => (b.time || 0) - (a.time || 0))
    .slice(0, 6);
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
    recScore:          sd?.financialData?.recommendationMean ?? null,
    sector:            sd?.assetProfile?.sector ?? null,
    industry:          sd?.assetProfile?.industry ?? null,
    description:       sd?.assetProfile?.longBusinessSummary ?? null,
    employees:         sd?.assetProfile?.fullTimeEmployees ?? null,
    website:           sd?.assetProfile?.website ?? null,
    news,
  });
}
