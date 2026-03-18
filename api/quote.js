export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  const { symbol, type } = req.query;

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

  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    if (type === 'history') {
      const range = req.query.range || '1mo';
      const interval = range === '1d' ? '5m' : range === '5d' ? '15m' : '1d';
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
      return res.json({
        points: timestamps.map((t, i) => ({
          time: t,
          date: new Date(t * 1000).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
          open:   opens[i],
          high:   highs[i],
          low:    lows[i],
          close:  closes[i],
          volume: vols[i],
        })).filter(x => x.close != null)
      });
    }

    if (type === 'summary') {
      const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics,summaryDetail,financialData,assetProfile`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
      const data = await r.json();
      const d = data?.quoteSummary?.result?.[0];
      if (!d) return res.status(404).json({ error: 'no data' });
      return res.json({
        pe:          d.summaryDetail?.trailingPE?.raw ?? null,
        pb:          d.defaultKeyStatistics?.priceToBook?.raw ?? null,
        roe:         d.financialData?.returnOnEquity?.raw ?? null,
        dividend:    d.summaryDetail?.dividendYield?.raw ?? null,
        targetPrice: d.financialData?.targetMeanPrice?.raw ?? null,
        rec:         d.financialData?.recommendationKey ?? null,
        marketCap:   d.summaryDetail?.marketCap?.raw ?? null,
        eps:         d.defaultKeyStatistics?.trailingEps?.raw ?? null,
        beta:        d.summaryDetail?.beta?.raw ?? null,
        sector:      d.assetProfile?.sector ?? null,
        description: d.assetProfile?.longBusinessSummary ?? null,
        employees:   d.assetProfile?.fullTimeEmployees ?? null,
        website:     d.assetProfile?.website ?? null,
        week52High:  d.summaryDetail?.fiftyTwoWeekHigh?.raw ?? null,
        week52Low:   d.summaryDetail?.fiftyTwoWeekLow?.raw ?? null,
        avgVolume:   d.summaryDetail?.averageVolume?.raw ?? null,
      });
    }

    // default: quote
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
    const data = await r.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return res.status(404).json({ error: 'no data' });
    return res.json({
      symbol:        meta.symbol,
      price:         meta.regularMarketPrice,
      prev:          meta.previousClose ?? meta.chartPreviousClose,
      currency:      meta.currency,
      name:          meta.shortName || meta.symbol,
      dayHigh:       meta.regularMarketDayHigh,
      dayLow:        meta.regularMarketDayLow,
      volume:        meta.regularMarketVolume,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
