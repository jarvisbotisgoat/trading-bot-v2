const STOCK_WATCHLIST = (process.env.WATCHLIST || 'TSLA,NVDA,SPY,AAPL,AMZN').split(',');
const CRYPTO_WATCHLIST = ['BTC-USD', 'ETH-USD', 'SOL-USD'];

/**
 * Returns true if US stock market is open (9:30 AM - 4:00 PM ET, Mon-Fri).
 * Uses a rough UTC-4/-5 offset — good enough for paper trading.
 */
export function isMarketOpen(): boolean {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  // ET is UTC-5 (EST) or UTC-4 (EDT). Use -4 for EDT (Mar-Nov).
  const month = now.getUTCMonth(); // 0-indexed
  const isDST = month >= 2 && month <= 10; // rough EDT check
  const etOffset = isDST ? 4 : 5;
  const etHour = now.getUTCHours() - etOffset;
  const etMin = now.getUTCMinutes();
  const etTime = etHour * 60 + etMin;

  // Market hours: 9:30 AM (570 min) to 4:00 PM (960 min)
  return etTime >= 570 && etTime < 960;
}

/**
 * Returns the active watchlist based on market hours.
 * Stocks during market hours, crypto after hours.
 */
export function getActiveWatchlist(): { symbols: string[]; mode: 'stocks' | 'crypto' } {
  if (isMarketOpen()) {
    return { symbols: STOCK_WATCHLIST, mode: 'stocks' };
  }
  return { symbols: CRYPTO_WATCHLIST, mode: 'crypto' };
}

/**
 * Display-friendly symbol (strip -USD suffix for crypto).
 */
export function displaySymbol(symbol: string): string {
  return symbol.replace('-USD', '');
}
