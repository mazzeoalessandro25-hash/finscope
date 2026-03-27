export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Cache 1 ora per risparmiare token API
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(503).json({ error: 'AI non configurata. Aggiungi ANTHROPIC_API_KEY nelle env vars di Vercel.' });

  // ── PORTFOLIO DAILY ANALYSIS ──
  if (req.body?.type === 'portfolio_daily') {
    const { assets, totalChgUSD, totalChgPct, totalValUSD, date } = req.body;
    if (!assets?.length) return res.status(400).json({ error: 'assets richiesti' });

    const sorted = [...assets].sort((a, b) => b.chgPct - a.chgPct);
    const assetLines = sorted.map(a =>
      `- ${a.sym} (${a.name}): ${a.chgPct >= 0 ? '+' : ''}${a.chgPct.toFixed(2)}% (${a.chgUSD >= 0 ? '+' : ''}$${a.chgUSD.toFixed(0)})`
    ).join('\n');

    const portLine = `${totalChgPct >= 0 ? '+' : ''}${totalChgPct.toFixed(2)}% (${totalChgUSD >= 0 ? '+' : ''}$${totalChgUSD.toFixed(0)}) su valore totale $${totalValUSD?.toFixed(0) || '?'}`;

    const prompt = `Sei un analista finanziario personale. Oggi il portafoglio ha avuto questa performance giornaliera:

PORTAFOGLIO COMPLESSIVO: ${portLine}
DATA: ${date || new Date().toLocaleDateString('it-IT')}

PERFORMANCE PER TITOLO (dal migliore al peggiore):
${assetLines}

Scrivi un'analisi giornaliera in italiano, massimo 180 parole. Struttura la risposta così:

**Andamento complessivo** — 1-2 frasi sul portafoglio nel suo insieme oggi (positivo/negativo/misto, entità della variazione)
**Titoli in evidenza** — commenta i 2-3 titoli più rilevanti (miglior e peggior performer), spiegando cosa significano queste variazioni per il portafoglio
**Sintesi** — 1 frase conclusiva sull'andamento generale della giornata

Usa solo i dati numerici forniti. Non inventare notizie o cause esterne. Tono professionale e diretto.`;

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
      });
      if (!r.ok) { const err = await r.json(); return res.status(500).json({ error: err.error?.message || r.status }); }
      const data = await r.json();
      return res.json({ analysis: data.content?.[0]?.text || '', date });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  const { ticker, qd, sd } = req.body;
  if (!ticker) return res.status(400).json({ error: 'Ticker richiesto' });

  // Costruisce contesto compatto con tutti i dati disponibili
  const lines = [
    `Ticker: ${ticker}`,
    qd?.price     ? `Prezzo attuale: ${qd.price} ${qd.currency || 'USD'}` : null,
    qd?.prev      ? `Chiusura precedente: ${qd.prev}` : null,
    sd?.sector    ? `Settore: ${sd.sector}` : null,
    sd?.marketCap ? `Market Cap: ${(sd.marketCap / 1e9).toFixed(1)}B` : null,
    sd?.pe        ? `P/E trailing: ${sd.pe?.toFixed(1)}` : null,
    sd?.forwardPE ? `P/E forward: ${sd.forwardPE?.toFixed(1)}` : null,
    sd?.pb        ? `P/B: ${sd.pb?.toFixed(1)}` : null,
    sd?.ps        ? `P/S: ${sd.ps?.toFixed(1)}` : null,
    sd?.eps       ? `EPS: ${sd.eps?.toFixed(2)}` : null,
    sd?.roe       ? `ROE: ${(sd.roe * 100).toFixed(1)}%` : null,
    sd?.roa       ? `ROA: ${(sd.roa * 100).toFixed(1)}%` : null,
    sd?.grossMargins     ? `Margine lordo: ${(sd.grossMargins * 100).toFixed(1)}%` : null,
    sd?.operatingMargins ? `Margine operativo: ${(sd.operatingMargins * 100).toFixed(1)}%` : null,
    sd?.profitMargins    ? `Margine netto: ${(sd.profitMargins * 100).toFixed(1)}%` : null,
    sd?.revenueGrowth    ? `Crescita ricavi (YoY): ${(sd.revenueGrowth * 100).toFixed(1)}%` : null,
    sd?.earningsGrowth   ? `Crescita utili (YoY): ${(sd.earningsGrowth * 100).toFixed(1)}%` : null,
    sd?.debtToEquity     ? `Debt/Equity: ${sd.debtToEquity?.toFixed(1)}` : null,
    sd?.currentRatio     ? `Current Ratio: ${sd.currentRatio?.toFixed(2)}` : null,
    sd?.dividend         ? `Rendimento dividendo: ${(sd.dividend * 100).toFixed(2)}%` : null,
    sd?.beta             ? `Beta: ${sd.beta?.toFixed(2)}` : null,
    sd?.week52High && sd?.week52Low && qd?.price
      ? `Posizione 52W: ${qd.price} (Min: ${sd.week52Low}, Max: ${sd.week52High})`
      : null,
    sd?.targetPrice ? `Target medio analisti: ${sd.targetPrice}` : null,
    sd?.rec         ? `Consensus: ${sd.rec}` : null,
  ].filter(Boolean).join('\n');

  const prompt = `Sei un analista finanziario esperto. Analizza il seguente titolo in modo preciso e professionale. Rispondi SOLO in italiano. Sii diretto e concreto, massimo 250 parole totali.

DATI FONDAMENTALI:
${lines}

Struttura la risposta esattamente così (usa i titoli in grassetto):

**Sintesi** — 1-2 frasi di valutazione complessiva basata sui dati
**Punti di forza** — 2-3 elementi positivi concreti dai dati
**Rischi** — 2-3 rischi o debolezze concrete dai dati
**Outlook** — valutazione breve termine e posizione nel ciclo
**Verdetto** — BUY / HOLD / SELL con motivazione in 1 frase

Basa ogni affermazione SOLO sui dati forniti. Non inventare informazioni.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const err = await r.json();
      return res.status(500).json({ error: 'Errore API AI: ' + (err.error?.message || r.status) });
    }

    const data = await r.json();
    const text = data.content?.[0]?.text || '';
    return res.json({ analysis: text, ticker });

  } catch (e) {
    return res.status(500).json({ error: 'Errore server: ' + e.message });
  }
}
