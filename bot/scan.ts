import yahooFinance from 'yahoo-finance2';
import { getServiceClient } from '../lib/supabase';
import type { PriceBar } from '../lib/types';
import { detectSetups } from './strategy';
import { openPaperTrade, checkAndCloseTrades } from './executor';
import { log } from './logger';

const WATCHLIST = (process.env.WATCHLIST || 'TSLA,NVDA,SPY,AAPL,AMZN').split(',');

async function fetchBars(symbol: string): Promise<PriceBar[]> {
  try {
    const result = await yahooFinance.chart(symbol, {
      period1: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      interval: '5m' as '1m',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chartResult = result as any;
    if (!chartResult?.quotes) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return chartResult.quotes
      .filter((q: any) => q.open != null && q.high != null && q.low != null && q.close != null)
      .map((q: any) => ({
        time: new Date(q.date).getTime() / 1000,
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume || 0,
      }));
  } catch (err) {
    await log('warn', `Failed to fetch bars for ${symbol}`, { error: String(err) });
    return [];
  }
}

function computeVWAP(bars: PriceBar[]): number {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumulativeTPV += typicalPrice * bar.volume;
    cumulativeVolume += bar.volume;
  }
  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0;
}

async function getOpenSymbols(): Promise<Set<string>> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('trades')
    .select('symbol')
    .eq('status', 'open');
  return new Set((data || []).map((t: { symbol: string }) => t.symbol));
}

export interface ScanResult {
  symbol: string;
  price: number;
  bars_count: number;
  vwap: number;
  signals_found: number;
  skipped: boolean;
  signal_type?: string;
}

export async function runScan(): Promise<ScanResult[]> {
  await log('info', 'Bot scan started', { watchlist: WATCHLIST });

  const openSymbols = await getOpenSymbols();
  const currentPrices: Record<string, number> = {};
  const results: ScanResult[] = [];

  for (const symbol of WATCHLIST) {
    try {
      const bars = await fetchBars(symbol);
      if (bars.length === 0) {
        results.push({ symbol, price: 0, bars_count: 0, vwap: 0, signals_found: 0, skipped: true });
        await log('info', `Scanning ${symbol}: no data`, { symbol });
        continue;
      }

      const latest = bars[bars.length - 1];
      currentPrices[symbol] = latest.close;
      const vwap = computeVWAP(bars);
      const prevHod = Math.max(...bars.slice(0, -1).map((b) => b.high));

      if (openSymbols.has(symbol)) {
        results.push({
          symbol,
          price: latest.close,
          bars_count: bars.length,
          vwap,
          signals_found: 0,
          skipped: true,
        });
        await log('info', `Scanning ${symbol}: $${latest.close.toFixed(2)} — skipped (open trade)`, {
          symbol,
          price: latest.close,
        });
        continue;
      }

      const signals = detectSetups({ symbol, bars, vwap, prevHod });

      results.push({
        symbol,
        price: latest.close,
        bars_count: bars.length,
        vwap,
        signals_found: signals.length,
        skipped: false,
        signal_type: signals.length > 0 ? signals[0].setup_type : undefined,
      });

      if (signals.length > 0) {
        await log('info', `Scanning ${symbol}: $${latest.close.toFixed(2)} — SIGNAL: ${signals[0].setup_type}`, {
          symbol,
          price: latest.close,
          setup: signals[0].setup_type,
          entry: signals[0].entry_price,
        });
        await openPaperTrade(signals[0]);
      } else {
        await log('info', `Scanning ${symbol}: $${latest.close.toFixed(2)} — no setup`, {
          symbol,
          price: latest.close,
          vwap,
        });
      }
    } catch (err) {
      await log('error', `Error scanning ${symbol}`, { error: String(err) });
      results.push({ symbol, price: 0, bars_count: 0, vwap: 0, signals_found: 0, skipped: true });
    }
  }

  await checkAndCloseTrades(currentPrices);
  await log('info', 'Bot scan completed', {
    scanned: results.length,
    signals: results.filter((r) => r.signals_found > 0).length,
  });

  return results;
}
