import type { Trade, PriceBar } from './types';

const STARTING_BALANCE = 100;
const POSITION_ALLOCATION = 0.30;

export { STARTING_BALANCE, POSITION_ALLOCATION };

/**
 * Extract position sizing info from trade.notes JSON.
 * Falls back to default allocation if notes are missing/corrupted.
 */
export function getPositionInfo(trade: Trade): { position_size: number; quantity: number } {
  if (trade.notes) {
    try {
      const info = JSON.parse(trade.notes);
      if (info.position_size && info.quantity) return info;
    } catch { /* fall through */ }
  }
  const ps = STARTING_BALANCE * POSITION_ALLOCATION;
  return { position_size: ps, quantity: ps / trade.entry_price };
}

/**
 * Compute VWAP from price bars.
 */
export function computeVWAP(bars: PriceBar[]): number {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumulativeTPV += typicalPrice * bar.volume;
    cumulativeVolume += bar.volume;
  }
  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0;
}

/**
 * The cutoff date for filtering out pre-reset trades.
 * All queries should filter trades created after this date.
 */
export const RESET_CUTOFF = process.env.RESET_CUTOFF_DATE || '2026-03-27';
