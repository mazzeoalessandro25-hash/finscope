/**
 * /api/news.js
 * Aggregatore multi-fonte: RSS + Finnhub + Yahoo Finance
 *
 * ?category=mercati|italia|usa|commodities|forex|crypto|macro
 * ?symbol=AAPL   → news azienda specifica
 * ?q=AAPL+MSFT   → ricerca libera (portfolio)
 * ?debug=1       → mostra conteggio articoli per fonte
 */

const RSS_TIMEOUT = 8000;

// ─── RSS parsing ──────────────────────────────────────────────
function extractTag(xml, tag) {
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const plainRe  = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const cm = cdataRe.exec(xml); if (cm) return cm[1].trim();
  const pm = plainRe.exec(xml);  if (pm) return pm[1].trim();
  return null;
}
function extractAtomLink(xml) {
  const m = /<link[^>]+href=["']([^"']+)["']/i.exec(xml); return m ? m[1] : null;
}
function extractThumb(chunk) {
  const m1 = /<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i.exec(chunk); if (m1) return m1[1];
  const m2 = /<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image/i.exec(chunk); if (m2) return m2[1];
  return null;
}
function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&apos;/g,"'")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g,'').trim();
}
function parseRSS(xml, source, specific) {
  const items = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRe.exec(xml)) !== null) {
    const chunk = match[1];
    const title = cleanText(extractTag(chunk, 'title'));
    const rawLink = extractTag(chunk, 'link') || extractAtomLink(chunk);
    const link = rawLink ? cleanText(rawLink).trim() : null;
    const pubDate = extractTag(chunk, 'pubDate') || extractTag(chunk, 'dc:date');
    const time = pubDate ? Math.floor(new Date(pubDate).getTime() / 1000) : Math.floor(Date.now() / 1000);
    if (!title || !link) continue;
    items.push({ title, link, publisher: source, time, thumbnail: extractThumb(chunk), _specific: specific });
  }
  return items;
}

// Tenta URL in sequenza, restituisce il primo che funziona
async function fetchRSS(urls, name, specific = false) {
  const urlList = Array.isArray(urls) ? urls : [urls];
  for (const url of urlList) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
          'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(RSS_TIMEOUT),
      });
      if (!r.ok) continue;
      const xml = await r.text();
      const items = parseRSS(xml, name, specific);
      if (items.length > 0) return { items, url, ok: true };
    } catch { /* prova URL successivo */ }
  }
  return { items: [], url: urlList[0], ok: false };
}

// ─── Finnhub ──────────────────────────────────────────────────
async function fetchFinnhubGeneral(category, token) {
  if (!token) return { items: [], ok: false };
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/news?category=${encodeURIComponent(category)}&token=${token}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) return { items: [], ok: false };
    const data = await r.json();
    const items = (Array.isArray(data) ? data : []).slice(0, 15).map(n => ({
      title: n.headline, link: n.url, publisher: n.source, time: n.datetime,
      thumbnail: n.image || null, _specific: false,
    }));
    return { items, ok: true };
  } catch { return { items: [], ok: false }; }
}

async function fetchFinnhubCompany(symbol, token) {
  if (!token) return [];
  try {
    const to   = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const r = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${token}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) return [];
    const data = await r.json();
    return (Array.isArray(data) ? data : []).slice(0, 8).map(n => ({
      title: n.headline, link: n.url, publisher: n.source, time: n.datetime,
      thumbnail: n.image || null, _specific: true,
    }));
  } catch { return []; }
}

// ─── Yahoo (più query per aumentare il volume) ────────────────
async function fetchYahooSearch(query, count = 15, specific = false) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${count}&quotesCount=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) return { items: [], ok: false };
    const data = await r.json();
    const items = (data?.news || []).map(n => ({
      title: n.title, link: n.link, publisher: n.publisher || 'Yahoo Finance',
      time: n.providerPublishTime, thumbnail: n.thumbnail?.resolutions?.[0]?.url || null,
      _specific: specific,
    }));
    return { items, ok: items.length > 0 };
  } catch { return { items: [], ok: false }; }
}

