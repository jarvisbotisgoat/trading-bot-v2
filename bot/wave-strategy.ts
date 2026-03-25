import type { PriceBar, SetupSignal } from '../lib/types';
import { getServiceClient } from '../lib/supabase';

/**
 * Crypto Wave Rider — Smart Edition
 *
 * Uses confluence scoring: each indicator adds points.
 * Needs 3+ points to enter a trade (not just one trigger).
 * Learns from recent trades — avoids setups that keep losing,
 * leans into setups that keep winning.
 *
 * Trades both LONG and SHORT on any crypto.
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
  let gains = 0, losses = 0;
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

// How many of the last N closed trades were wins for this setup type?
async function getRecentWinRate(setupType: string): Promise<{ wins: number; losses: number; avgPnl: number }> {
  try {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from('trades')
      .select('outcome, pnl_percent')
      .eq('status', 'closed')
      .eq('setup_type', setupType)
      .order('exit_time', { ascending: false })
      .limit(10);

    if (!data || data.length === 0) return { wins: 0, losses: 0, avgPnl: 0 };

    const wins = data.filter((t: { outcome: string }) => t.outcome === 'win').length;
    const losses = data.filter((t: { outcome: string }) => t.outcome === 'loss').length;
    const avgPnl = data.reduce((sum: number, t: { pnl_percent: number | null }) => sum + (t.pnl_percent || 0), 0) / data.length;

    return { wins, losses, avgPnl };
  } catch {
    return { wins: 0, losses: 0, avgPnl: 0 };
  }
}

interface WaveInput {
  symbol: string;
  bars: PriceBar[];
  vwap: number;
}

export async function detectWave(input: WaveInput): Promise<SetupSignal | null> {
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
  const barMove = (latest.close - latest.open) / latest.open;
  const volumeRatio = avgVol > 0 ? latest.volume / avgVol : 1;

  // ============ CONFLUENCE SCORING: LONG ============
  let longPoints = 0;
  const longReasons: string[] = [];

  // +2: EMA crossover just happened
  if (fastPrev <= slowPrev && fastNow > slowNow) {
    longPoints += 2;
    longReasons.push('EMA cross up');
  }

  // +1: EMA8 already above EMA21 (trend aligned)
  if (fastNow > slowNow) {
    longPoints += 1;
    longReasons.push('EMA trend up');
  }

  // +1: Price above VWAP
  if (price > vwap) {
    longPoints += 1;
    longReasons.push('above VWAP');
  }

  // +1: RSI in healthy zone (not overbought, not flat)
  if (currentRsi > 40 && currentRsi < 65) {
    longPoints += 1;
    longReasons.push(`RSI ${currentRsi.toFixed(0)}`);
  }

  // +1: Volume above average
  if (volumeRatio > 1.0) {
    longPoints += 1;
    longReasons.push(`vol ${volumeRatio.toFixed(1)}x`);
  }

  // +1: Last candle was green
  if (barMove > 0) {
    longPoints += 1;
    longReasons.push('green candle');
  }

  // +1: 2-bar momentum (last 2 candles moving up)
  if (latest.close > prev.close && prev.close > prev2.close) {
    longPoints += 1;
    longReasons.push('momentum streak');
  }

  // -2: RSI overbought — too late to enter
  if (currentRsi > 70) {
    longPoints -= 2;
  }

  // ============ CONFLUENCE SCORING: SHORT ============
  let shortPoints = 0;
  const shortReasons: string[] = [];

  if (fastPrev >= slowPrev && fastNow < slowNow) {
    shortPoints += 2;
    shortReasons.push('EMA cross down');
  }

  if (fastNow < slowNow) {
    shortPoints += 1;
    shortReasons.push('EMA trend down');
  }

  if (price < vwap) {
    shortPoints += 1;
    shortReasons.push('below VWAP');
  }

  if (currentRsi > 35 && currentRsi < 60) {
    shortPoints += 1;
    shortReasons.push(`RSI ${currentRsi.toFixed(0)}`);
  }

  if (volumeRatio > 1.0) {
    shortPoints += 1;
    shortReasons.push(`vol ${volumeRatio.toFixed(1)}x`);
  }

  if (barMove < 0) {
    shortPoints += 1;
    shortReasons.push('red candle');
  }

  if (latest.close < prev.close && prev.close < prev2.close) {
    shortPoints += 1;
    shortReasons.push('momentum streak');
  }

  if (currentRsi < 30) {
    shortPoints -= 2;
  }

  // ============ DECISION ============
  // Need at least 3 confluence points to trade
  const ENTRY_THRESHOLD = 3;

  // Pick the stronger direction
  const goLong = longPoints >= ENTRY_THRESHOLD && longPoints > shortPoints;
  const goShort = shortPoints >= ENTRY_THRESHOLD && shortPoints > longPoints;

  if (!goLong && !goShort) return null;

  const direction = goLong ? 'WAVE_LONG' : 'WAVE_SHORT';
  const points = goLong ? longPoints : shortPoints;
  const reasons = goLong ? longReasons : shortReasons;

  // ============ LEARNING: check recent performance ============
  const history = await getRecentWinRate(direction);

  // If this setup has lost 3+ in a row, tighten the threshold — need extra confluence
  if (history.losses >= 3 && history.wins === 0) {
    if (points < ENTRY_THRESHOLD + 2) return null; // need 5+ points if on a losing streak
  }

  // If winning streak, slightly loosen risk (wider target)
  const onWinStreak = history.wins >= 3 && history.losses <= 1;

  // ============ RISK MANAGEMENT ============
  // Base risk: 0.3% of price (conservative). Widen to 0.5% if on win streak.
  const riskPct = onWinStreak ? 0.005 : 0.003;
  const riskAmount = price * riskPct;

  // Reward: 2:1 base, 2.5:1 if strong confluence or win streak
  const rrRatio = (points >= 5 || onWinStreak) ? 2.5 : 2;

  const entry = price;
  const stop = goLong ? entry - riskAmount : entry + riskAmount;
  const target = goLong ? entry + riskAmount * rrRatio : entry - riskAmount * rrRatio;

  const historyNote = history.wins + history.losses > 0
    ? ` | Track: ${history.wins}W/${history.losses}L`
    : ' | First trade';

  return {
    symbol,
    setup_type: direction as 'WAVE_LONG' | 'WAVE_SHORT',
    entry_price: entry,
    stop_price: stop,
    target_price: target,
    thesis: `${direction === 'WAVE_LONG' ? 'Long' : 'Short'} — ${reasons.join(', ')} (${points} pts)${historyNote}`,
    entry_quality_score: Math.min(10, points),
    market_regime: 'trending',
  };
}

/**
 * Wave analysis for display — always returned even with no trade signal.
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
