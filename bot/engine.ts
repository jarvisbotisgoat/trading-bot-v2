import yahooFinance from 'yahoo-finance2';
import { getServiceClient } from '../lib/supabase';
import type { PriceBar } from '../lib/types';
import { detectSetups } from './strategy';
import { openPaperTrade, checkAndCloseTrades } from './executor';
import { log } from './logger';
import 'dotenv/config';

const LOOP_INTERVAL = (parseInt(process.env.BOT_LOOP_INTERVAL_SECONDS || '60', 10)) * 1000;
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

async function runLoop(): Promise<void> {
  await log('info', 'Bot loop started');

  const openSymbols = await getOpenSymbols();
  const currentPrices: Record<string, number> = {};

  for (const symbol of WATCHLIST) {
    try {
      const bars = await fetchBars(symbol);
      if (bars.length === 0) continue;

      const latest = bars[bars.length - 1];
      currentPrices[symbol] = latest.close;

      // Skip setup detection if we already have an open trade for this symbol
      if (openSymbols.has(symbol)) continue;

      const vwap = computeVWAP(bars);
      const prevHod = Math.max(...bars.slice(0, -1).map((b) => b.high));

      const signals = detectSetups({
        symbol,
        bars,
        vwap,
        prevHod,
      });

      if (signals.length > 0) {
        // Take the first (best) signal
        await openPaperTrade(signals[0]);
      }
    } catch (err) {
      await log('error', `Error processing ${symbol}`, { error: String(err) });
    }
  }

  // Check stops and targets for open trades
  await checkAndCloseTrades(currentPrices);
}

async function checkMarketClose(): Promise<void> {
  // placeholder for end-of-day logic
}

async function main() {
  console.log('🤖 Trading bot starting...');
  console.log(`Watchlist: ${WATCHLIST.join(', ')}`);
  console.log(`Loop interval: ${LOOP_INTERVAL / 1000}s`);

  await log('info', 'Bot engine started', { watchlist: WATCHLIST });

  // Initial run
  await runLoop();

  // Schedule loop
  setInterval(async () => {
    try {
      await runLoop();
      await checkMarketClose();
    } catch (err) {
      await log('error', 'Unhandled error in bot loop', { error: String(err) });
    }
  }, LOOP_INTERVAL);
}

main().catch(console.error);
