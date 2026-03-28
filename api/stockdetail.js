import { fetchQuoteSummary, fetchYahooQuote } from './_lib/yahoo.js';

// Parole comuni inglesi che NON devono essere usate come keyword di ricerca
const COMMON_WORDS = new Set([
  'race','air','gold','silver','oil','gas','power','energy','water','fire','core',
  'play','move','view','link','open','next','plus','prime','edge','peak','base',
  'nova','apex','axis','cash','cash','star','blue','green','black','white','red',
]);

function buildNewsKeywords(baseSym, companyName) {
  const stopwords = new Set([
    'inc','corp','plc','spa','nv','ltd','llc','the','and','group','holding','holdings',
    'sa','ag','se','co','bv','asa','ab','oyj','srl','sas','snc','spa','scpa',
  ]);
  const keywords = [];

  // Ticker solo se non è una parola comune e ha almeno 4 caratteri
  if (baseSym.length >= 4 && !COMMON_WORDS.has(baseSym.toLowerCase())) {
    keywords.push(baseSym.toLowerCase());
  }

  // Parole significative del nome azienda (più affidabili del ticker)
  if (companyName) {
    companyName.toLowerCase().split(/[\s,.\-&()]+/).forEach(w => {
      if (w.length >= 4 && !stopwords.has(w) && !COMMON_WORDS.has(w)) {
        keywords.push(w);
      }
    });
  }

  return [...new Set(keywords)]; // deduplicati
}

async function fetchNews(symbol, companyName) {
  const baseSym  = symbol.replace(/\.[A-Z0-9]+$/, ''); // "RACE" da "RACE.MI"
  const keywords = buildNewsKeywords(baseSym, companyName);

  // Query di ricerca: preferisce il nome azienda al ticker se il ticker è ambiguo
  // Es: "RACE.MI" → cerca "Ferrari" non "RACE"
  const searchQuery = (COMMON_WORDS.has(baseSym.toLowerCase()) && companyName)
    ? companyName.split(/[\s,]/)[0]  // prima parola del nome es. "Ferrari"
    : baseSym;

  // ── 1. Finnhub company-news (ticker-specifico, fonte più affidabile) ──
  const finnhubFetch = async () => {
    const token = process.env.FINNHUB_KEY || '';
    if (!token) return [];
    try {
      const to   = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
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

  // ── 2. Yahoo Finance: cerca per nome azienda o ticker con filtro rigoroso ──
  const yahooFetch = async () => {
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(searchQuery)}&newsCount=12&quotesCount=0`,
        { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, signal: AbortSignal.timeout(6000) }
      );
      if (!r.ok) return [];
      const data = await r.json();

      if (!keywords.length) return []; // nessuna keyword → non possiamo filtrare in sicurezza

      // Filtra: il titolo deve contenere almeno una keyword come parola intera
      return (data?.news || []).filter(n => {
        const title = (n.title || '').toLowerCase();
        return keywords.some(kw => {
          const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
          return re.test(title);
        });
      }).slice(0, 6).map(n => ({
        title: n.title, publisher: n.publisher, link: n.link,
        time: n.providerPublishTime, thumbnail: n.thumbnail?.resolutions?.[0]?.url || null,
      }));
    } catch { return []; }
  };

  const [finnhub, yahoo] = await Promise.all([finnhubFetch(), yahooFetch()]);

  const seen = new Set();
  return [...finnhub, ...yahoo]
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

  const { symbol, priceonly, nonews } = req.query;
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

  // Quote prima (fast/cached) → nome azienda disponibile per filtrare le news
  const q = await fetchYahooQuote(symbol);
  const companyName = q?.longName || q?.shortName || null;

  const [sd, news] = await Promise.all([
    fetchQuoteSummary(symbol),
    fetchNews(symbol, companyName),
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
