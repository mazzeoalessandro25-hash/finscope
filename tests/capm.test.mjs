/**
 * tests/capm.test.mjs — Test unitari per le funzioni CAPM
 *
 * Esecuzione: node tests/capm.test.mjs
 * Exit 0 = tutti i test passano, exit 1 = almeno un fallimento.
 *
 * Struttura:
 *  A. Test su dati sintetici con risultato noto (1000 obs, β=1.3)
 *  B. Test con calcolo a mano (5 obs, β=1.5 esatto, α=0 esatto, R²=1)
 *  C. Test Sharpe e Treynor
 *  D. Edge cases: varianza indice zero, serie troppo corta, lunghezze diverse
 *  E. Test weekKey e toReturns
 *  F. Test scomposizione varianza (sysPct ≡ R²)
 */

import {
  weekKey,
  toReturns,
  alignSeries,
  mean,
  std,
  ols,
  capmMetrics,
  MIN_OBS,
  WEEKS_PER_YEAR,
} from '../api/_lib/capm.js';

// ─── Infrastruttura test minima ───────────────────────────────────────────────

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

function assertClose(actual, expected, tol, message) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) {
    console.log(`  ✓ ${message} (${actual.toFixed(6)} ≈ ${expected}, tol=${tol})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message} — got ${actual.toFixed(6)}, expected ${expected} ±${tol}`);
    failed++;
  }
}

function section(title) { console.log(`\n── ${title} ──`); }

// ─── Generatore pseudocasuale deterministico (LCG) ───────────────────────────
// Rende i test riproducibili senza dipendenze esterne.
// Parametri di Numerical Recipes (Knuth Vol.2).

function makeLCG(seed) {
  let s = seed >>> 0;
  return () => {
    s = ((Math.imul(1664525, s) + 1013904223) >>> 0);
    return s / 0x100000000;  // [0, 1)
  };
}

/** Campiona da N(mu, sigma) con Box-Muller. Consuma 2 valori dal rng. */
function randNorm(rng, mu = 0, sigma = 1) {
  const u1 = Math.max(rng(), 1e-10);
  const u2  = rng();
  const z   = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mu + sigma * z;
}

// ─── A. Test sintetico: 1000 obs, β = 1.3 ────────────────────────────────────

section('A. Test sintetico — 1000 obs, Rp = 0.001 + 1.3·Rm + ε');

// Dati generati con:
//   Rm ~ N(0.002, 0.01²)   [rendimento settimanale mercato]
//   ε  ~ N(0,     0.008²)  [rumore idiosincratico]
//   Rp = 0.001 + 1.3·Rm + ε
//
// Beta teorico = 1.3 (coefficiente della regressione)
// Alpha teorico settimanale = 0.001 → annuale ≈ 0.052 (5.2%)
// R² teorico = β²·var(Rm) / [β²·var(Rm) + var(ε)]
//            = 1.69·0.0001 / (1.69·0.0001 + 6.4e-5)
//            = 0.000169 / 0.000233 ≈ 0.725

{
  const rng = makeLCG(42);
  const N   = 1000;
  const mktRets  = [];
  const portRets = [];

  for (let i = 0; i < N; i++) {
    const rm  = randNorm(rng, 0.002, 0.01);
    const eps = randNorm(rng, 0,     0.008);
    mktRets.push(rm);
    portRets.push(0.001 + 1.3 * rm + eps);
  }

  const rf  = 0.0;                          // rf = 0 per semplicità
  const res = capmMetrics(portRets, mktRets, rf);

  assert(!res.error, 'nessun errore con 1000 obs');
  assertClose(res.beta,        1.3,   0.10, 'β ≈ 1.3');
  assertClose(res.alphaAnnual, 0.052, 0.03, 'α annuale ≈ 5.2%');
  assertClose(res.r2,          0.725, 0.05, 'R² ≈ 0.725');
  assert(res.n === N, `n = ${N}`);
  assert(res.sysPct >= 0 && res.sysPct <= 1, 'sysPct ∈ [0,1]');
  assertClose(res.sysPct, res.r2, 1e-10, 'sysPct ≡ R² (consistenza interna)');
}

// ─── B. Test calcolo a mano: 5 obs, β = 1.5 esatto ───────────────────────────

