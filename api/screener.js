/**
 * /api/screener.js
 * Screener dinamico su tutto il mercato
 *
 * Modalità:
 *   GET /api/screener?q=apple           → autocomplete Yahoo Finance (qualsiasi ticker)
 *   GET /api/screener?symbols=AAPL,MSFT → bulk quote FMP (prezzo, change%, P/E)
 *   GET /api/screener?sector=Tech&...   → FMP stock screener con filtri
 *
 * Variabili d'ambiente richieste:
 *   FMP_API_KEY — Financial Modeling Prep (piano gratuito: 250 req/day)
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');

  const {
    q,            // autocomplete search query
    symbols,      // comma-separated list for bulk quote
    sector,       // FMP sector filter (es. Technology)
    country,      // ISO-2 country code (US, IT, DE, FR, GB, ...)
    marketCapMin, // minimum market cap in USD (es. 1000000000 = 1B)
    dividendMin,  // minimum annual dividend per share
    limit = '50', // max results (capped at 250)
    exchange,     // exchange short name (NYSE, NASDAQ, EURONEXT, XETRA, LSE, ...)
  } = req.query;

  const FMP_KEY = process.env.FMP_API_KEY;

  try {
    // ── MODALITÀ AUTOCOMPLETE ─────────────────────────────────────────────────
    // Cerca qualsiasi ticker/azienda tramite Yahoo Finance search API
    if (q !== undefined) {
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

    // ── MODALITÀ BULK QUOTE FMP ───────────────────────────────────────────────
    // Ritorna prezzo live, variazione%, P/E, market cap per simboli multipli
    if (symbols) {
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
        price:     s.price         ?? null,
        prev:      s.previousClose ?? null,
        chg:       s.changesPercentage ?? null,
        pe:        s.pe            ?? null,
        eps:       s.eps           ?? null,
        marketCap: s.marketCap     ?? null,
        dayHigh:   s.dayHigh       ?? null,
        dayLow:    s.dayLow        ?? null,
        yearHigh:  s.yearHigh      ?? null,
        yearLow:   s.yearLow       ?? null,
        volume:    s.volume        ?? null,
      }));

      return res.json({ quotes });
    }

    // ── MODALITÀ SCREENER FMP ─────────────────────────────────────────────────
    // Filtra l'intero mercato per settore, paese, capitalizzazione, dividendo, ecc.
    if (!FMP_KEY) {
      return res.status(503).json({
        error: 'FMP_API_KEY non configurata in Vercel',
        hint:  'Aggiungi FMP_API_KEY nelle Environment Variables di Vercel → Settings → Environment Variables',
      });
    }

    const lim = Math.min(parseInt(limit) || 50, 250);

    let url = `https://financialmodelingprep.com/api/v3/stock-screener`
      + `?isEtf=false&isActivelyTrading=true&limit=${lim}&apikey=${FMP_KEY}`;

    if (sector   && sector   !== 'all') url += `&sector=${encodeURIComponent(sector)}`;
    if (country  && country  !== 'all') url += `&country=${encodeURIComponent(country)}`;
    if (exchange && exchange !== 'all') url += `&exchangeShortName=${encodeURIComponent(exchange)}`;
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
      // FMP restituisce un oggetto con messaggio di errore se la chiave non è valida
      const msg = data?.['Error Message'] || data?.message || JSON.stringify(data).slice(0, 200);
      throw new Error('FMP screener: ' + msg);
    }

    // Mappa al formato interno
    const stocks = data.map(s => ({
      s:         s.symbol,
      n:         s.companyName  || s.symbol,
      sec:       s.sector       || '—',
      industry:  s.industry     || '',
      mkt:       detectMarket(s),
      exchange:  s.exchangeShortName || '',
      country:   s.country          || '',
      price:     s.price            ?? null,
      marketCap: s.marketCap        ?? null,
      divAnnual: s.lastAnnualDividend ?? null, // dividendo annuo per azione ($)
      beta:      s.beta             ?? null,
      volume:    s.volume           ?? null,
    }));

    return res.json({ stocks, total: stocks.length, source: 'fmp' });

  } catch (e) {
    console.error('[screener]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

/**
 * Classifica il mercato di appartenenza (US / IT / EU)
 * basandosi su exchange e codice paese FMP
 */
function detectMarket(s) {
  const ex      = (s.exchangeShortName || '').toUpperCase();
  const country = (s.country           || '').toUpperCase();

  if (country === 'IT' || ex === 'BIT')  return 'IT';

  const euExchanges  = ['EURONEXT', 'XETRA', 'LSE', 'SIX', 'OMX', 'OSE', 'CPH', 'HEL', 'VIE', 'WSE'];
  const euCountries  = ['DE', 'FR', 'NL', 'ES', 'CH', 'BE', 'PT', 'IE', 'FI', 'AT',
                         'SE', 'NO', 'DK', 'GB', 'PL', 'HU', 'CZ', 'GR', 'LU'];

  if (euExchanges.includes(ex) || euCountries.includes(country)) return 'EU';
  return 'US';
}
