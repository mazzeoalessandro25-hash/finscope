export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbol, type } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    if (type === 'history') {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      });
      const data = await r.json();
      const result = data?.chart?.result?.[0];
      if (!result) return res.status(404).json({ error: 'no data' });
      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      return res.json({
        points: timestamps.map((t, i) => ({
          date: new Date(t * 1000).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
          close: closes[i]
        })).filter(x => x.close != null)
      });
    }

    if (type === 'summary') {
      const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics,summaryDetail,financialData`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      });
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
      });
    }

    // default: quote
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    const data = await r.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return res.status(404).json({ error: 'no data' });
    return res.json({
      symbol:   meta.symbol,
      price:    meta.regularMarketPrice,
      prev:     meta.previousClose ?? meta.chartPreviousClose,
      currency: meta.currency,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
