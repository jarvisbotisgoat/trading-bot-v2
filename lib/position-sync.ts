import { getServiceClient } from './supabase';
import { getPositions } from './alpaca';
import { log } from '../bot/logger';

/**
 * Aggressive reconciliation: DELETE any Supabase "open" trades
 * that don't exist as actual positions on Alpaca.
 */
export async function reconcilePositions(): Promise<void> {
  const supabase = getServiceClient();

  // 1. Get real Alpaca positions
  let alpacaSymbols: Set<string>;
  try {
    const positions = await getPositions();
    alpacaSymbols = new Set(
      positions.map(p => {
        const raw = p.symbol.replace('/', '');
        if (raw.endsWith('USD') && raw.length > 3) {
          return raw.slice(0, -3) + '-USD';
        }
        return p.symbol;
      })
    );
    await log('info', `[RECONCILE] Alpaca: ${positions.length} positions (${Array.from(alpacaSymbols).join(', ') || 'none'})`, {});
  } catch (err) {
    await log('warn', `[RECONCILE] Alpaca unreachable: ${String(err)}`, {});
    return;
  }

  // 2. Get all "open" trades from Supabase (including pre-reset ghost trades)
  const { data: dbOpenTrades, error } = await supabase
    .from('trades')
    .select('id, symbol')
    .eq('status', 'open');

  if (error || !dbOpenTrades) {
    await log('warn', `[RECONCILE] DB read failed: ${error?.message || 'no data'}`, {});
    return;
  }

  // 3. DELETE stale rows — anything "open" in DB but NOT on Alpaca
  const stale = dbOpenTrades.filter(t => !alpacaSymbols.has(t.symbol));
  if (stale.length > 0) {
    const ids = stale.map(t => t.id);
    const { error: delErr } = await supabase
      .from('trades')
      .delete()
      .in('id', ids);

    if (delErr) {
      // Fallback: update to closed if delete fails
      await supabase
        .from('trades')
        .update({ status: 'closed', exit_time: new Date().toISOString(), outcome: 'breakeven', pnl_dollars: 0, pnl_percent: 0, failure_reason: 'Reconciliation' })
        .in('id', ids);
    }
    await log('info', `[RECONCILE] Cleared ${stale.length} stale trades: ${stale.map(t => t.symbol).join(', ')}`, {});
  } else {
    await log('info', `[RECONCILE] Clean — ${dbOpenTrades.length} DB trades match ${alpacaSymbols.size} Alpaca positions`, {});
  }
}

export function hasAlpacaKeys(): boolean {
  return !!(process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET);
}
