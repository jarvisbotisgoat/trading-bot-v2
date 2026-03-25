import yahooFinance from 'yahoo-finance2';
import { getServiceClient } from '../lib/supabase';
import type { PriceBar, SetupSignal } from '../lib/types';
import { detectSetups } from './strategy';
import { detectWave, analyzeWave } from './wave-strategy';
import { openPaperTrade, checkAndCloseTrades } from './executor';
import { log } from './logger';
import { getActiveWatchlist, displaySymbol, isMarketOpen } from './market-hours';
import { fetchCryptoBars } from './crypto-fetch';

async function fetchStockBars(symbol: string): Promise<PriceBar[]> {
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

/**
 * Always-trade fallback: picks long or short based on simple indicators.
 * Called when no specific setup signal fires but we want a position on every symbol.
 */
function forceEntry(symbol: string, bars: PriceBar[], vwap: number): SetupSignal {
  const latest = bars[bars.length - 1];
  const price = latest.close;

  // Simple direction scoring
  let bullPoints = 0;
  let bearPoints = 0;

  // Price vs VWAP
  if (price > vwap) bullPoints += 2; else bearPoints += 2;

  // Last candle direction
  if (latest.close > latest.open) bullPoints += 1; else bearPoints += 1;

  // 3-bar trend
  if (bars.length >= 4) {
    const b1 = bars[bars.length - 2];
    const b2 = bars[bars.length - 3];
    if (latest.close > b1.close && b1.close > b2.close) bullPoints += 2;
    if (latest.close < b1.close && b1.close < b2.close) bearPoints += 2;
  }

  // Recent high/low position (where is price in the range?)
  if (bars.length >= 20) {
    const recent = bars.slice(-20);
    const rangeHigh = Math.max(...recent.map(b => b.high));
    const rangeLow = Math.min(...recent.map(b => b.low));
    const range = rangeHigh - rangeLow;
    if (range > 0) {
      const position = (price - rangeLow) / range;
      // Upper half = bullish trend, lower half = bearish
      if (position > 0.5) bullPoints += 1; else bearPoints += 1;
    }
  }

  const goLong = bullPoints >= bearPoints;
  const riskPct = 0.01; // 1% risk
  const riskAmount = price * riskPct;
  const rrRatio = 2;

  const entry = price;
  const stop = goLong ? entry - riskAmount : entry + riskAmount;
  const target = goLong ? entry + riskAmount * rrRatio : entry - riskAmount * rrRatio;
  const direction = goLong ? 'WAVE_LONG' : 'WAVE_SHORT';

  return {
    symbol,
    setup_type: direction as 'WAVE_LONG' | 'WAVE_SHORT',
    entry_price: entry,
    stop_price: stop,
    target_price: target,
    thesis: `Auto ${goLong ? 'long' : 'short'} — ${goLong ? 'bull' : 'bear'} bias (${goLong ? bullPoints : bearPoints} pts vs ${goLong ? bearPoints : bullPoints})`,
    entry_quality_score: Math.max(1, Math.min(10, Math.max(bullPoints, bearPoints))),
    market_regime: 'trending',
  };
}

export interface ScanResult {
  symbol: string;
  price: number;
  bars_count: number;
  vwap: number;
  signals_found: number;
  skipped: boolean;
  signal_type?: string;
  wave_analysis?: {
    trend: string;
    rsi: number;
    emaSpread: number;
    volumeRatio: number;
  };
}

interface PlanSetup {
  symbol: string;
  thesis: string;
  entryZone: string;
  stop: string;
  target: string;
  invalidation: string;
}

async function savePlannedSetups(setups: PlanSetup[]): Promise<void> {
  if (setups.length === 0) return;

  const supabase = getServiceClient();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const date = tomorrow.toISOString().split('T')[0];

  while (setups.length < 3) {
    setups.push({ symbol: '', thesis: '', entryZone: '', stop: '', target: '', invalidation: '' });
  }

  const planData = {
    slots: setups.slice(0, 3),
    holdAllDay: setups.length > 0 ? `${setups[0].symbol} — strongest signal` : '',
    swingWindow: '6:30–10:00 AM PT',
  };

  await supabase.from('daily_summary').upsert(
    {
      date,
      notes: JSON.stringify(planData),
      total_pnl: 0,
      win_count: 0,
      loss_count: 0,
      win_rate: 0,
      max_drawdown: 0,
    },
    { onConflict: 'date' }
  );
}

export async function runScan(): Promise<ScanResult[]> {
  const { symbols: WATCHLIST, mode } = getActiveWatchlist();
  const isCrypto = mode === 'crypto';

  await log('info', `Bot scan started — ${mode} mode`, {
    watchlist: WATCHLIST.map(displaySymbol),
    mode,
  });

  const openSymbols = await getOpenSymbols();
  const currentPrices: Record<string, number> = {};
  const results: ScanResult[] = [];
  const plannedSetups: PlanSetup[] = [];

  for (const symbol of WATCHLIST) {
    const display = displaySymbol(symbol);
    try {
      // Use crypto-specific fetcher for crypto symbols
      const bars = isCrypto ? await fetchCryptoBars(symbol) : await fetchStockBars(symbol);

      if (bars.length === 0) {
        results.push({ symbol, price: 0, bars_count: 0, vwap: 0, signals_found: 0, skipped: true });
        await log('info', `Scanning ${display}: no data`, { symbol });
        continue;
      }

      const latest = bars[bars.length - 1];
      currentPrices[symbol] = latest.close;
      const vwap = computeVWAP(bars);
      const prevHod = Math.max(...bars.slice(0, -1).map((b) => b.high));

      // Get wave analysis for BTC (always show trend info)
      const waveInfo = isCrypto ? analyzeWave(bars, vwap) : undefined;

      if (openSymbols.has(symbol)) {
        results.push({
          symbol,
          price: latest.close,
          bars_count: bars.length,
          vwap,
          signals_found: 0,
          skipped: true,
          wave_analysis: waveInfo,
        });
        await log('info', `Scanning ${display}: $${latest.close.toFixed(2)} — skipped (open trade)`, {
          symbol,
          price: latest.close,
        });
        continue;
      }

      // For crypto: use wave strategy. For stocks: use standard setups.
      let signals;
      if (isCrypto) {
        const wave = await detectWave({ symbol, bars, vwap });
        signals = wave ? [wave] : [];
      } else {
        signals = detectSetups({ symbol, bars, vwap, prevHod });
      }

      results.push({
        symbol,
        price: latest.close,
        bars_count: bars.length,
        vwap,
        signals_found: signals.length,
        skipped: false,
        signal_type: signals.length > 0 ? signals[0].setup_type : undefined,
        wave_analysis: waveInfo,
      });

      // If no specific signal, force a trade anyway — always be in a position
      if (signals.length === 0) {
        const forced = forceEntry(symbol, bars, vwap);
        signals = [forced];
      }

      const sig = signals[0];
      results[results.length - 1] = {
        ...results[results.length - 1],
        signals_found: 1,
        signal_type: sig.setup_type,
      };

      await log('info', `Scanning ${display}: $${latest.close.toFixed(2)} — ${sig.thesis.startsWith('Auto') ? 'AUTO' : 'SIGNAL'}: ${sig.setup_type}`, {
        symbol,
        price: latest.close,
        setup: sig.setup_type,
        entry: sig.entry_price,
      });
      await openPaperTrade(sig);

      plannedSetups.push({
        symbol: display,
        thesis: sig.thesis,
        entryZone: `$${(sig.entry_price * 0.998).toFixed(2)}–$${(sig.entry_price * 1.002).toFixed(2)}`,
        stop: `$${sig.stop_price.toFixed(2)}`,
        target: `$${sig.target_price.toFixed(2)}`,
        invalidation: `Break ${sig.target_price > sig.entry_price ? 'below' : 'above'} $${sig.stop_price.toFixed(2)}`,
      });
    } catch (err) {
      await log('error', `Error scanning ${display}`, { error: String(err) });
      results.push({ symbol, price: 0, bars_count: 0, vwap: 0, signals_found: 0, skipped: true });
    }
  }

  await checkAndCloseTrades(currentPrices);
  await savePlannedSetups(plannedSetups);

  await log('info', `Bot scan completed — ${mode} mode`, {
    scanned: results.length,
    signals: results.filter((r) => r.signals_found > 0).length,
    mode,
  });

  return results;
}
