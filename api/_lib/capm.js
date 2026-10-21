/**
 * api/_lib/capm.js — Funzioni matematiche CAPM
 *
 * Esportate separatamente dall'handler per poter essere unit-testate in isolamento.
 * Tutte le funzioni sono pure (no side effects, no I/O).
 *
 * Convenzioni:
 *  - Rendimenti: aritmetici settimanali (es. 0.02 = +2%)
 *  - Frequenza: 52 settimane/anno
 *  - Tasso rf: annuale (es. 0.0425 = 4.25%)
 *  - Deviazione standard: campionaria (divisore n-1, Bessel's correction)
 */

export const WEEKS_PER_YEAR = 52;
export const MIN_OBS        = 52;   // minimo osservazioni per esporre le metriche

// ─── Date helpers ───────────────────────────────────────────────────────────

/**
 * Converte un timestamp Unix nel lunedì della settimana ISO (YYYY-MM-DD).
 * Serve ad allineare serie con calendari di mercato diversi (US, EU).
 *
 * Esempio:
 *   weekKey(1697500800)  // venerdì 17 ott 2023
 *   → '2023-10-16'       // lunedì della stessa settimana
 */
export function weekKey(ts) {
  const d = new Date(ts * 1000);
  // getUTCDay(): 0=Dom, 1=Lun, …, 6=Sab → convertiamo a 1=Lun, 7=Dom
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - dow + 1);  // sposta al lunedì
  return d.toISOString().slice(0, 10);
}

// ─── Serie temporali ─────────────────────────────────────────────────────────

/**
 * Converte array di { wk: string, price: number } in array di { wk, ret }.
 * Il rendimento del periodo t è (price[t] - price[t-1]) / price[t-1].
 * La lunghezza dell'output è prices.length - 1.
 *
 * Precondizione: prices ordinato per data crescente, price > 0.
 */
export function toReturns(prices) {
  const out = [];
  for (let i = 1; i < prices.length; i++) {
    const p0 = prices[i - 1].price;
    const p1 = prices[i].price;
    if (p0 > 0) {
      out.push({ wk: prices[i].wk, ret: (p1 - p0) / p0 });
    }
  }
  return out;
}

/**
 * Allinea due serie di rendimenti sulle settimane comuni.
 * Ritorna array di { wk, a: ret_A, b: ret_B }.
 *
 * @param {Array<{wk, ret}>} retA
 * @param {Array<{wk, ret}>} retB
 * @returns {Array<{wk, a, b}>}
 */
export function alignSeries(retA, retB) {
  const mapB = new Map(retB.map(r => [r.wk, r.ret]));
  const out   = [];
  for (const r of retA) {
    const b = mapB.get(r.wk);
    if (b != null) out.push({ wk: r.wk, a: r.ret, b });
  }
  return out;
}

// ─── Statistica di base ───────────────────────────────────────────────────────

/** Media aritmetica. */
export function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Deviazione standard campionaria (divisore n-1).
 * Standard CFA/Bloomberg per serie finanziarie.
 */
export function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

// ─── Regressione OLS ─────────────────────────────────────────────────────────

/**
 * Regressione OLS: y = α + β·x
 *
 * Calcolo passo per passo (verificabile a mano):
 *
 *   β = Σ[(x_i − x̄)(y_i − ȳ)] / Σ[(x_i − x̄)²]
 *   α = ȳ − β·x̄
 *   R² = [Σ(x_i − x̄)(y_i − ȳ)]² / [Σ(x_i − x̄)² · Σ(y_i − ȳ)²]
 *      = ρ(x,y)²
 *
 * Quando si regrediscono i rendimenti in eccesso (y = Rp−Rf, x = Rm−Rf),
 * l'intercetta è l'alpha di Jensen settimanale.
 *
 * @param {number[]} y  rendimenti in eccesso del portafoglio
 * @param {number[]} x  rendimenti in eccesso del benchmark
 * @returns {{ beta, interceptWeekly, r2, n } | null}  null se varianza x = 0
 */
