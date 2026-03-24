import type { PriceBar, SetupSignal, SetupType } from '../lib/types';

interface StrategyInput {
  symbol: string;
  bars: PriceBar[];
  vwap?: number;
  prevHod?: number;
}

// Default risk-reward ratio
const DEFAULT_RR = 2;

function calcTarget(entry: number, stop: number, rr: number = DEFAULT_RR): number {
  const risk = Math.abs(entry - stop);
  return entry > stop ? entry + risk * rr : entry - risk * rr;
}

function avgVolume(bars: PriceBar[]): number {
  if (bars.length === 0) return 0;
  return bars.reduce((sum, b) => sum + b.volume, 0) / bars.length;
}

/**
 * Opening Range Breakout (ORB)
 * First 15min range established, price breaks above/below with volume
 */
function detectORB(input: StrategyInput): SetupSignal | null {
  const { symbol, bars } = input;
  if (bars.length < 20) return null;

  // Use first few bars as "opening range" proxy (simulated 15min)
  const openingBars = bars.slice(0, 3);
  const orHigh = Math.max(...openingBars.map((b) => b.high));
  const orLow = Math.min(...openingBars.map((b) => b.low));

  const latest = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];
  const avg = avgVolume(bars.slice(0, -1));

  // Breakout above with volume
  if (
    latest.close > orHigh &&
    prevBar.close <= orHigh &&
    latest.volume > avg * 1.2
  ) {
    const entry = latest.close;
    const stop = orLow;
    return {
      symbol,
      setup_type: 'ORB',
      entry_price: entry,
      stop_price: stop,
      target_price: calcTarget(entry, stop),
      thesis: `ORB breakout above ${orHigh.toFixed(2)} with above-avg volume`,
      entry_quality_score: Math.min(10, Math.round(5 + (latest.volume / avg - 1) * 5)),
      market_regime: 'trending',
    };
  }

  // Breakdown below with volume
  if (
    latest.close < orLow &&
    prevBar.close >= orLow &&
    latest.volume > avg * 1.2
  ) {
    const entry = latest.close;
    const stop = orHigh;
    return {
      symbol,
      setup_type: 'ORB',
      entry_price: entry,
      stop_price: stop,
      target_price: calcTarget(entry, stop),
      thesis: `ORB breakdown below ${orLow.toFixed(2)} with above-avg volume`,
      entry_quality_score: Math.min(10, Math.round(5 + (latest.volume / avg - 1) * 5)),
      market_regime: 'trending',
    };
  }

  return null;
}

/**
 * VWAP Reclaim
 * Price dips below VWAP then closes back above it
 */
function detectVWAPReclaim(input: StrategyInput): SetupSignal | null {
  const { symbol, bars, vwap } = input;
  if (!vwap || bars.length < 5) return null;

  const latest = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];
  const twoBarsAgo = bars[bars.length - 3];

  // Was below VWAP, now closing above
  if (
    twoBarsAgo.close < vwap &&
    prevBar.low < vwap &&
    latest.close > vwap
  ) {
    const entry = latest.close;
    const recentLow = Math.min(...bars.slice(-5).map((b) => b.low));
    const stop = recentLow;
    return {
      symbol,
      setup_type: 'VWAP_RECLAIM',
      entry_price: entry,
      stop_price: stop,
      target_price: calcTarget(entry, stop),
      thesis: `VWAP reclaim — dipped below ${vwap.toFixed(2)} and closed back above`,
      entry_quality_score: 6,
      market_regime: 'mean-reverting',
    };
  }

  return null;
}

/**
 * HOD Break
 * Price breaks prior high of day with momentum
 */
function detectHODBreak(input: StrategyInput): SetupSignal | null {
  const { symbol, bars, prevHod } = input;
  if (!prevHod || bars.length < 5) return null;

  const latest = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];
  const avg = avgVolume(bars.slice(0, -1));

  if (
    latest.close > prevHod &&
    prevBar.close <= prevHod &&
    latest.volume > avg * 1.1
  ) {
    const entry = latest.close;
    const recentLow = Math.min(...bars.slice(-5).map((b) => b.low));
    const stop = recentLow;
    return {
      symbol,
      setup_type: 'HOD_BREAK',
      entry_price: entry,
      stop_price: stop,
      target_price: calcTarget(entry, stop),
      thesis: `HOD break above ${prevHod.toFixed(2)} with momentum`,
      entry_quality_score: Math.min(10, Math.round(5 + (latest.volume / avg - 1) * 5)),
      market_regime: 'trending',
    };
  }

  return null;
}

export function detectSetups(input: StrategyInput): SetupSignal[] {
  const signals: SetupSignal[] = [];

  const orb = detectORB(input);
  if (orb) signals.push(orb);

  const vwap = detectVWAPReclaim(input);
  if (vwap) signals.push(vwap);

  const hod = detectHODBreak(input);
  if (hod) signals.push(hod);

  return signals;
}
