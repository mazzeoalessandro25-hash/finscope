export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };

  try {
    // Fetch quote + summary + news in parallel (single server-side call per user click)
    const [quoteRes, summaryRes, newsRes] = await Promise.all([
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`, { headers }),
      fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics,summaryDetail,financialData,assetProfile`, { headers }),
      fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=6&quotesCount=0`, { headers }),
    ]);

    // Quote
    const quoteData = await quoteRes.json();
    const meta = quoteData?.chart?.result?.[0]?.meta;

    // Summary
    const summaryData = await summaryRes.json();
    const d = summaryData?.quoteSummary?.result?.[0];

    // News
    const newsData = await newsRes.json();
    const news = (newsData?.news || []).slice(0, 5).map(n => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      time: n.providerPublishTime,
    }));

    if (!meta && !d) return res.status(404).json({ error: 'no data' });

    return res.json({
      // Quote fields
      symbol:           meta?.symbol || symbol,
      price:            meta?.regularMarketPrice ?? null,
      prev:             meta?.previousClose ?? meta?.chartPreviousClose ?? null,
      currency:         meta?.currency || 'USD',
      name:             meta?.shortName || meta?.symbol || symbol,
      dayHigh:          meta?.regularMarketDayHigh ?? null,
      dayLow:           meta?.regularMarketDayLow ?? null,
      volume:           meta?.regularMarketVolume ?? null,
      // Summary fields
      pe:               d?.summaryDetail?.trailingPE?.raw ?? null,
      forwardPE:        d?.defaultKeyStatistics?.forwardPE?.raw ?? null,
      pb:               d?.defaultKeyStatistics?.priceToBook?.raw ?? null,
      ps:               d?.summaryDetail?.priceToSalesTrailing12Months?.raw ?? null,
      roe:              d?.financialData?.returnOnEquity?.raw ?? null,
      roa:              d?.financialData?.returnOnAssets?.raw ?? null,
      dividend:         d?.summaryDetail?.dividendYield?.raw ?? null,
      targetPrice:      d?.financialData?.targetMeanPrice?.raw ?? null,
      targetHigh:       d?.financialData?.targetHighPrice?.raw ?? null,
      targetLow:        d?.financialData?.targetLowPrice?.raw ?? null,
      numAnalysts:      d?.financialData?.numberOfAnalystOpinions?.raw ?? null,
      rec:              d?.financialData?.recommendationKey ?? null,
      recScore:         d?.financialData?.recommendationMean?.raw ?? null,
      marketCap:        d?.summaryDetail?.marketCap?.raw ?? null,
      eps:              d?.defaultKeyStatistics?.trailingEps?.raw ?? null,
      forwardEps:       d?.defaultKeyStatistics?.forwardEps?.raw ?? null,
      beta:             d?.summaryDetail?.beta?.raw ?? null,
      sector:           d?.assetProfile?.sector ?? null,
      industry:         d?.assetProfile?.industry ?? null,
      description:      d?.assetProfile?.longBusinessSummary ?? null,
      employees:        d?.assetProfile?.fullTimeEmployees ?? null,
      website:          d?.assetProfile?.website ?? null,
      week52High:       d?.summaryDetail?.fiftyTwoWeekHigh?.raw ?? null,
      week52Low:        d?.summaryDetail?.fiftyTwoWeekLow?.raw ?? null,
      avgVolume:        d?.summaryDetail?.averageVolume?.raw ?? null,
      grossMargins:     d?.financialData?.grossMargins?.raw ?? null,
      operatingMargins: d?.financialData?.operatingMargins?.raw ?? null,
      profitMargins:    d?.financialData?.profitMargins?.raw ?? null,
      debtToEquity:     d?.financialData?.debtToEquity?.raw ?? null,
      currentRatio:     d?.financialData?.currentRatio?.raw ?? null,
      quickRatio:       d?.financialData?.quickRatio?.raw ?? null,
      revenueGrowth:    d?.financialData?.revenueGrowth?.raw ?? null,
      earningsGrowth:   d?.financialData?.earningsGrowth?.raw ?? null,
      freeCashflow:     d?.financialData?.freeCashflow?.raw ?? null,
      totalCash:        d?.financialData?.totalCash?.raw ?? null,
      totalDebt:        d?.financialData?.totalDebt?.raw ?? null,
      totalRevenue:     d?.financialData?.totalRevenue?.raw ?? null,
      ebitda:           d?.financialData?.ebitda?.raw ?? null,
      sharesOutstanding:d?.defaultKeyStatistics?.sharesOutstanding?.raw ?? null,
      floatShares:      d?.defaultKeyStatistics?.floatShares?.raw ?? null,
      shortRatio:       d?.defaultKeyStatistics?.shortRatio?.raw ?? null,
      // News
      news,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
