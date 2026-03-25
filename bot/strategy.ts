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
 * Find the start of today's regular session (9:30 AM ET) in the bars array.
 * Returns the index, or -1 if not found.
 */
function findTodaySessionStart(bars: PriceBar[]): number {
  const now = new Date();
  const month = now.getUTCMonth();
  const isDST = month >= 2 && month <= 10;
  const etOffset = isDST ? 4 : 5;

  // Today's 9:30 AM ET in UTC
  const todayOpen = new Date(now);
  todayOpen.setUTCHours(9 + etOffset, 30, 0, 0);
  const openTs = todayOpen.getTime() / 1000;

  // Find the first bar at or after market open
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].time >= openTs) return i;
  }
  return -1;
}

/**
 * Opening Range Breakout (ORB)
 * First 15min range of TODAY's session, price breaks above/below with volume
 */
function detectORB(input: StrategyInput): SetupSignal | null {
  const { symbol, bars } = input;
  if (bars.length < 10) return null;

  const sessionStart = findTodaySessionStart(bars);
  if (sessionStart < 0) return null;

  // Need at least 3 bars after open (15 min of 5-min bars) + some bars after
  const sessionBars = bars.slice(sessionStart);
  if (sessionBars.length < 5) return null;

  // Opening range = first 3 bars (15 min)
  const openingBars = sessionBars.slice(0, 3);
  const orHigh = Math.max(...openingBars.map((b) => b.high));
  const orLow = Math.min(...openingBars.map((b) => b.low));

  // Check recent bars (last 3) for a breakout — don't require the exact bar
  const recentBars = sessionBars.slice(-3);
  const latest = recentBars[recentBars.length - 1];
  const avg = avgVolume(bars.slice(0, -1));

  // Check if any recent bar crossed above the OR high
  const wasBelow = sessionBars.slice(3, -3).some((b) => b.close <= orHigh);
  const nowAbove = latest.close > orHigh;

  if (wasBelow && nowAbove && latest.volume > avg * 1.0) {
    const entry = latest.close;
    const stop = orLow;
    return {
      symbol,
      setup_type: 'ORB',
      entry_price: entry,
      stop_price: stop,
      target_price: calcTarget(entry, stop),
      thesis: `ORB breakout above ${orHigh.toFixed(2)} — price reclaimed opening range high`,
      entry_quality_score: Math.min(10, Math.round(5 + (latest.volume / avg - 1) * 3)),
      market_regime: 'trending',
    };
  }

  // Breakdown below
  const wasAbove = sessionBars.slice(3, -3).some((b) => b.close >= orLow);
  const nowBelow = latest.close < orLow;

  if (wasAbove && nowBelow && latest.volume > avg * 1.0) {
    const entry = latest.close;
    const stop = orHigh;
    return {
      symbol,
      setup_type: 'ORB',
      entry_price: entry,
      stop_price: stop,
      target_price: calcTarget(entry, stop),
      thesis: `ORB breakdown below ${orLow.toFixed(2)} — price broke opening range low`,
      entry_quality_score: Math.min(10, Math.round(5 + (latest.volume / avg - 1) * 3)),
      market_regime: 'trending',
    };
  }

  return null;
}

/**
 * VWAP Reclaim
 * Price was below VWAP recently and is now closing above it
 */
function detectVWAPReclaim(input: StrategyInput): SetupSignal | null {
  const { symbol, bars, vwap } = input;
  if (!vwap || bars.length < 10) return null;

  const latest = bars[bars.length - 1];

  // Check if price was below VWAP in the last 6 bars
  const recentBars = bars.slice(-6);
  const wasBelow = recentBars.slice(0, -1).some((b) => b.close < vwap);

  // Now closing above VWAP
  if (wasBelow && latest.close > vwap) {
    const entry = latest.close;
    const recentLow = Math.min(...bars.slice(-8).map((b) => b.low));
    const stop = recentLow;

    // Skip if stop is too far (> 3% risk)
    if (Math.abs(entry - stop) / entry > 0.03) return null;

    return {
      symbol,
      setup_type: 'VWAP_RECLAIM',
      entry_price: entry,
      stop_price: stop,
      target_price: calcTarget(entry, stop),
      thesis: `VWAP reclaim — was below ${vwap.toFixed(2)}, now holding above`,
      entry_quality_score: 6,
      market_regime: 'mean-reverting',
    };
  }

  return null;
}

