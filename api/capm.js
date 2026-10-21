/**
 * api/capm.js — Endpoint CAPM: beta, alpha di Jensen, Sharpe, Treynor, R², scomposizione varianza
 *
 * POST /api/capm
 * Body JSON: {
 *   portfolio:     [{ sym: string, qty: number, buyPrice: number, currency: 'EUR'|'USD' }],
 *   bench:         'ACWI' | 'SPY' | '^FTSEMIB',    // benchmark per la regressione (default ACWI)
 *   activeBenches: string[],                          // benchmark del grafico perf (per tabella comparativa)
 *   period:        '2y' | '3y',                       // finestra storica (default '2y')
 * }
 *
 * Scelte metodologiche (visibili in UI):
 *  - Rendimenti settimanali, finestra 2 anni (~104 obs). Min 52 obs → 'dati insufficienti'
 *  - Prezzi adjusted close (total return approssimato, dividendi inclusi)
 *    Eccezione: indici price-only come ^FTSEMIB (segnalato in warnings)
 *  - Valuta base: USD. I titoli EUR vengono convertiti con EURUSD settimanale (EURUSD=X)
 *  - Risk-free: ^IRX (US T-bill 13W, annualizzato) con fallback hardcodato
 *  - Annualizzazione: media × 52, volatilità × √52
 *  - Allineamento date: weekKey (lunedì ISO); settimane perse < 10% → warning, > 30% → error
 */

import { weekKey, toReturns, alignSeries, capmMetrics, mean } from './_lib/capm.js';

const DEFAULT_PERIOD  = '2y';
const FETCH_TIMEOUT   = 12000;  // ms per singola richiesta Yahoo
const MAX_MISSING_PCT = 0.30;   // tolleranza massima settimane mancanti

// ─── Fetch Yahoo Finance v8 chart ────────────────────────────────────────────

/**
 * Scarica dati storici settimanali adjusted da Yahoo Finance.
 * Ritorna array di { wk: string, price: number } ordinato per data, o null in caso di errore.
 *
 * @param {string} symbol   ticker Yahoo (es. 'ACWI', 'EURUSD=X', '^IRX')
 * @param {string} [period] range Yahoo ('2y', '3y', ecc.)
 */