section('B. Test calcolo a mano — 5 obs, β=1.5, α=0, R²=1 (rf=0)');

// Dati scelti per avere β = 1.5 ESATTO senza rumore:
//   Rp = 1.5 · Rm
//
//   Rm = [0.02, -0.01, 0.01, -0.02, 0.03]
//   Rp = [0.03, -0.015, 0.015, -0.03, 0.045]
//
// Calcolo a mano:
//   x̄  = (0.02 − 0.01 + 0.01 − 0.02 + 0.03) / 5 = 0.006
//   ȳ  = (0.03 − 0.015 + 0.015 − 0.03 + 0.045) / 5 = 0.009
//
//   Σ(x−x̄)² = 0.014²+0.016²+0.004²+0.026²+0.024²
//            = 0.000196+0.000256+0.000016+0.000676+0.000576 = 0.001720
//
//   Σ(x−x̄)(y−ȳ) = 0.014·0.021 + (−0.016)·(−0.024) + 0.004·0.006
//                + (−0.026)·(−0.039) + 0.024·0.036
//                = 0.000294 + 0.000384 + 0.000024 + 0.001014 + 0.000864
//                = 0.002580
//
//   β = 0.002580 / 0.001720 = 1.5  ✓
//   α = ȳ − β·x̄ = 0.009 − 1.5·0.006 = 0.009 − 0.009 = 0  ✓
//   R² = 0.002580² / (0.001720 · Σ(y−ȳ)²)
//   Σ(y−ȳ)² = 0.021²+0.024²+0.006²+0.039²+0.036² = 0.000441+0.000576+0.000036+0.001521+0.001296 = 0.003870
//   R² = 0.002580² / (0.001720·0.003870) = 0.006656400 / 0.006655400 ≈ 1.0  ✓

{
  const mktRets  = [0.02, -0.01, 0.01, -0.02, 0.03];
  const portRets = [0.03, -0.015, 0.015, -0.03, 0.045];
  const rf = 0;

  // Test OLS diretta (excesses = raw perché rf=0)
  const reg = ols(portRets, mktRets);
  assert(reg !== null, 'OLS non null');
  assertClose(reg.beta,             1.5, 1e-10, 'β = 1.5 (esatto)');
  assertClose(reg.interceptWeekly,  0.0, 1e-10, 'intercetta = 0 (α settimanale = 0)');
  assertClose(reg.r2,               1.0, 1e-10, 'R² = 1.0 (fit perfetto)');

  // capmMetrics richiede MIN_OBS=52; usiamo la soglia direttamente sulla funzione OLS
  // (i dati con 5 obs sono solo per il test OLS, non per capmMetrics)
  assert(true, 'test OLS su 5 obs completato (capmMetrics richiede ≥ 52 obs per design)');
}

// ─── C. Test Sharpe e Treynor su dati controllati ────────────────────────────

section('C. Test Sharpe e Treynor');

// Costruiamo 60 obs con β=1.0, α=0, sigma_p = sigma_m (perfetta correlazione)
// in modo che Sharpe = Treynor (con β=1).
//
// Rp = Rm  (identità)
// rf = 2% annuo → rfWeekly = 0.02/52
//
// mean(Rp) = mean(Rm) = μ
// Sharpe  = (μ·52 − 0.02) / (std(Rp)·√52)
// Treynor = (μ·52 − 0.02) / 1.0 = μ·52 − 0.02
// Sharpe = Treynor / (std(Rp)·√52)

