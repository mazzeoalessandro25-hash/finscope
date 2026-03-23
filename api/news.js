/**
 * /api/news.js
 * Aggregatore multi-fonte: RSS + Finnhub + Yahoo Finance
 * con filtraggio per parole chiave per categoria.
 *
 * ?category=mercati|italia|usa|commodities|forex|crypto|macro
 * ?symbol=AAPL   → news azienda specifica
 * ?q=AAPL+MSFT   → ricerca libera (portfolio)
 */

const RSS_TIMEOUT = 5000;

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
async function fetchRSS(url, name, specific = false) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinScope/1.0)', 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' },
      signal: AbortSignal.timeout(RSS_TIMEOUT),
    });
    if (!r.ok) return [];
    return parseRSS(await r.text(), name, specific);
  } catch { return []; }
}

// ─── Finnhub ──────────────────────────────────────────────────
async function fetchFinnhubGeneral(category, token) {
  if (!token) return [];
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/news?category=${encodeURIComponent(category)}&token=${token}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) return [];
    const data = await r.json();
    return (Array.isArray(data) ? data : []).slice(0, 12).map(n => ({
      title: n.headline, link: n.url, publisher: n.source, time: n.datetime, thumbnail: n.image || null, _specific: false,
    }));
  } catch { return []; }
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
      title: n.headline, link: n.url, publisher: n.source, time: n.datetime, thumbnail: n.image || null, _specific: true,
    }));
  } catch { return []; }
}

// ─── Yahoo ────────────────────────────────────────────────────
async function fetchYahooSearch(query, count = 10, specific = false) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${count}&quotesCount=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) return [];
    const data = await r.json();
    return (data?.news || []).map(n => ({
      title: n.title, link: n.link, publisher: n.publisher, time: n.providerPublishTime,
      thumbnail: n.thumbnail?.resolutions?.[0]?.url || null, _specific: specific,
    }));
  } catch { return []; }
}