// Query generiche con filtro keyword applicato
async function fetchYahooMulti(queries, countEach = 10) {
  const results = await Promise.all(queries.map(q => fetchYahooSearch(q, countEach, false)));
  return {
    items: results.flatMap(r => r.items),
    ok: results.some(r => r.ok),
    perQuery: results.map((r, i) => ({ query: queries[i], count: r.items.length })),
  };
}

// Cerca news per ticker specifici → risultati già pertinenti, bypass filtro keyword
async function fetchYahooByTickers(tickers, countEach = 4) {
  const results = await Promise.all(tickers.map(t => fetchYahooSearch(t, countEach, true)));
  return {
    items: results.flatMap(r => r.items),
    ok: results.some(r => r.ok),
  };
}

// ─── Keyword filter ───────────────────────────────────────────
function filterByKeywords(articles, keywords) {
  if (!keywords) return articles;
  return articles.filter(a => {
    if (a._specific) return true;
    const text = (a.title + ' ' + (a.publisher || '')).toLowerCase();
    return keywords.some(kw => text.includes(kw));
  });
}

// ─── Deduplication ────────────────────────────────────────────
function deduplicate(articles) {
  const seen = new Set();
  return articles.filter(a => {
    if (!a?.title || !a?.link) return false;
    const key = a.title.slice(0, 70).toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// ─── Category config ──────────────────────────────────────────
const CATEGORIES = {
  mercati: {
    rss: [
      // Con thumbnail — fonti primarie
      { urls: ['https://feeds.marketwatch.com/marketwatch/topstories/'], name: 'MarketWatch', specific: false },
      { urls: ['https://www.thestreet.com/.rss/full/'], name: 'TheStreet', specific: false },
      // Senza thumbnail ma abbondanti
      { urls: ['https://www.cnbc.com/id/100003114/device/rss/rss.html'], name: 'CNBC', specific: false },
      { urls: ['https://feeds.a.dj.com/rss/RSSMarketsMain.xml'], name: 'WSJ Markets', specific: false },
    ],
    finnhub: 'general',
    yahooQueries: ['stock market finance today', 'global markets stocks bonds', 'wall street nasdaq dow jones'],
    keywords: null,
  },
  italia: {
    rss: [
      // Con thumbnail — fonti italiane primarie
      { urls: ['https://www.ilsole24ore.com/rss/homepage.xml'], name: 'Il Sole 24 Ore', specific: true },
      { urls: ['https://www.corriere.it/rss/economia.xml'], name: 'Corriere Economia', specific: false },
      { urls: ['https://www.cnbc.com/id/100003114/device/rss/rss.html'], name: 'CNBC', specific: false },
    ],
    finnhub: null,
    yahooTickers: [
      'ENI.MI','ENEL.MI','UCG.MI','ISP.MI','RACE','STLAM.MI',
      'MB.MI','G.MI','LDO.MI','PRY.MI','MONC.MI','CPR.MI',
      'FBK.MI','NEXI.MI','INW.MI','BAMI.MI','AZM.MI',
    ],
    yahooQueries: ['FTSE MIB Italy', 'Italy economy GDP'],
    keywords: [
      'ftse mib','italian stock','milan stock','italy stock',
      'italy','italian',
      'eni','enel','ferrari','stellantis','unicredit','intesa sanpaolo',
      'mediobanca','generali','leonardo','saipem','prysmian','tenaris','moncler',
      'campari','fineco','nexi','inwit','iveco','telecom italia','tim spa',
      'banco bpm','banca mps','monte dei paschi','azimut','poste italiane',
      'bank of italy','consob',
    ],
  },
  usa: {
    rss: [
      // Con thumbnail
      { urls: ['https://feeds.marketwatch.com/marketwatch/topstories/'], name: 'MarketWatch', specific: false },
      { urls: ['https://www.thestreet.com/.rss/full/'], name: 'TheStreet', specific: false },
      { urls: ['https://www.cnbc.com/id/100003114/device/rss/rss.html'], name: 'CNBC', specific: false },
      { urls: ['https://feeds.a.dj.com/rss/RSSMarketsMain.xml'], name: 'WSJ Markets', specific: false },
    ],
    finnhub: 'general',
    yahooTickers: ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','JPM','BRK-B','V'],
    yahooQueries: ['S&P 500 stock market', 'nasdaq dow jones wall street', 'US economy federal reserve'],
    keywords: [
      's&p 500','s&p500','sp500','nasdaq','nasdaq 100','dow jones','djia','russell 2000',
      'nyse','wall street','fed','federal reserve','us economy','american economy',
      'apple','microsoft','nvidia','alphabet','google','amazon','meta','tesla',
      'berkshire','jpmorgan','visa','mastercard','exxon','chevron','unitedhealth',
      'earnings','quarterly earnings','stock rally','us stocks',
    ],
  },
  commodities: {
    rss: [
      { urls: ['https://www.cnbc.com/id/100727362/device/rss/rss.html'], name: 'CNBC Commodities', specific: true },
      { urls: ['https://www.thestreet.com/.rss/full/'], name: 'TheStreet', specific: false },
      { urls: ['https://feeds.a.dj.com/rss/RSSMarketsMain.xml'], name: 'WSJ Markets', specific: false },
    ],
    finnhub: 'general',
    yahooTickers: ['GC=F','CL=F','SI=F','NG=F','HG=F','ZW=F','ZC=F'],
    yahooQueries: ['gold oil commodities prices', 'crude oil brent opec', 'copper natural gas energy'],
    keywords: [
      'gold','silver','copper','platinum','palladium','zinc','nickel','aluminium','aluminum',
      'oil','crude','brent','wti','natural gas','lng','opec','petroleum',
      'wheat','corn','soybean','grain','coffee','cocoa','sugar','cotton',
      'commodity','commodities','raw material','futures',
    ],
  },
  forex: {
    rss: [
      { urls: ['https://www.cnbc.com/id/100003114/device/rss/rss.html'], name: 'CNBC', specific: false },
      { urls: ['https://www.ft.com/markets?format=rss'], name: 'Financial Times', specific: false },
      { urls: ['https://feeds.a.dj.com/rss/RSSMarketsMain.xml'], name: 'WSJ Markets', specific: false },
    ],
    finnhub: 'forex',
    yahooQueries: ['forex euro dollar exchange rate', 'currency pound yen franc', 'foreign exchange bce ecb'],
    keywords: [
      'eur/usd','gbp/usd','usd/jpy','usd/chf','aud/usd','usd/cad','eur/gbp','eur/jpy',
      'dollar','euro','pound','yen','franc','yuan','renminbi','dollaro','valuta','cambio',
      'forex','fx','currency','exchange rate','foreign exchange',
      'bce','ecb','bank of england','boe','bank of japan','boj',
      'usd','eur','gbp','chf','cad','aud','nzd','jpy',
    ],
  },
  crypto: {
    rss: [
      { urls: ['https://www.coindesk.com/arc/outboundfeeds/rss/'], name: 'CoinDesk', specific: true },
      { urls: ['https://cointelegraph.com/rss'], name: 'CoinTelegraph', specific: true },
    ],
    finnhub: 'crypto',
    yahooQueries: ['bitcoin ethereum crypto', 'blockchain defi altcoin', 'binance coinbase crypto market'],
    keywords: [
      'crypto index','fear and greed','crypto market cap',
      'bitcoin','btc','ethereum','eth','solana','sol','ripple','xrp','cardano','ada',
      'avalanche','avax','polygon','matic','chainlink','link','polkadot','dot',
      'binance','bnb','tron','litecoin','ltc','uniswap',
      'usdt','usdc','tether','stablecoin',
      'crypto','cryptocurrency','blockchain','defi','nft','web3','mining','token','altcoin',
    ],
  },
  macro: {
    rss: [
      { urls: ['https://www.cnbc.com/id/100003114/device/rss/rss.html'], name: 'CNBC', specific: false },
      { urls: ['https://feeds.a.dj.com/rss/RSSMarketsMain.xml'], name: 'WSJ Markets', specific: false },
      { urls: ['https://www.ft.com/world?format=rss'], name: 'Financial Times', specific: false },
    ],
    finnhub: 'general',
    yahooQueries: ['inflation interest rate central bank', 'fed ecb monetary policy rates', 'gdp recession economy growth'],
    keywords: [
      'fed','federal reserve','bce','ecb','bank of england','boj','bank of japan','banca centrale',
      'inflation','inflazione','interest rate','tassi','gdp','pil','cpi','pce',
      'unemployment','disoccupazione','jobs report','nonfarm','payroll','pmi','ism',
      'recession','recessione','stagflation','debt','debito','deficit',
      'fiscal','bilancio','budget','treasury','spread btp','btp','bund',
      'quantitative easing','qe','quantitative tightening','tapering',
      'rate hike','rate cut','monetary policy','forward guidance',
      'vix','volatility index','dxy','dollar index',
    ],
  },
};

// ─── Handler ──────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  const { category = 'mercati', symbol, q, debug } = req.query;
  const finnhubKey = process.env.FINNHUB_KEY || '';
  const isDebug = debug === '1';

  let articles = [];
  const debugInfo = {};

  // ── Portfolio / ricerca libera ──
  if (q) {
    const sym = q.split(/[\s+,]/)[0].trim().toUpperCase();
    const [yahoo, fh] = await Promise.all([
      fetchYahooSearch(q, 20, false),
      sym ? fetchFinnhubCompany(sym, finnhubKey) : Promise.resolve([]),
    ]);
    articles = [...yahoo.items, ...fh];
  }
  // ── Titolo singolo ──
  else if (symbol) {
    const sym = symbol.replace(/\.[A-Z0-9]+$/, '');
    const [yahoo, fh] = await Promise.all([
      fetchYahooSearch(symbol, 10, true),
      fetchFinnhubCompany(sym, finnhubKey),
    ]);
    articles = [...yahoo.items, ...fh];
  }
  // ── Categoria ──
  else {
    const cfg = CATEGORIES[category] || CATEGORIES.mercati;

    const [rssResults, finnhubResult, yahooQueryResult, yahooTickerResult] = await Promise.all([
      Promise.all(cfg.rss.map(s => fetchRSS(s.urls, s.name, s.specific))),
      cfg.finnhub ? fetchFinnhubGeneral(cfg.finnhub, finnhubKey) : Promise.resolve({ items: [], ok: false }),
      fetchYahooMulti(cfg.yahooQueries, 10),
      cfg.yahooTickers ? fetchYahooByTickers(cfg.yahooTickers, 4) : Promise.resolve({ items: [], ok: false }),
    ]);

    if (isDebug) {
      debugInfo.rss = rssResults.map((r, i) => ({ name: cfg.rss[i].name, count: r.items.length, ok: r.ok, url: r.url }));
      debugInfo.finnhub = { count: finnhubResult.items.length, ok: finnhubResult.ok };
      debugInfo.yahooQueries = { count: yahooQueryResult.items.length, ok: yahooQueryResult.ok, perQuery: yahooQueryResult.perQuery };
      debugInfo.yahooTickers = { count: yahooTickerResult.items.length, ok: yahooTickerResult.ok };
    }

    // Tutto passa dal filtro keyword — le keyword includono i nomi delle aziende in inglese
    const allYahoo = [...yahooTickerResult.items, ...yahooQueryResult.items]
      .map(a => ({ ...a, _specific: false })); // forza filtro anche su ticker
    const raw = [
      ...rssResults.flatMap(r => r.items),
      ...finnhubResult.items,
      ...filterByKeywords(allYahoo, cfg.keywords),
    ];
    articles = raw;

    if (isDebug) {
      debugInfo.beforeFilter = raw.length;
      debugInfo.afterFilter = articles.length;
    }
  }

  const news = deduplicate(articles)
    .filter(a => a.title && a.link)
    .sort((a, b) => (b.time || 0) - (a.time || 0))
    .map(({ _specific, ...rest }) => rest)
    .slice(0, 40);

  return res.json(isDebug ? { news, debug: debugInfo } : { news });
}
