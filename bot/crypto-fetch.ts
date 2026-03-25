import type { PriceBar } from '../lib/types';

/**
 * Fetch crypto bars using Yahoo Finance v8 API directly.
 * yahoo-finance2 npm sometimes fails on serverless — this is a direct fetch fallback.
 */
export async function fetchCryptoBars(symbol: string): Promise<PriceBar[]> {
  // Try yahoo-finance2 first, fall back to direct API
  try {
    const yahooFinance = (await import('yahoo-finance2')).default;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart(symbol, {
      period1: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      interval: '15m' as '1m',
    });

    if (result?.quotes?.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return result.quotes
        .filter((q: any) => q.open != null && q.close != null)
        .map((q: any) => ({
          time: new Date(q.date).getTime() / 1000,
          open: q.open,
          high: q.high,
          low: q.low,
          close: q.close,
          volume: q.volume || 0,
        }));
    }
  } catch {
    // Fall through to direct API
  }

  // Direct Yahoo Finance API fallback
  try {
    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - 3 * 24 * 60 * 60;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=15m`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) return [];

    const json = await res.json();
    const chart = json?.chart?.result?.[0];
    if (!chart) return [];

    const timestamps: number[] = chart.timestamp || [];
    const ohlcv = chart.indicators?.quote?.[0];
    if (!ohlcv) return [];

    const bars: PriceBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (ohlcv.open[i] != null && ohlcv.close[i] != null) {
        bars.push({
          time: timestamps[i],
          open: ohlcv.open[i],
          high: ohlcv.high[i],
          low: ohlcv.low[i],
          close: ohlcv.close[i],
          volume: ohlcv.volume[i] || 0,
        });
      }
    }
    return bars;
  } catch {
    return [];
  }
}

/**
 * Quick price fetch for a crypto symbol.
 */
export async function fetchCryptoPrice(symbol: string): Promise<number | null> {
  try {
    const yahooFinance = (await import('yahoo-finance2')).default;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quote: any = await yahooFinance.quote(symbol);
    return quote?.regularMarketPrice ?? null;
  } catch {
    // Fallback
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const json = await res.json();
      const meta = json?.chart?.result?.[0]?.meta;
      return meta?.regularMarketPrice ?? null;
    } catch {
      return null;
    }
  }
}
