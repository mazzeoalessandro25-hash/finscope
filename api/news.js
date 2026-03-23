/**
 * /api/news.js
 * Aggregatore multi-fonte: RSS (CNBC, Il Sole 24 Ore, ANSA, CoinDesk…) + Finnhub
 *
 * Query params:
 *   ?category=mercati|italia|usa|commodities|forex|crypto|macro  (default: mercati)
 *   ?symbol=AAPL       → news specifiche per azienda (Yahoo + Finnhub company news)
 *   ?q=AAPL+MSFT       → ricerca libera per portfolio news (Yahoo search)
 */

const RSS_TIMEOUT = 5000;

// ─── RSS helpers ──────────────────────────────────────────────
function extractTag(xml, tag) {
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const plainRe  = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const cm = cdataRe.exec(xml);
  if (cm) return cm[1].trim();
  const pm = plainRe.exec(xml);
  if (pm) return pm[1].trim();
  return null;
}

function extractAtomLink(xml) {
  const m = /<link[^>]+href=["']([^"']+)["']/i.exec(xml);
  return m ? m[1] : null;
}

function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, '')
    .trim();
}

function extractThumb(chunk) {
  // <media:content url="..." />  or  <enclosure url="..." type="image/..."
  const m1 = /<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i.exec(chunk);
  if (m1) return m1[1];
  const m2 = /<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image/i.exec(chunk);
  if (m2) return m2[1];
  return null;
}

function parseRSS(xml, source) {
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
    const thumbnail = extractThumb(chunk);
    if (!title || !link) continue;
    items.push({ title, link, publisher: source, time, thumbnail });
  }
  return items;
}

async function fetchRSS(url, name) {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FinScope/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(RSS_TIMEOUT),
    });
    if (!r.ok) return [];
    const xml = await r.text();
    return parseRSS(xml, name);
  } catch {
    return [];
  }
}

// ─── Finnhub helpers ──────────────────────────────────────────
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
      title:     n.headline,
      link:      n.url,
      publisher: n.source,
      time:      n.datetime,
      thumbnail: n.image || null,
    }));
  } catch {
    return [];
  }
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
      title:     n.headline,
      link:      n.url,
      publisher: n.source,
      time:      n.datetime,
      thumbnail: n.image || null,
    }));
  } catch {
    return [];
  }
}

// ─── Yahoo helpers ────────────────────────────────────────────
async function fetchYahooSearch(query, count = 10) {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${count}&quotesCount=0`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return [];
    const data = await r.json();
    return (data?.news || []).map(n => ({
      title:     n.title,
      link:      n.link,
      publisher: n.publisher,
      time:      n.providerPublishTime,
      thumbnail: n.thumbnail?.resolutions?.[0]?.url || null,
    }));
  } catch {
    return [];
  }
}

// ─── Deduplication ────────────────────────────────────────────
function deduplicate(articles) {
  const seen = new Set();
  return articles.filter(a => {
    if (!a?.title || !a?.link) return false;
    const key = a.title.slice(0, 70).toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Category config ──────────────────────────────────────────
const CATEGORIES = {
  mercati: {
    rss: [
      { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', name: 'CNBC' },
      { url: 'https://www.ilsole24ore.com/rss/mercati.xml',           name: 'Il Sole 24 Ore' },
    ],
    finnhub: 'general',
    yahoo: 'mercati finanziari borsa',
  },
  italia: {
    rss: [
      { url: 'https://www.ilsole24ore.com/rss/mercati.xml',   name: 'Il Sole 24 Ore' },
      { url: 'https://www.ansa.it/sito/notizie/economia/rss.xml', name: 'ANSA' },
    ],
    finnhub: null,
    yahoo: 'borsa italiana ftse mib',
  },
  usa: {
    rss: [
      { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', name: 'CNBC' },
    ],
    finnhub: 'general',
    yahoo: 'S&P 500 nasdaq wall street',
  },
  commodities: {
    rss: [
      { url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html', name: 'CNBC Commodities' },
    ],
    finnhub: 'general',
    yahoo: 'gold oil commodities',
  },
  forex: {
    rss: [
      { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', name: 'CNBC' },
    ],
    finnhub: 'forex',
    yahoo: 'euro dollaro forex',
  },
  crypto: {
    rss: [
      { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', name: 'CoinDesk' },
      { url: 'https://cointelegraph.com/rss',                   name: 'CoinTelegraph' },
    ],
    finnhub: 'crypto',
    yahoo: 'bitcoin ethereum crypto',
  },
  macro: {
    rss: [
      { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',    name: 'CNBC' },
      { url: 'https://www.ilsole24ore.com/rss/economia.xml',             name: 'Il Sole 24 Ore' },
    ],
    finnhub: 'general',
    yahoo: 'bce fed inflazione tassi macro',
  },
};

// ─── Handler ──────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  const { category = 'mercati', symbol, q } = req.query;
  const finnhubKey = process.env.FINNHUB_KEY || '';

  let articles = [];

  // ── Ricerca libera (portfolio news) ──
  if (q) {
    articles = await fetchYahooSearch(q, 20);
    if (finnhubKey && q) {
      // prova a prendere news per il primo ticker del query
      const firstTicker = q.split(/[\s+,]/)[0].trim().toUpperCase();
      if (firstTicker) {
        const fh = await fetchFinnhubCompany(firstTicker, finnhubKey);
        articles = [...articles, ...fh];
      }
    }
  }
  // ── News per singolo titolo ──
  else if (symbol) {
    const [yahoo, fh] = await Promise.all([
      fetchYahooSearch(symbol, 8),
      fetchFinnhubCompany(symbol, finnhubKey),
    ]);
    articles = [...yahoo, ...fh];
  }
  // ── News per categoria ──
  else {
    const cfg = CATEGORIES[category] || CATEGORIES.mercati;
    const rssFetches = cfg.rss.map(s => fetchRSS(s.url, s.name));
    const finnhubFetch = cfg.finnhub ? fetchFinnhubGeneral(cfg.finnhub, finnhubKey) : Promise.resolve([]);
    const yahooFetch = fetchYahooSearch(cfg.yahoo, 8);

    const results = await Promise.all([...rssFetches, finnhubFetch, yahooFetch]);
    articles = results.flat();
  }

  const news = deduplicate(articles)
    .sort((a, b) => (b.time || 0) - (a.time || 0))
    .slice(0, 20);

  return res.json({ news });
}
