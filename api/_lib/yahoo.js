import yahooFinanceModule from 'yahoo-finance2';

// Istanza singleton con notice soppresso
const yf = new yahooFinanceModule({ suppressNotices: ['yahooSurvey'] });

export { yf };

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

export async function fetchQuoteSummary(symbol) {
  try {
    return await Promise.race([
      yf.quoteSummary(symbol, {
        modules: ['defaultKeyStatistics', 'summaryDetail', 'financialData', 'assetProfile'],
      }),
      timeout(7000),
    ]);
  } catch (_) {
    return null;
  }
}

export async function fetchYahooQuote(symbol) {
  try {
    return await Promise.race([yf.quote(symbol), timeout(5000)]);
  } catch (_) {
    return null;
  }
}

export async function fetchETFData(symbol) {
  try {
    return await Promise.race([
      yf.quoteSummary(symbol, { modules: ['topHoldings', 'fundProfile'] }),
      timeout(7000),
    ]);
  } catch (_) {
    return null;
  }
}

export async function fetchInsiderTransactions(symbol) {
  try {
    return await Promise.race([
      yf.quoteSummary(symbol, { modules: ['insiderTransactions'] }),
      timeout(7000),
    ]);
  } catch (_) {
    return null;
  }
}
