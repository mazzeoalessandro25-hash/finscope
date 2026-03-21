// Cache crumb/cookie a livello di modulo — riusato tra warm invocations Vercel
let _crumb = null;
let _cookie = null;
let _crumbExpiry = 0;

export const YH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

function parseCookies(res) {
  try {
    if (typeof res.headers.getSetCookie === 'function') {
      return res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    }
  } catch (_) {}
  const raw = res.headers.get('set-cookie') || '';
  return raw.split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

export async function getYahooCrumb() {
  const now = Date.now();
  if (_crumb && _cookie && now < _crumbExpiry) return { crumb: _crumb, cookie: _cookie };

  try {
    const r1 = await fetch('https://finance.yahoo.com/', {
      headers: YH_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    _cookie = parseCookies(r1);

    const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { ...YH_HEADERS, Cookie: _cookie },
      signal: AbortSignal.timeout(5000),
    });
    if (!r2.ok) return null;

    const crumb = await r2.text();
    if (!crumb || crumb.includes('<')) return null;
    _crumb = crumb;
    _crumbExpiry = now + 3600000; // 1 ora
    return { crumb: _crumb, cookie: _cookie };
  } catch (_) {
    return null;
  }
}

export async function fetchQuoteSummary(symbol) {
  let auth = await getYahooCrumb();
  if (!auth) return null;

  const tryFetch = async ({ crumb, cookie }) => {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics,summaryDetail,financialData,assetProfile&crumb=${encodeURIComponent(crumb)}`;
    const r = await fetch(url, {
      headers: { ...YH_HEADERS, Cookie: cookie },
      signal: AbortSignal.timeout(8000),
    });
    return r;
  };

  try {
    let r = await tryFetch(auth);
    if (!r.ok) {
      // Crumb scaduto — rinnova e riprova
      _crumb = null; _cookie = null; _crumbExpiry = 0;
      auth = await getYahooCrumb();
      if (!auth) return null;
      r = await tryFetch(auth);
      if (!r.ok) return null;
    }
    const data = await r.json();
    return data?.quoteSummary?.result?.[0] ?? null;
  } catch (_) {
    return null;
  }
}