async function fetchWeekly(symbol, period = DEFAULT_PERIOD) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?interval=1wk&range=${period}&includeAdjustedClose=true`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp || [];
    // Usa adjclose se disponibile (ETF/azioni); per indici (^FTSEMIB) adjclose = close
    const prices =
      result.indicators?.adjclose?.[0]?.adjclose ||
      result.indicators?.quote?.[0]?.close || [];

    // Dedup per weekKey: in caso di dati duplicati nella stessa settimana, tieni l'ultimo
    const map = new Map();
    for (let i = 0; i < timestamps.length; i++) {
      if (prices[i] != null && prices[i] > 0) {
        map.set(weekKey(timestamps[i]), prices[i]);
      }
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([wk, price]) => ({ wk, price }));
  } catch (_) {
    return null;
  }
}

// ─── Handler principale ───────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'method_not_allowed' });

  // Vercel parsifica automaticamente JSON se Content-Type: application/json
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'invalid_json' }); }
  }

  const {
    portfolio     = [],
    bench         = 'ACWI',
    activeBenches = [],
    period        = DEFAULT_PERIOD,
  } = body || {};

  if (!Array.isArray(portfolio) || !portfolio.length) {
    return res.status(400).json({ error: 'portfolio_empty' });
  }

  const warnings = [];

  // ── 1. Costruisci lista simboli da scaricare ──────────────────────────────
  const portSyms   = portfolio.map(p => p.sym);
  // Filtra duplicati tra portafoglio e activeBenches
  const benchSyms  = [...new Set(activeBenches.filter(s => !portSyms.includes(s)))];
  const allSyms    = [...new Set([...portSyms, bench, ...benchSyms])];

  // ── 2. Scarica tutto in parallelo ─────────────────────────────────────────
  const fetchPromises = [
    ...allSyms.map(s => fetchWeekly(s, period)),
    fetchWeekly('EURUSD=X', period),   // tasso di cambio settimanale
    fetchWeekly('^IRX', period),        // US T-bill 13W (per risk-free)
  ];

  const settled = await Promise.allSettled(fetchPromises);

  const priceMap = {};
  allSyms.forEach((s, i) => {
    priceMap[s] = settled[i]?.value ?? null;
  });
  const fxData  = settled[allSyms.length]?.value  ?? null;
  const irxData = settled[allSyms.length + 1]?.value ?? null;

  // ── 3. Risk-free rate ─────────────────────────────────────────────────────
  // ^IRX su Yahoo è quotato come rendimento % annualizzato (es. 4.25 = 4.25%)
  // Prendiamo l'ultimo valore disponibile della serie
  let rfAnnual = 0.0425;   // fallback Fed: 4.25%
  let rfSource = 'Fed Funds (hardcoded fallback): 4.25%';

  if (irxData?.length) {
    const lastIRX = irxData[irxData.length - 1].price;
    if (lastIRX > 0 && lastIRX < 20) {
      rfAnnual = lastIRX / 100;
      rfSource  = `US T-bill 13W (^IRX): ${lastIRX.toFixed(2)}%`;
    }
  }

  // ── 4. Mappa FX settimanale (EURUSD) ─────────────────────────────────────
  const fxByWk = new Map();
  if (fxData?.length) fxData.forEach(d => fxByWk.set(d.wk, d.price));
  // Fallback se FX non disponibile: valore recente statico
  const fxFallback = 1.08;
  const getFX = wk => fxByWk.get(wk) ?? fxFallback;

  // ── 5. Benchmark principale ───────────────────────────────────────────────
  const benchData = priceMap[bench];
  if (!benchData?.length) {
    return res.status(502).json({ error: 'benchmark_unavailable', bench });
  }
  const benchRets = toReturns(benchData);
  if (!benchRets.length) {
    return res.status(502).json({ error: 'benchmark_no_returns', bench });
  }
  const benchRetMap = new Map(benchRets.map(r => [r.wk, r.ret]));

  // Segnala se il benchmark è un indice price-only (non ha adjclose separato da close)
  const benchIsIndex = bench.startsWith('^');
  if (benchIsIndex) {
    warnings.push({
      it: `Il benchmark ${bench} è un indice price return (i dividendi non sono inclusi nel rendimento).`,
      en: `Benchmark ${bench} is a price-return index (dividends not included in the return).`,
    });
  }

  // ── 6. Costruisci rendimenti settimanali portafoglio ──────────────────────
  // Per ogni titolo: converti il prezzo in USD con il tasso FX della settimana,
  // poi calcola il rendimento settimanale.
  // Questo include correttamente l'effetto cambio per i titoli EUR.

  const portPriceSeriesUSD = portfolio.map(item => {
    const raw = priceMap[item.sym];
    if (!raw?.length) return null;
    const isEUR = (item.currency || 'USD').toUpperCase() === 'EUR';
    return raw.map(({ wk, price }) => ({
      wk,
      price: isEUR ? price * getFX(wk) : price,
    }));
  });

  const portRetsByTicker = portPriceSeriesUSD.map(series =>
    series ? toReturns(series) : null
  );

  // Pesi iniziali: basati sul valore investito (qty × prezzo di carico) in USD
  // Stesso approccio di loadRiskMetrics() per coerenza con il resto del sito
  const initWeights = portfolio.map((item, pi) => {
    const isEUR = (item.currency || 'USD').toUpperCase() === 'EUR';
    // Primo FX disponibile come proxy del cambio all'acquisto
    const fx0 = fxData?.[0]?.price ?? fxFallback;
    return item.qty * item.buyPrice * (isEUR ? fx0 : 1);
  });
  const totalInit = initWeights.reduce((s, v) => s + v, 0) || 1;
  const wts = initWeights.map(w => w / totalInit);

  // Per ogni settimana del benchmark: calcola rendimento ponderato del portafoglio
  // Requisito: tutti i titoli devono avere un dato per quella settimana
  const portRetSeries = [];
  for (const benchWk of benchRetMap.keys()) {
    let wr = 0, coveredWt = 0, allOk = true;
    for (let pi = 0; pi < portfolio.length; pi++) {
      const tickerRets = portRetsByTicker[pi];
      if (!tickerRets) { allOk = false; break; }
      const r = tickerRets.find(x => x.wk === benchWk);
      if (r != null) {
        wr         += r.ret * wts[pi];
        coveredWt  += wts[pi];
      } else {
        allOk = false;
      }
    }
    // Includi la settimana solo se copriamo ≥ 95% del peso del portafoglio
    if (coveredWt >= 0.95) {
      portRetSeries.push({ wk: benchWk, ret: wr / coveredWt });
    }
  }

  // Allinea portafoglio e benchmark (intersezione date)
  const aligned = alignSeries(portRetSeries, benchRets);

  // Verifica settimane perse
  const totalBenchWks = benchRets.length;
  const missingPct    = totalBenchWks > 0 ? 1 - aligned.length / totalBenchWks : 1;
  if (missingPct > 0.10) {
    warnings.push({
      it: `${Math.round(missingPct * 100)}% delle settimane mancanti per disallineamento calendari di borsa. I dati potrebbero essere meno rappresentativi.`,
      en: `${Math.round(missingPct * 100)}% of weeks missing due to market calendar misalignment. Data may be less representative.`,
    });
  }
  if (missingPct > MAX_MISSING_PCT) {
    return res.json({ error: 'too_many_missing_weeks', missingPct: Math.round(missingPct * 100) });
  }

  const portRets = aligned.map(r => r.a);
  const mktRets  = aligned.map(r => r.b);

  // ── 7. Metriche CAPM portafoglio ──────────────────────────────────────────
  const portMetrics = capmMetrics(portRets, mktRets, rfAnnual);

  // ── 8. Metriche CAPM per ogni benchmark attivo (Buffett, Cathie Wood…) ────
  const benchMetrics = {};
  for (const bSym of activeBenches) {
    const bd = priceMap[bSym];
    if (!bd?.length) { benchMetrics[bSym] = { error: 'no_data' }; continue; }
    const bRets = toReturns(bd);
    const bAligned = alignSeries(bRets, benchRets);
    if (!bAligned.length) { benchMetrics[bSym] = { error: 'no_aligned_data' }; continue; }
    benchMetrics[bSym] = capmMetrics(bAligned.map(r => r.a), bAligned.map(r => r.b), rfAnnual);
  }

  // ── 9. Metadati ───────────────────────────────────────────────────────────
  const startWk = aligned[0]?.wk  ?? '';
  const endWk   = aligned[aligned.length - 1]?.wk ?? '';

  // Quote EUR del portafoglio (per informazione in UI)
  const eurWeightPct = Math.round(
    portfolio.reduce((s, item, pi) =>
      s + ((item.currency || 'USD').toUpperCase() === 'EUR' ? wts[pi] : 0), 0
    ) * 100
  );
  if (eurWeightPct > 10 && eurWeightPct < 90) {
    warnings.push({
      it: `Portafoglio misto: ${eurWeightPct}% EUR, ${100 - eurWeightPct}% USD. I titoli EUR sono convertiti in USD con il tasso EURUSD settimanale (EURUSD=X).`,
      en: `Mixed portfolio: ${eurWeightPct}% EUR, ${100 - eurWeightPct}% USD. EUR holdings converted to USD using weekly EURUSD=X rate.`,
    });
  }

  return res.json({
    portfolio:  portMetrics,
    benchmarks: benchMetrics,
    meta: {
      bench,
      period,
      startWk,
      endWk,
      n:           aligned.length,
      rfAnnual,
      rfSource,
      frequency:   'weekly',
      eurWeightPct,
      adjCloseNote: {
        it: benchIsIndex
          ? `Prezzi close (price return, dividendi esclusi). I benchmark ETF usano prezzi adjusted close.`
          : `Prezzi adjusted close — total return approssimato (dividendi e split inclusi).`,
        en: benchIsIndex
          ? `Close prices (price return, dividends excluded). ETF benchmarks use adjusted close.`
          : `Adjusted close prices — approximate total return (dividends and splits included).`,
      },
      warnings,
    },
  });
}
