import { getServiceClient } from './supabase';
import { getPositions } from './alpaca';


/**
 * Reconcile Supabase trades with actual Alpaca positions.
 * Closes stale DB rows that no longer exist on Alpaca.
 * Called at the start of every scan to prevent phantom "open trade" blocks.
 */
export async function reconcilePositions(): Promise<string[]> {
  const supabase = getServiceClient();
  const actions: string[] = [];

  // 1. Get real Alpaca positions
  let alpacaSymbols: Set<string>;
  try {
    const positions = await getPositions();
    // Alpaca returns symbols like "BTCUSD" — convert to our "BTC-USD" format
    alpacaSymbols = new Set(
      positions.map(p => {
        // Handle both "BTCUSD" and "BTC/USD" formats
        const raw = p.symbol.replace('/', '');
        // Insert dash before USD: BTCUSD -> BTC-USD
        if (raw.endsWith('USD') && raw.length > 3) {
          return raw.slice(0, -3) + '-USD';
        }
        return p.symbol;
      })
    );
    actions.push(`alpaca: ${positions.length} positions (${Array.from(alpacaSymbols).join(', ') || 'none'})`);
  } catch (err) {
    // If Alpaca is unreachable, don't touch anything
    actions.push(`alpaca unreachable: ${String(err)}`);
    return actions;
  }

  // 2. Get all "open" trades from Supabase
  const { data: dbOpenTrades, error } = await supabase
    .from('trades')
    .select('id, symbol, created_at')
    .eq('status', 'open');

  if (error || !dbOpenTrades) {
    actions.push(`db read error: ${error?.message || 'no data'}`);
    return actions;
  }

  actions.push(`db: ${dbOpenTrades.length} open trades`);

  // 3. Close stale DB rows — trades marked "open" in DB but NOT on Alpaca
  const stale = dbOpenTrades.filter(t => !alpacaSymbols.has(t.symbol));

  if (stale.length > 0) {
    for (const trade of stale) {
      const { error: closeErr } = await supabase
        .from('trades')
        .update({
          status: 'closed',
          exit_time: new Date().toISOString(),
          outcome: 'breakeven',
          pnl_dollars: 0,
          pnl_percent: 0,
          failure_reason: 'Position closed on Alpaca (reconciliation)',
        })
        .eq('id', trade.id);

      if (closeErr) {
        actions.push(`failed to close stale ${trade.symbol}: ${closeErr.message}`);
      }
    }
    actions.push(`closed ${stale.length} stale DB trades: ${stale.map(t => t.symbol).join(', ')}`);
  }

  return actions;
}

/**
 * Check if Alpaca keys are configured.
 */
export function hasAlpacaKeys(): boolean {
  return !!(process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET);
}
