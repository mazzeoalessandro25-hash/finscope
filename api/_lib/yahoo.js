import yahooFinanceModule from 'yahoo-finance2';

// Istanza singleton con notice soppresso
const yf = new yahooFinanceModule({ suppressNotices: ['yahooSurvey'] });

export { yf };

export async function fetchQuoteSummary(symbol) {
  try {
    return await yf.quoteSummary(symbol, {
      modules: ['defaultKeyStatistics', 'summaryDetail', 'financialData', 'assetProfile'],
    });
  } catch (_) {
    return null;
  }
}

export async function fetchYahooQuote(symbol) {
  try {
    return await yf.quote(symbol);
  } catch (_) {
    return null;
  }
}