export function ols(y, x) {
  const n = y.length;
  if (n < 2 || n !== x.length) return null;

  const mx = mean(x);
  const my = mean(y);

  let covXY = 0, varX = 0, varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    covXY += dx * dy;
    varX  += dx * dx;
    varY  += dy * dy;
  }

  // Varianza dell'indice nulla o trascurabile → impossibile stimare beta.
  // Soglia: 1e-20 per rendimenti settimanali (scala tipica 1e-4 … 1e-3).
  // Necessaria perché la somma floating-point di n valori identici può dare
  // un residuo di macchina non esattamente zero (ordine 1e-30 … 1e-36).
  if (varX < 1e-20) return null;

  const beta            = covXY / varX;
  const interceptWeekly = my - beta * mx;
  const r2              = (varX * varY > 0) ? (covXY * covXY) / (varX * varY) : 0;

  return { beta, interceptWeekly, r2, n };
}

// ─── Metriche CAPM ────────────────────────────────────────────────────────────

/**
 * Calcola tutte le metriche CAPM a partire da serie di rendimenti settimanali.
 *
 * @param {number[]} portRets  rendimenti settimanali del portafoglio
 * @param {number[]} mktRets   rendimenti settimanali del benchmark di mercato
 * @param {number}   rfAnnual  tasso risk-free annuale (es. 0.0425)
 * @returns {object}           metriche o { error, n }
 *
 * Scelte metodologiche (visibili in UI):
 *  - Rendimenti settimanali, finestra 2 anni (104 obs target)
 *  - Minimo 52 obs; altrimenti ritorna { error: 'insufficient_data', n }
 *  - Annualizzazione: media × 52, volatilità × √52
 *  - Regressione OLS su rendimenti in eccesso (Rp−Rf, Rm−Rf)
 *  - Scomposizione varianza: sistematica = β²·σ²m, specifica = σ²p − β²·σ²m
 *    Nota: sysPct ≡ R² (verifica interna di consistenza)
 */
export function capmMetrics(portRets, mktRets, rfAnnual) {
  const n = portRets.length;

  if (n < MIN_OBS) return { error: 'insufficient_data', n };
  if (n !== mktRets.length) return { error: 'length_mismatch', n };

  const rfWeekly = rfAnnual / WEEKS_PER_YEAR;

  // Rendimenti in eccesso (settimanali)
  const portExcess = portRets.map(r => r - rfWeekly);
  const mktExcess  = mktRets.map(r => r - rfWeekly);

  // OLS su rendimenti in eccesso
  const reg = ols(portExcess, mktExcess);
  if (!reg) return { error: 'zero_market_variance', n };

  const { beta, interceptWeekly, r2 } = reg;

  // Alpha di Jensen annualizzato (intercetta OLS × 52)
  const alphaAnnual = interceptWeekly * WEEKS_PER_YEAR;

  // Rendimento annualizzato aritmetico (per Sharpe e Treynor, standard CFA)
  const annRetArith = mean(portRets) * WEEKS_PER_YEAR;

  // Volatilità annualizzata
  const annVolPort = std(portRets) * Math.sqrt(WEEKS_PER_YEAR);

  // Sharpe: (Rp_ann − Rf) / σp_ann
  const sharpe = annVolPort > 0 ? (annRetArith - rfAnnual) / annVolPort : null;

  // Treynor: (Rp_ann − Rf) / β
  const treynor = Math.abs(beta) > 0.01 ? (annRetArith - rfAnnual) / beta : null;

  // Scomposizione della varianza (settimanale)
  //   σ²p = β²·σ²m + σ²ε  (identità CAPM)
  //   sysPct = β²·σ²m / σ²p  ≡  R²  (per costruzione OLS)
  const varPort  = std(portRets) ** 2;
  const varMkt   = std(mktRets) ** 2;
  const sysBeta  = beta * beta * varMkt;
  const idioVar  = Math.max(0, varPort - sysBeta);
  // Usiamo R² come sysPct per consistenza OLS (evita piccoli errori floating point)
  const sysPct   = r2;
  const idioPct  = 1 - r2;

  return {
    beta,
    alphaAnnual,
    sharpe,
    treynor,
    r2,
    n,
    annRetArith,
    annVolPort,
    rfAnnual,
    sysPct,
    idioPct,
    varPort,
    varMkt,
    sysBeta,
    idioVar,
  };
}
