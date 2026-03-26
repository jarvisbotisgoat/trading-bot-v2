import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bot/cleanup
 * Cleans out stale open trades:
 * - Deletes ALL open trades for removed symbols (XRP, DOGE, AVAX)
 * - Keeps only the most recent open trade per active symbol (BTC, ETH, SOL)
 * - Preserves all closed trade history (wins/losses)
 */
export async function POST() {
  const supabase = getServiceClient();
  const removedSymbols = ['XRP-USD', 'DOGE-USD', 'AVAX-USD'];

  // 1. Delete all open trades for removed symbols
  const { error: removeErr } = await supabase
    .from('trades')
    .delete()
    .eq('status', 'open')
    .in('symbol', removedSymbols);

  if (removeErr) {
    return NextResponse.json({ error: removeErr.message }, { status: 500 });
  }

  // 2. For active symbols, keep only the most recent open trade, delete the rest
  const activeSymbols = ['BTC-USD', 'ETH-USD', 'SOL-USD'];
  let duplicatesDeleted = 0;

  for (const symbol of activeSymbols) {
    // Get all open trades for this symbol, newest first
    const { data: openTrades } = await supabase
      .from('trades')
      .select('id')
      .eq('symbol', symbol)
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (openTrades && openTrades.length > 1) {
      // Keep the first (newest), delete the rest
      const toDelete = openTrades.slice(1).map((t) => t.id);
      await supabase
        .from('trades')
        .delete()
        .in('id', toDelete);
      duplicatesDeleted += toDelete.length;
    }
  }

  // 3. Also delete closed trades for removed symbols (they're noise)
  await supabase
    .from('trades')
    .delete()
    .eq('status', 'closed')
    .in('symbol', removedSymbols);

  // Count what's left
  const { data: remaining } = await supabase
    .from('trades')
    .select('id, status, symbol')
    .order('created_at', { ascending: false });

  const openCount = (remaining || []).filter((t) => t.status === 'open').length;
  const closedCount = (remaining || []).filter((t) => t.status === 'closed').length;

  return NextResponse.json({
    message: 'Cleanup complete',
    duplicatesDeleted,
    removedSymbolsCleared: removedSymbols,
    remaining: { open: openCount, closed: closedCount },
  });
}
