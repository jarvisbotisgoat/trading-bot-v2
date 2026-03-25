import type { PriceBar, SetupSignal } from '../lib/types';

/**
 * Crypto Wave Rider Strategy
 *
 * Aggressive momentum strategy that catches waves up AND down.
 * Multiple independent triggers — any ONE can fire a trade:
 *
 * 1. EMA crossover (8 vs 21)
 * 2. Strong candle move (>0.3% in one bar with any volume)
 * 3. Price bouncing off VWAP
 * 4. RSI reversal from extremes
 * 5. 3-bar momentum streak
 */

function ema(bars: PriceBar[], period: number): number[] {
  const multiplier = 2 / (period + 1);
  const result: number[] = [];

  let sum = 0;
  for (let i = 0; i < Math.min(period, bars.length); i++) {
    sum += bars[i].close;
  }
  result[Math.min(period, bars.length) - 1] = sum / Math.min(period, bars.length);

  for (let i = period; i < bars.length; i++) {
    result[i] = (bars[i].close - result[i - 1]) * multiplier + result[i - 1];
  }

  return result;
}

function rsi(bars: PriceBar[], period: number = 14): number {
  if (bars.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = bars.length - period; i < bars.length; i++) {
    const change = bars[i].close - bars[i - 1].close;
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function avgVolume(bars: PriceBar[]): number {
  if (bars.length === 0) return 0;
  return bars.reduce((sum, b) => sum + b.volume, 0) / bars.length;
}

interface WaveInput {
  symbol: string;
  bars: PriceBar[];
  vwap: number;
}

export function detectWave(input: WaveInput): SetupSignal | null {
  const { symbol, bars, vwap } = input;
  if (bars.length < 25) return null;

  const ema8 = ema(bars, 8);
  const ema21 = ema(bars, 21);
  const currentRsi = rsi(bars);
  const latest = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const prev2 = bars[bars.length - 3];
  const avgVol = avgVolume(bars.slice(-20, -1));

  const fastNow = ema8[bars.length - 1];
  const fastPrev = ema8[bars.length - 2];
  const slowNow = ema21[bars.length - 1];
  const slowPrev = ema21[bars.length - 2];

  if (!fastNow || !fastPrev || !slowNow || !slowPrev) return null;

  const price = latest.close;
  const riskAmount = price * 0.005; // 0.5% risk
  const barMove = (latest.close - latest.open) / latest.open;
  const prevMove = (prev.close - prev.open) / prev.open;
  const volumeRatio = avgVol > 0 ? latest.volume / avgVol : 1;

  // ============ LONG TRIGGERS ============
  let longReason: string | null = null;
  let longScore = 0;

  // Trigger 1: EMA crossover
  if (fastPrev <= slowPrev && fastNow > slowNow) {
    longReason = `EMA8 crossed above EMA21`;
    longScore = 7;
  }

  // Trigger 2: Strong bullish candle (>0.3% move up)
  if (!longReason && barMove > 0.003) {
    longReason = `Strong bullish candle (+${(barMove * 100).toFixed(2)}%)`;
    longScore = 5;
  }

  // Trigger 3: VWAP bounce — price dipped near/below VWAP and bounced
  if (!longReason && prev.low <= vwap * 1.001 && latest.close > vwap && latest.close > prev.close) {
    longReason = `VWAP bounce at $${vwap.toFixed(0)}`;
    longScore = 6;
  }

  // Trigger 4: RSI reversal from oversold
  if (!longReason && currentRsi > 35 && currentRsi < 50 && rsi(bars.slice(0, -1)) < 35) {
    longReason = `RSI reversal from oversold (${currentRsi.toFixed(0)})`;
    longScore = 6;
  }

  // Trigger 5: 3-bar momentum streak up
  if (!longReason && latest.close > prev.close && prev.close > prev2.close && barMove > 0 && prevMove > 0) {
    longReason = `3-bar bullish momentum streak`;
    longScore = 5;
  }

  // Fire long if we have a reason and RSI isn't overbought
  if (longReason && currentRsi < 75) {
    // Bonus points
    if (price > vwap) longScore = Math.min(10, longScore + 1);
    if (fastNow > slowNow) longScore = Math.min(10, longScore + 1);
    if (volumeRatio > 1) longScore = Math.min(10, longScore + 1);

    return {
      symbol,
      setup_type: 'WAVE_LONG',
      entry_price: price,
      stop_price: price - riskAmount,
      target_price: price + riskAmount * 2,
      thesis: `Wave long — ${longReason}, RSI ${currentRsi.toFixed(0)}, Vol ${volumeRatio.toFixed(1)}x`,
      entry_quality_score: longScore,
      market_regime: 'trending',
    };
  }

  // ============ SHORT TRIGGERS ============
  let shortReason: string | null = null;
  let shortScore = 0;

  // Trigger 1: EMA crossover down
  if (fastPrev >= slowPrev && fastNow < slowNow) {
    shortReason = `EMA8 crossed below EMA21`;
    shortScore = 7;
  }

  // Trigger 2: Strong bearish candle (>0.3% move down)
  if (!shortReason && barMove < -0.003) {
    shortReason = `Strong bearish candle (${(barMove * 100).toFixed(2)}%)`;
    shortScore = 5;
  }

  // Trigger 3: VWAP rejection — price hit VWAP from below and rejected
  if (!shortReason && prev.high >= vwap * 0.999 && latest.close < vwap && latest.close < prev.close) {
    shortReason = `VWAP rejection at $${vwap.toFixed(0)}`;
    shortScore = 6;
  }

  // Trigger 4: RSI reversal from overbought
  if (!shortReason && currentRsi < 65 && currentRsi > 50 && rsi(bars.slice(0, -1)) > 65) {
    shortReason = `RSI reversal from overbought (${currentRsi.toFixed(0)})`;
    shortScore = 6;
  }

  // Trigger 5: 3-bar momentum streak down
  if (!shortReason && latest.close < prev.close && prev.close < prev2.close && barMove < 0 && prevMove < 0) {
    shortReason = `3-bar bearish momentum streak`;
    shortScore = 5;
  }

  // Fire short if we have a reason and RSI isn't oversold
  if (shortReason && currentRsi > 25) {
    if (price < vwap) shortScore = Math.min(10, shortScore + 1);
    if (fastNow < slowNow) shortScore = Math.min(10, shortScore + 1);
    if (volumeRatio > 1) shortScore = Math.min(10, shortScore + 1);

    return {
      symbol,
      setup_type: 'WAVE_SHORT',
      entry_price: price,
      stop_price: price + riskAmount,
      target_price: price - riskAmount * 2,
      thesis: `Wave short — ${shortReason}, RSI ${currentRsi.toFixed(0)}, Vol ${volumeRatio.toFixed(1)}x`,
      entry_quality_score: shortScore,
      market_regime: 'trending',
    };
  }

  return null;
}

/**
 * Get current wave analysis for display (even when no signal fires).
 */
export function analyzeWave(bars: PriceBar[], vwap: number): {
  trend: 'bullish' | 'bearish' | 'neutral';
  rsi: number;
  emaSpread: number;
  volumeRatio: number;
} {
  if (bars.length < 25) {
    return { trend: 'neutral', rsi: 50, emaSpread: 0, volumeRatio: 1 };
  }

  const ema8 = ema(bars, 8);
  const ema21 = ema(bars, 21);
  const currentRsi = rsi(bars);
  const latest = bars[bars.length - 1];
  const avgVol = avgVolume(bars.slice(-20, -1));

  const fast = ema8[bars.length - 1] || 0;
  const slow = ema21[bars.length - 1] || 0;
  const spread = ((fast - slow) / slow) * 100;

  let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (fast > slow && latest.close > vwap) trend = 'bullish';
  else if (fast < slow && latest.close < vwap) trend = 'bearish';

  return {
    trend,
    rsi: currentRsi,
    emaSpread: spread,
    volumeRatio: avgVol > 0 ? latest.volume / avgVol : 1,
  };
}
