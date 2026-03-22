/**
 * /api/screener.js
 * Screener dinamico — tutti gli indici mondiali
 *
 * Modalità:
 *   GET /api/screener?q=apple              → autocomplete Yahoo Finance
 *   GET /api/screener?symbols=AAPL,MSFT    → bulk quote FMP (prezzo, change%, P/E)
 *   GET /api/screener?index=sp500          → costituenti indice specifico
 *   GET /api/screener?sector=Tech&...      → FMP screener generico con filtri
 *
 * Indici supportati: sp500, nasdaq100, dowjones, ftsemib, dax, cac40,
 *                    ftse100, eurostoxx50, ibex35, smi, nikkei225, tsx, all
 *
 * Variabili d'ambiente richieste:
 *   FMP_API_KEY — Financial Modeling Prep (piano gratuito: 250 req/day)
 */

// Mappa indice → configurazione FMP
const INDEX_MAP = {
  sp500:       { endpoint: 'sp500_constituent',   mkt: 'US' },
  nasdaq100:   { endpoint: 'nasdaq_constituent',  mkt: 'US' },
  dowjones:    { endpoint: 'dowjones_constituent', mkt: 'US' },
  ftsemib:     { screener: 'exchangeShortName=BIT&limit=60',                            mkt: 'IT' },
  dax:         { screener: 'exchangeShortName=XETRA&country=DE&limit=50',               mkt: 'EU' },
  cac40:       { screener: 'country=FR&limit=60',                                       mkt: 'EU' },
  ftse100:     { screener: 'exchangeShortName=LSE&country=GB&limit=120',                mkt: 'EU' },
  eurostoxx50: { screener: 'exchangeShortName=EURONEXT&limit=80',                       mkt: 'EU' },
  ibex35:      { screener: 'country=ES&limit=50',                                       mkt: 'EU' },
  smi:         { screener: 'exchangeShortName=SIX&limit=30',                            mkt: 'EU' },
  nikkei225:   { screener: 'country=JP&limit=250',                                      mkt: 'AS' },
  tsx:         { screener: 'exchangeShortName=TSX&limit=100',                           mkt: 'CA' },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const {
    q,            // autocomplete search query
    symbols,      // comma-separated list for bulk quote
    index,        // nome indice: sp500 | nasdaq100 | dowjones | ftsemib | dax | ...
    sector,       // filtro settore
    country,      // ISO-2 country code
    marketCapMin, // min market cap in USD
    dividendMin,  // min dividendo annuo per azione
    limit = '50', // max results screener generico (capped a 250)
    exchange,     // exchange short name
  } = req.query;

  const FMP_KEY = process.env.FMP_API_KEY;

  try {
    // ── AUTOCOMPLETE ──────────────────────────────────────────────────────────
    if (q !== undefined) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
      if (!q.trim()) return res.json({ quotes: [] });

      const url = `https://query1.finance.yahoo.com/v1/finance/search`
        + `?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      });
      if (!r.ok) throw new Error(`Yahoo search error: ${r.status}`);
      const data = await r.json();

      const quotes = (data?.quotes || [])
        .filter(item => ['EQUITY', 'ETF'].includes(item.quoteType))
        .slice(0, 9)
        .map(item => ({
          symbol:   item.symbol,
          name:     item.shortname || item.longname || item.symbol,
          exchange: item.exchDisp  || item.exchange || '',
          type:     item.quoteType,
        }));

      return res.json({ quotes });
    }

    // ── BULK QUOTE ────────────────────────────────────────────────────────────
    if (symbols) {
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
      if (!FMP_KEY) return res.status(503).json({ error: 'FMP_API_KEY non configurata' });

      const symList = symbols.split(',').slice(0, 200).join(',');
      const url = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(symList)}?apikey=${FMP_KEY}`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      });
      if (!r.ok) throw new Error(`FMP bulk quote error: ${r.status}`);
      const data = await r.json();
      if (!Array.isArray(data)) throw new Error('FMP bulk quote: risposta non valida');

      const quotes = data.map(s => ({
        s:         s.symbol,
        price:     s.price             ?? null,
        prev:      s.previousClose     ?? null,
        chg:       s.changesPercentage ?? null,
        pe:        s.pe                ?? null,
        eps:       s.eps               ?? null,
        marketCap: s.marketCap         ?? null,
        dayHigh:   s.dayHigh           ?? null,
        dayLow:    s.dayLow            ?? null,
        yearHigh:  s.yearHigh          ?? null,
        yearLow:   s.yearLow           ?? null,
        volume:    s.volume            ?? null,
      }));

      return res.json({ quotes });
    }

    // ── INDICE SPECIFICO ──────────────────────────────────────────────────────
    if (index && index !== 'all') {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
      if (!FMP_KEY) return res.status(503).json({ error: 'FMP_API_KEY non configurata' });

      const cfg = INDEX_MAP[index];
      if (!cfg) return res.status(400).json({ error: 'Indice non supportato: ' + index });

      let stocks;

      if (cfg.endpoint) {
        // ── Endpoint costituenti FMP (S&P 500, NASDAQ 100, Dow Jones) ──
        const url = `https://financialmodelingprep.com/api/v3/${cfg.endpoint}?apikey=${FMP_KEY}`;
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        });
        if (!r.ok) throw new Error(`FMP constituent ${r.status}`);
        const data = await r.json();
        if (!Array.isArray(data)) throw new Error('FMP constituent: risposta non valida');

        stocks = data.map(s => ({
          s:        s.symbol,
          n:        s.name     || s.symbol,
          sec:      s.sector   || '—',
          industry: s.subSector || '',
          mkt:      cfg.mkt,
          country:  'US',
          // prezzi assenti nel constituent endpoint → il frontend farà bulk quote
        }));

      } else {
        // ── Screener FMP per indici europei/asiatici ──
        let url = `https://financialmodelingprep.com/api/v3/stock-screener`
          + `?isEtf=false&isActivelyTrading=true&${cfg.screener}&apikey=${FMP_KEY}`;
        if (sector && sector !== 'all') url += `&sector=${encodeURIComponent(sector)}`;

        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        });
        if (!r.ok) throw new Error(`FMP screener ${r.status}`);
        const data = await r.json();
        if (!Array.isArray(data)) {
          const msg = data?.['Error Message'] || data?.message || JSON.stringify(data).slice(0, 200);
          throw new Error('FMP screener: ' + msg);
        }

        stocks = data.map(s => ({
          s:         s.symbol,
          n:         s.companyName       || s.symbol,
          sec:       s.sector            || '—',
          industry:  s.industry          || '',
          mkt:       cfg.mkt || detectMarket(s),
          exchange:  s.exchangeShortName || '',
          country:   s.country           || '',
          price:     s.price             ?? null,
          marketCap: s.marketCap         ?? null,
          divAnnual: s.lastAnnualDividend ?? null,
          beta:      s.beta              ?? null,
          volume:    s.volume            ?? null,
        }));
      }

      // Filtra per settore lato server (per constituent endpoint)
      if (sector && sector !== 'all' && cfg.endpoint) {
        stocks = stocks.filter(s => s.sec === sector);
      }

      return res.json({ stocks, total: stocks.length, source: 'fmp-index', index });
    }

    // ── SCREENER GENERICO ("Tutti") ───────────────────────────────────────────
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    if (!FMP_KEY) {
      return res.status(503).json({
        error: 'FMP_API_KEY non configurata in Vercel',
        hint:  'Aggiungi FMP_API_KEY nelle Environment Variables → Settings → Environment Variables',
      });
    }

    const lim = Math.min(parseInt(limit) || 50, 250);
    let url = `https://financialmodelingprep.com/api/v3/stock-screener`
      + `?isEtf=false&isActivelyTrading=true&limit=${lim}&apikey=${FMP_KEY}`;

    if (sector      && sector      !== 'all') url += `&sector=${encodeURIComponent(sector)}`;
    if (country     && country     !== 'all') url += `&country=${encodeURIComponent(country)}`;
    if (exchange    && exchange    !== 'all') url += `&exchangeShortName=${encodeURIComponent(exchange)}`;
    if (marketCapMin) url += `&marketCapMoreThan=${marketCapMin}`;
    if (dividendMin)  url += `&lastAnnualDividendMoreThan=${dividendMin}`;

    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    });

    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`FMP screener ${r.status}: ${errText.slice(0, 200)}`);
    }

    const data = await r.json();
    if (!Array.isArray(data)) {
      const msg = data?.['Error Message'] || data?.message || JSON.stringify(data).slice(0, 200);
      throw new Error('FMP screener: ' + msg);
    }

    const stocks = data.map(s => ({
      s:         s.symbol,
      n:         s.companyName       || s.symbol,
      sec:       s.sector            || '—',
      industry:  s.industry          || '',
      mkt:       detectMarket(s),
      exchange:  s.exchangeShortName || '',
      country:   s.country           || '',
      price:     s.price             ?? null,
      marketCap: s.marketCap         ?? null,
      divAnnual: s.lastAnnualDividend ?? null,
      beta:      s.beta              ?? null,
      volume:    s.volume            ?? null,
    }));

    return res.json({ stocks, total: stocks.length, source: 'fmp' });

  } catch (e) {
    console.error('[screener]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

/**
 * Classifica il mercato (US / IT / EU / AS / CA)
 */
function detectMarket(s) {
  const ex      = (s.exchangeShortName || '').toUpperCase();
  const country = (s.country           || '').toUpperCase();

  if (country === 'IT' || ex === 'BIT') return 'IT';
  if (country === 'JP' || country === 'CN' || country === 'HK' || country === 'KR') return 'AS';
  if (country === 'CA' || ex === 'TSX') return 'CA';

  const euExchanges = ['EURONEXT', 'XETRA', 'LSE', 'SIX', 'OMX', 'OSE', 'CPH', 'HEL', 'VIE', 'WSE'];
  const euCountries = ['DE', 'FR', 'NL', 'ES', 'CH', 'BE', 'PT', 'IE', 'FI', 'AT',
                       'SE', 'NO', 'DK', 'GB', 'PL', 'HU', 'CZ', 'GR', 'LU'];

  if (euExchanges.includes(ex) || euCountries.includes(country)) return 'EU';
  return 'US';
}
