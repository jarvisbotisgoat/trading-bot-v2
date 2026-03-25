/**
 * Shared watchlist for all scanners and briefings.
 * One place to add/remove tickers.
 */

// Extra tickers from env var (comma-separated)
const EXTRA = (process.env.WATCHLIST_EXTRA || '').split(',').filter(Boolean);

export const STOCK_WATCHLIST = [
  // Mega caps — the big dogs
  'TSLA', 'NVDA', 'AAPL', 'AMZN', 'GOOGL', 'META', 'MSFT', 'NFLX',
  // Semis / AI plays
  'AMD', 'SMCI', 'ARM', 'AVGO', 'MU', 'INTC', 'TSM',
  // High-vol retail favorites
  'PLTR', 'SOFI', 'NIO', 'RIVN', 'COIN', 'MARA', 'RIOT', 'HOOD', 'RKLB', 'IONQ',
  // Big financials / industrials
  'JPM', 'GS', 'V', 'BA',
  // Pharma / biotech runners
  'MRNA', 'LLY',
  // Energy
  'XOM', 'CVX',
  // ETFs — broad market pulse
  'SPY', 'QQQ', 'IWM', 'DIA', 'ARKK',
  // User extras
  ...EXTRA,
];

export const CRYPTO_WATCHLIST = [
  'BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD', 'AVAX-USD',
];

// Combined for scanners that want everything
export const FULL_SCAN_LIST = [...STOCK_WATCHLIST, ...CRYPTO_WATCHLIST];
