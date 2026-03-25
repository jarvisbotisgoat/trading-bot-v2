import type { PriceBar, SetupSignal } from '../lib/types';

/**
 * BTC Wave Rider Strategy
 *
 * Catches momentum waves up AND down using:
 * - EMA crossover (8 EMA vs 21 EMA) for direction
 * - RSI for overbought/oversold confirmation
 * - Volume surge detection
 * - Price action relative to VWAP
 *
 * Goes LONG when momentum shifts bullish, SHORT when bearish.
 * Tight stops, 2:1 reward-to-risk.
 */

function ema(bars: PriceBar[], period: number): number[] {
  const multiplier = 2 / (period + 1);
  const result: number[] = [];

  // Seed with SMA
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
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
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
  const avgVol = avgVolume(bars.slice(-20, -1));

  const fastNow = ema8[bars.length - 1];
  const fastPrev = ema8[bars.length - 2];
  const slowNow = ema21[bars.length - 1];
  const slowPrev = ema21[bars.length - 2];

  if (!fastNow || !fastPrev || !slowNow || !slowPrev) return null;

  const volumeSurge = latest.volume > avgVol * 1.1;
  const price = latest.close;

  // Calculate risk as 0.5% of price for tight crypto stops
  const riskAmount = price * 0.005;

  // === WAVE LONG ===
  // EMA8 crosses above EMA21, price above VWAP, RSI not overbought, volume present
  const bullishCross = fastPrev <= slowPrev && fastNow > slowNow;
  const bullishMomentum = fastNow > slowNow && price > vwap && latest.close > prev.close;

  if ((bullishCross || (bullishMomentum && volumeSurge)) && currentRsi < 70 && currentRsi > 35) {
    const entry = price;
    const stop = entry - riskAmount;
    const target = entry + riskAmount * 2;

    return {
      symbol,
      setup_type: 'WAVE_LONG',
      entry_price: entry,
      stop_price: stop,
      target_price: target,
      thesis: bullishCross
        ? `Wave long — EMA8 crossed above EMA21 at $${price.toFixed(0)}, RSI ${currentRsi.toFixed(0)}, above VWAP`
        : `Wave long — bullish momentum with volume surge at $${price.toFixed(0)}, RSI ${currentRsi.toFixed(0)}`,
      entry_quality_score: Math.min(10, Math.round(
        (bullishCross ? 3 : 1) +
        (volumeSurge ? 2 : 0) +
        (price > vwap ? 2 : 0) +
        (currentRsi > 40 && currentRsi < 60 ? 2 : 1)
      )),
      market_regime: 'trending',
    };
  }

  // === WAVE SHORT ===
  // EMA8 crosses below EMA21, price below VWAP, RSI not oversold, volume present
  const bearishCross = fastPrev >= slowPrev && fastNow < slowNow;
  const bearishMomentum = fastNow < slowNow && price < vwap && latest.close < prev.close;

  if ((bearishCross || (bearishMomentum && volumeSurge)) && currentRsi > 30 && currentRsi < 65) {
    const entry = price;
    const stop = entry + riskAmount;
    const target = entry - riskAmount * 2;

    return {
      symbol,
      setup_type: 'WAVE_SHORT',
      entry_price: entry,
      stop_price: stop,
      target_price: target,
      thesis: bearishCross
        ? `Wave short — EMA8 crossed below EMA21 at $${price.toFixed(0)}, RSI ${currentRsi.toFixed(0)}, below VWAP`
        : `Wave short — bearish momentum with volume surge at $${price.toFixed(0)}, RSI ${currentRsi.toFixed(0)}`,
      entry_quality_score: Math.min(10, Math.round(
        (bearishCross ? 3 : 1) +
        (volumeSurge ? 2 : 0) +
        (price < vwap ? 2 : 0) +
        (currentRsi > 40 && currentRsi < 60 ? 2 : 1)
      )),
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