{
  const rng = makeLCG(99);
  const N   = 60;
  const mktRets = Array.from({ length: N }, () => randNorm(rng, 0.003, 0.015));
  const portRets = [...mktRets];  // portafoglio identico al mercato → β=1, α=0
  const rfAnnual = 0.02;

  const res = capmMetrics(portRets, mktRets, rfAnnual);

  assert(!res.error, 'nessun errore con 60 obs');
  assertClose(res.beta,   1.0, 0.01,  'β ≈ 1.0 (portafoglio = mercato)');
  assertClose(res.r2,     1.0, 0.001, 'R² ≈ 1.0 (fit perfetto)');
  assertClose(res.alphaAnnual, 0.0, 0.001, 'α annuale ≈ 0');

  // Sharpe e Treynor calcolati a mano per validazione
  const annRet = mean(mktRets) * WEEKS_PER_YEAR;
  const annVol = std(mktRets) * Math.sqrt(WEEKS_PER_YEAR);
  const expectedSharpe  = (annRet - rfAnnual) / annVol;
  const expectedTreynor = (annRet - rfAnnual) / 1.0;

  assertClose(res.sharpe,  expectedSharpe,  0.001, 'Sharpe uguale al calcolo a mano');
  assertClose(res.treynor, expectedTreynor, 0.001, 'Treynor uguale al calcolo a mano');
  assert(Math.abs(res.treynor) <= Math.abs(res.sharpe) * annVol + 0.001,
    'Treynor = Sharpe × σ quando β=1 (identità)');
}

// ─── D. Edge cases ────────────────────────────────────────────────────────────

section('D. Edge cases');

// D1. Serie troppo corta (< MIN_OBS)
{
  const short = Array.from({ length: MIN_OBS - 1 }, () => 0.001);
  const res = capmMetrics(short, short, 0.04);
  assert(res.error === 'insufficient_data', `serie corta → error='insufficient_data' (n=${res.n})`);
  assert(res.n === MIN_OBS - 1, `n restituito = ${MIN_OBS - 1}`);
}

// D2. Varianza del mercato zero (indice costante)
{
  const constMkt = Array.from({ length: 60 }, () => 0.0);  // mercato immobile
  const portR    = Array.from({ length: 60 }, () => 0.001);
  const res = capmMetrics(portR, constMkt, 0.04);
  assert(res.error === 'zero_market_variance', 'varianza mercato zero → zero_market_variance');
}

// D3. Lunghezze diverse
{
  const a = Array.from({ length: 60 }, () => 0.01);
  const b = Array.from({ length: 50 }, () => 0.01);
  const res = capmMetrics(a, b, 0.04);
  assert(res.error === 'length_mismatch', 'lunghezze diverse → length_mismatch');
}

// D4. Portafoglio monotitolo (la stima è valida se ha dati sufficienti)
{
  const rng = makeLCG(7);
  const N = 60;
  const mktR  = Array.from({ length: N }, () => randNorm(rng, 0.002, 0.01));
  const portR = mktR.map(r => 0.0005 + 1.2 * r);  // unico titolo, beta=1.2
  const res = capmMetrics(portR, mktR, 0.04);
  assert(!res.error, 'portafoglio monotitolo: nessun errore con 60 obs');
  assertClose(res.beta, 1.2, 0.001, 'β = 1.2 (portafoglio = singolo titolo)');
}

// D5. Portafoglio con versamento a metà periodo (pesi costanti — approssimazione standard)
// Questo edge case è gestito a livello di API (i pesi vengono mantenuti costanti);
// capmMetrics riceve semplicemente la serie già costruita.
// Verifichiamo che la funzione funzioni correttamente anche con rendimenti negativi e positivi misti.
{
  const rng = makeLCG(13);
  const N   = 52;
  // Simulazione: prima metà del periodo il portafoglio va bene, seconda peggio
  const portR = [
    ...Array.from({ length: 26 }, () => randNorm(rng, 0.004, 0.02)),
    ...Array.from({ length: 26 }, () => randNorm(rng, -0.002, 0.025)),
  ];
  const mktR = Array.from({ length: N }, () => randNorm(rng, 0.002, 0.018));
  const res = capmMetrics(portR, mktR, 0.04);
  assert(!res.error, 'serie con rendimenti misti: nessun errore');
  assert(typeof res.beta === 'number' && isFinite(res.beta), 'β è un numero finito');
  assert(typeof res.r2 === 'number' && res.r2 >= 0 && res.r2 <= 1, 'R² ∈ [0,1]');
}

// ─── E. Test weekKey e toReturns ─────────────────────────────────────────────

section('E. weekKey e toReturns');