/**
 * HOD Break
 * Price breaks the session high (not 24h high) with momentum
 */
function detectHODBreak(input: StrategyInput): SetupSignal | null {
  const { symbol, bars } = input;
  if (bars.length < 10) return null;

  const sessionStart = findTodaySessionStart(bars);
  if (sessionStart < 0) return null;

  const sessionBars = bars.slice(sessionStart);
  if (sessionBars.length < 6) return null;

  // HOD = highest high of session bars EXCEPT the last 3
  const priorBars = sessionBars.slice(0, -3);
  if (priorBars.length < 3) return null;
  const sessionHod = Math.max(...priorBars.map((b) => b.high));

  const latest = sessionBars[sessionBars.length - 1];
  const avg = avgVolume(bars.slice(0, -1));

  if (latest.close > sessionHod && latest.volume > avg * 0.9) {
    const entry = latest.close;
    const recentLow = Math.min(...sessionBars.slice(-5).map((b) => b.low));
    const stop = recentLow;

    // Skip if stop is too far (> 3% risk)
    if (Math.abs(entry - stop) / entry > 0.03) return null;

    return {
      symbol,
      setup_type: 'HOD_BREAK',
      entry_price: entry,
      stop_price: stop,
      target_price: calcTarget(entry, stop),
      thesis: `Session HOD break above ${sessionHod.toFixed(2)} — fresh high with momentum`,
      entry_quality_score: Math.min(10, Math.round(5 + (latest.volume / avg - 1) * 3)),
      market_regime: 'trending',
    };
  }

  return null;
}

/**
 * Momentum Play (new — catches trending moves)
 * Price is trending: 3+ consecutive higher closes with volume
 */
function detectMomentum(input: StrategyInput): SetupSignal | null {
  const { symbol, bars, vwap } = input;
  if (bars.length < 10) return null;

  const latest = bars[bars.length - 1];
  const b1 = bars[bars.length - 2];
  const b2 = bars[bars.length - 3];
  const b3 = bars[bars.length - 4];
  const avg = avgVolume(bars.slice(-20, -1));

  // Bullish momentum: 3 higher closes, above VWAP, decent volume
  if (
    latest.close > b1.close &&
    b1.close > b2.close &&
    b2.close > b3.close &&
    (!vwap || latest.close > vwap) &&
    latest.volume > avg * 0.8
  ) {
    const entry = latest.close;
    const recentLow = Math.min(b1.low, b2.low, b3.low);
    const stop = recentLow;

    if (Math.abs(entry - stop) / entry > 0.03) return null;

    return {
      symbol,
      setup_type: 'HOD_BREAK', // reuse type for DB compatibility
      entry_price: entry,
      stop_price: stop,
      target_price: calcTarget(entry, stop, 1.5),
      thesis: `Momentum — 3 consecutive higher closes with volume above VWAP`,
      entry_quality_score: 5,
      market_regime: 'trending',
    };
  }

  // Bearish momentum: 3 lower closes, below VWAP
  if (
    latest.close < b1.close &&
    b1.close < b2.close &&
    b2.close < b3.close &&
    (!vwap || latest.close < vwap) &&
    latest.volume > avg * 0.8
  ) {
    const entry = latest.close;
    const recentHigh = Math.max(b1.high, b2.high, b3.high);
    const stop = recentHigh;

    if (Math.abs(entry - stop) / entry > 0.03) return null;

    return {
      symbol,
      setup_type: 'HOD_BREAK',
      entry_price: entry,
      stop_price: stop,
      target_price: calcTarget(entry, stop, 1.5),
      thesis: `Bearish momentum — 3 consecutive lower closes below VWAP`,
      entry_quality_score: 5,
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

  const momentum = detectMomentum(input);
  if (momentum) signals.push(momentum);

  return signals;
}
