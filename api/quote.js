import { fetchQuoteSummary, fetchYahooQuote } from './_lib/yahoo.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  const { symbol, type } = req.query;

  // TAPE NEWS — 2 titoli rapidi per la ticker tape
  if (type === 'tapenews') {
    try {
      const now = new Date();
      const hour = now.getUTCHours();
      // Orario NY: UTC-4 (EST) o UTC-5 (EDT)
      // Apertura = ~13:30 UTC, Chiusura = ~20:00 UTC
      const isOpen = hour >= 13 && hour < 20;
      const query = isOpen ? 'stock market opening today' : 'stock market close today';
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=4&quotesCount=0`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      });
      const data = await r.json();
      const news = (data?.news || []).slice(0, 2).map(n => ({
        title: n.title,
        publisher: n.publisher,
        link: n.link,
        isOpen,
      }));
      return res.json({ news, isOpen });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // NEWS endpoint — no symbol needed
  if (type === 'news') {
    try {
      const query = symbol || 'stock+market+borsa';
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=8&quotesCount=0`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      });
      const data = await r.json();
      const news = (data?.news || []).map(n => ({
        title: n.title,
        publisher: n.publisher,
        link: n.link,
        time: n.providerPublishTime,
        thumbnail: n.thumbnail?.resolutions?.[0]?.url || null,
      }));
      return res.json({ news });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // SEARCH — trova ticker da nome azienda
  if (type === 'search') {
    const q = req.query.q || symbol;
    if (!q) return res.status(400).json({ error: 'query required' });
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&enableFuzzyQuery=true`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
      const data = await r.json();
      const ALLOWED = ['EQUITY','ETF','CRYPTOCURRENCY','FUTURE','MUTUALFUND'];
      const TYPE_MAP = { EQUITY:'stock', ETF:'etf', CRYPTOCURRENCY:'crypto', FUTURE:'commodity', MUTUALFUND:'etf' };
      const quotes = (data?.quotes || [])
        .filter(x => ALLOWED.includes(x.quoteType))
        .slice(0, 10)
        .map(x => ({ symbol: x.symbol, name: x.shortname || x.longname || x.symbol, exchange: x.exchange, cat: TYPE_MAP[x.quoteType]||'stock' }));
      return res.json({ quotes });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    if (type === 'history') {
      const range = req.query.range || '1mo';
      const interval = range === '1d' ? '5m' : range === '5d' ? '15m' : range === 'max' ? '1wk' : '1d';
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
      const data = await r.json();
      const result = data?.chart?.result?.[0];
      if (!result) return res.status(404).json({ error: 'no data' });
      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const opens  = result.indicators?.quote?.[0]?.open  || [];
      const highs  = result.indicators?.quote?.[0]?.high  || [];
      const lows   = result.indicators?.quote?.[0]?.low   || [];
      const vols   = result.indicators?.quote?.[0]?.volume || [];
      const fmtDate = (t) => {
        const d = new Date(t * 1000);
        if (interval === '5m') {
          return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });
        }
        if (interval === '15m') {
          return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'America/New_York' })
            + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });
        }
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
      };
      return res.json({
        points: timestamps.map((t, i) => ({
          time: t,
          date: fmtDate(t),
          open:   opens[i],
          high:   highs[i],
          low:    lows[i],
          close:  closes[i],
          volume: vols[i],
        })).filter(x => x.close != null)
      });
    }

    if (type === 'summary') {
      const d = await fetchQuoteSummary(symbol);
      if (!d) return res.status(404).json({ error: 'no data' });
      return res.json({
        pe:               d.summaryDetail?.trailingPE ?? null,
        forwardPE:        d.defaultKeyStatistics?.forwardPE ?? null,
        pb:               d.defaultKeyStatistics?.priceToBook ?? null,
        ps:               d.summaryDetail?.priceToSalesTrailing12Months ?? null,
        roe:              d.financialData?.returnOnEquity ?? null,
        roa:              d.financialData?.returnOnAssets ?? null,
        dividend:         d.summaryDetail?.dividendYield ?? null,
        targetPrice:      d.financialData?.targetMeanPrice ?? null,
        rec:              d.financialData?.recommendationKey ?? null,
        marketCap:        d.summaryDetail?.marketCap ?? null,
        eps:              d.defaultKeyStatistics?.trailingEps ?? null,
        beta:             d.summaryDetail?.beta ?? null,
        sector:           d.assetProfile?.sector ?? null,
        description:      d.assetProfile?.longBusinessSummary ?? null,
        employees:        d.assetProfile?.fullTimeEmployees ?? null,
        website:          d.assetProfile?.website ?? null,
        week52High:       d.summaryDetail?.fiftyTwoWeekHigh ?? null,
        week52Low:        d.summaryDetail?.fiftyTwoWeekLow ?? null,
        avgVolume:        d.summaryDetail?.averageVolume ?? null,
        grossMargins:     d.financialData?.grossMargins ?? null,
        operatingMargins: d.financialData?.operatingMargins ?? null,
        profitMargins:    d.financialData?.profitMargins ?? null,
        debtToEquity:     d.financialData?.debtToEquity ?? null,
        currentRatio:     d.financialData?.currentRatio ?? null,
        revenueGrowth:    d.financialData?.revenueGrowth ?? null,
        earningsGrowth:   d.financialData?.earningsGrowth ?? null,
        freeCashflow:     d.financialData?.freeCashflow ?? null,
        totalCash:        d.financialData?.totalCash ?? null,
        totalDebt:        d.financialData?.totalDebt ?? null,
      });
    }

    // default: quote — usa yahoo-finance2 per avere marketCap nativo
    const q = await fetchYahooQuote(symbol);
    if (!q) return res.status(404).json({ error: 'no data' });

    // Calcola divYield in modo affidabile:
    // 1. Prova trailingAnnualDividendYield (già un ratio corretto nella maggior parte dei casi)
    // 2. Se è null/0 o > 25% (dati corrotti come NVO che mischia DKK e USD),
    //    usa summaryDetail.dividendYield che Yahoo calcola correttamente per ogni mercato
    let divYield = null;
    const rawY = q.trailingAnnualDividendYield;
    if (rawY != null && rawY > 0) {
      const norm = rawY > 1 ? rawY / 100 : rawY;
      if (norm <= 0.25) divYield = norm;
    }
    if (divYield === null) {
      // Fallback su summaryDetail.dividendYield (più lento ma affidabile per ADR/cross-listed)
      try {
        const sd = await fetchQuoteSummary(symbol);
        const sy = sd?.summaryDetail?.dividendYield;
        if (sy != null && sy > 0) {
          const norm = sy > 1 ? sy / 100 : sy;
          if (norm <= 0.25) divYield = norm;
        }
      } catch (_) { /* ignora errori, divYield resta null */ }
    }

    // beta: disponibile direttamente da yf.quote() nella maggior parte dei casi;
    // se mancante (es. ETF, crypto), prova summaryDetail come fallback.
    let beta = q.beta ?? null;
    if (beta === null) {
      try {
        const sd = await fetchQuoteSummary(symbol);
        beta = sd?.summaryDetail?.beta ?? null;
      } catch (_) { /* ignora, beta resta null */ }
    }

    return res.json({
      symbol:    q.symbol,
      price:     q.regularMarketPrice,
      prev:      q.regularMarketPreviousClose,
      currency:  q.currency,
      name:      q.shortName || q.longName || q.symbol,
      dayHigh:   q.regularMarketDayHigh,
      dayLow:    q.regularMarketDayLow,
      volume:    q.regularMarketVolume,
      marketCap: q.marketCap ?? null,
      beta,
      divYield,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