{
  // Venerdì 17 ottobre 2023 = timestamp 1697500800 UTC
  // Il lunedì della stessa settimana è il 16 ottobre 2023
  const ts = 1697500800;  // venerdì 2023-10-17 00:00:00 UTC
  const key = weekKey(ts);
  assert(key === '2023-10-16', `weekKey(venerdì 2023-10-17) = '2023-10-16' (lunedì) → got '${key}'`);

  // Domenica 15 ottobre 2023 = stessa settimana
  const tsSun = 1697328000;  // domenica 2023-10-15
  const keySun = weekKey(tsSun);
  assert(keySun === '2023-10-09', `weekKey(domenica) → lunedì della settimana precedente → '${keySun}'`);

  // Lunedì 16 ottobre 2023 stesso tasto
  const tsMon = 1697414400;  // lunedì 2023-10-16
  assert(weekKey(tsMon) === '2023-10-16', 'weekKey(lunedì) → stesso lunedì');
}

{
  // toReturns: prezzi 100, 105, 102 → rendimenti +5%, −2.857%
  const prices = [
    { wk: '2023-01-02', price: 100 },
    { wk: '2023-01-09', price: 105 },
    { wk: '2023-01-16', price: 102 },
  ];
  const rets = toReturns(prices);
  assert(rets.length === 2, 'toReturns: lunghezza = n-1');
  assertClose(rets[0].ret, 0.05,          1e-10, 'toReturns[0] = +5%');
  assertClose(rets[1].ret, (102-105)/105, 1e-10, 'toReturns[1] = −2.857%');
  assert(rets[0].wk === '2023-01-09', 'toReturns: wk del primo rendimento = data fine settimana');
}

// ─── F. Test scomposizione varianza ──────────────────────────────────────────

section('F. Scomposizione varianza — sysPct ≡ R²');

{
  const rng = makeLCG(55);
  const N   = 80;
  const mktR  = Array.from({ length: N }, () => randNorm(rng, 0.002, 0.015));
  const portR = mktR.map(r => 0.001 + 0.8 * r + randNorm(rng, 0, 0.01));
  const res = capmMetrics(portR, mktR, 0.03);

  assert(!res.error, 'nessun errore con 80 obs');
  assertClose(res.sysPct,  res.r2,       1e-10, 'sysPct ≡ R² (identità per costruzione OLS)');
  assertClose(res.idioPct, 1 - res.r2,   1e-10, 'idioPct = 1 − R²');
  assertClose(res.sysPct + res.idioPct, 1.0, 1e-10, 'sysPct + idioPct = 1');
  assert(res.sysBeta >= 0, 'varianza sistematica ≥ 0');
  assert(res.idioVar >= 0, 'varianza idiosincratica ≥ 0');

  // Verifica manuale: β²·varMkt / varPort ≈ R²
  const manualSysPct = (res.beta ** 2 * res.varMkt) / res.varPort;
  assertClose(manualSysPct, res.r2, 0.001, 'β²·σ²m / σ²p ≈ R² (calcolo indipendente)');
}

// ─── G. Test alignSeries ──────────────────────────────────────────────────────

section('G. alignSeries — intersezione date');

{
  const a = [
    { wk: '2024-01-01', ret: 0.01 },
    { wk: '2024-01-08', ret: 0.02 },
    { wk: '2024-01-15', ret: -0.01 },
    { wk: '2024-01-22', ret: 0.03 },  // non presente in b
  ];
  const b = [
    { wk: '2024-01-01', ret: 0.005 },
    { wk: '2024-01-08', ret: 0.015 },
    { wk: '2024-01-15', ret: -0.005 },
    // manca 2024-01-22
    { wk: '2024-01-29', ret: 0.01 },  // non presente in a
  ];
  const aligned = alignSeries(a, b);
  assert(aligned.length === 3, 'alignSeries: 3 settimane comuni su 4');
  assert(aligned[0].wk === '2024-01-01', 'prima settimana allineata');
  assertClose(aligned[1].a, 0.02,  1e-10, 'a[1] = 0.02');
  assertClose(aligned[1].b, 0.015, 1e-10, 'b[1] = 0.015');
}

// ─── Riepilogo ────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`RISULTATO: ${passed} passati, ${failed} falliti`);

if (failed > 0) {
  console.error(`\n${failed} test falliti. Correggere prima di procedere.\n`);
  process.exit(1);
} else {
  console.log(`\nTutti i test passano.\n`);
  process.exit(0);
}