// ─── Keyword filter ───────────────────────────────────────────
function filterByKeywords(articles, keywords) {
  if (!keywords) return articles;
  return articles.filter(a => {
    if (a._specific) return true; // fonti specifiche passano sempre
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
// specific:true → fonte già tematica, gli articoli passano senza filtro keyword
// keywords → parole chiave per filtrare le fonti generiche (CNBC, Finnhub general, Yahoo)
const CATEGORIES = {
  mercati: {
    rss: [
      { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', name: 'CNBC',           specific: false },
      { url: 'https://www.ilsole24ore.com/rss/mercati.xml',           name: 'Il Sole 24 Ore', specific: true  },
    ],
    finnhub: 'general',
    yahoo: 'stock market finance borsa',
    keywords: null, // nessun filtro: tab mercati è catch-all
  },
  italia: {
    rss: [
      { url: 'https://www.ilsole24ore.com/rss/mercati.xml',       name: 'Il Sole 24 Ore', specific: true },
      { url: 'https://www.ansa.it/sito/notizie/economia/rss.xml', name: 'ANSA',           specific: true },
    ],
    finnhub: null,
    yahoo: 'borsa italiana ftse mib piazza affari',
    keywords: [
      'italia','italian','ftse mib','mib','piazza affari','unicredit','intesa',
      'eni','enel','ferrari','stellantis','mediobanca','generali','banca d\'italia',
      'cdp','poste','tim','leonardo','telecom','fca',
    ],
  },
  usa: {
    rss: [
      { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', name: 'CNBC', specific: false },
    ],
    finnhub: 'general',
    yahoo: 'S&P 500 nasdaq dow jones wall street',
    keywords: [
      's&p','sp500','nasdaq','dow jones','wall street','nyse','fed','federal reserve',
      'sec','treasury','us stock','american','apple','microsoft','nvidia','google',
      'amazon','meta','tesla','earnings','us economy',
    ],
  },
  commodities: {
    rss: [
      { url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html', name: 'CNBC Commodities', specific: true },
    ],
    finnhub: 'general',
    yahoo: 'gold oil crude commodities silver copper',
    keywords: [
      'gold','silver','oil','crude','brent','wti','copper','platinum','palladium',
      'natural gas','commodity','commodities','oro','petrolio','rame','materie prime',
      'wheat','corn','soybean','agricol',
    ],
  },
  forex: {
    rss: [
      { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', name: 'CNBC', specific: false },
    ],
    finnhub: 'forex',
    yahoo: 'forex euro dollar exchange rate currency',
    keywords: [
      'forex','currency','exchange rate','eur/usd','gbp/usd','usd/jpy','dollar','euro',
      'pound','yen','franc','yuan','dollaro','valuta','cambio','bce','ecb rate',
      'eurodollar','usd','eur','gbp','chf','cad','aud',
    ],
  },
  crypto: {
    rss: [
      { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', name: 'CoinDesk',     specific: true },
      { url: 'https://cointelegraph.com/rss',                   name: 'CoinTelegraph', specific: true },
    ],
    finnhub: 'crypto',
    yahoo: 'bitcoin ethereum crypto blockchain',
    keywords: [
      'bitcoin','ethereum','crypto','blockchain','btc','eth','defi','nft','altcoin',
      'binance','coinbase','solana','ripple','xrp','stablecoin','web3','mining','token',
      'dao','metaverse','polygon','cardano','avalanche',
    ],
  },
  macro: {
    rss: [
      { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', name: 'CNBC',           specific: false },
      { url: 'https://www.ilsole24ore.com/rss/economia.xml',          name: 'Il Sole 24 Ore', specific: true  },
    ],
    finnhub: 'general',
    yahoo: 'bce fed inflazione tassi interesse recessione macro',
    keywords: [
      'inflation','inflazione','bce','ecb','fed','federal reserve','interest rate','tassi',
      'gdp','pil','recession','recessione','cpi','jobs','unemployment','disoccupazione',
      'growth','crescita','debt','debito','deficit','fiscal','bilancio','banca centrale',
      'quantitative','qe','tightening','monetary policy',
    ],
  },
};

// ─── Handler ──────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  const { category = 'mercati', symbol, q } = req.query;
  const finnhubKey = process.env.FINNHUB_KEY || '';

  let articles = [];

  // ── Portfolio / ricerca libera ──
  if (q) {
    const [yahoo, fh] = await Promise.all([
      fetchYahooSearch(q, 20, false),
      (() => {
        const sym = q.split(/[\s+,]/)[0].trim().toUpperCase();
        return sym ? fetchFinnhubCompany(sym, finnhubKey) : Promise.resolve([]);
      })(),
    ]);
    articles = [...yahoo, ...fh];
  }
  // ── Titolo singolo ──
  else if (symbol) {
    const [yahoo, fh] = await Promise.all([
      fetchYahooSearch(symbol, 8, true),
      fetchFinnhubCompany(symbol, finnhubKey),
    ]);
    articles = [...yahoo, ...fh];
  }
  // ── Categoria ──
  else {
    const cfg = CATEGORIES[category] || CATEGORIES.mercati;
    const results = await Promise.all([
      ...cfg.rss.map(s => fetchRSS(s.url, s.name, s.specific)),
      cfg.finnhub ? fetchFinnhubGeneral(cfg.finnhub, finnhubKey) : Promise.resolve([]),
      fetchYahooSearch(cfg.yahoo, 8, false),
    ]);
    articles = filterByKeywords(results.flat(), cfg.keywords);
  }

  const news = deduplicate(articles)
    .filter(a => a.title && a.link)
    .sort((a, b) => (b.time || 0) - (a.time || 0))
    .map(({ _specific, ...rest }) => rest) // rimuovi campo interno
    .slice(0, 20);

  return res.json({ news });
}
