import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bot/cleanup
 * Closes all duplicate open trades (keeps max 1 per symbol)
 * and closes all trades for removed symbols (XRP, DOGE, AVAX).
 */
export async function POST() {
  const supabase = getServiceClient();
  const removedSymbols = ['XRP-USD', 'DOGE-USD', 'AVAX-USD'];

  // Get all open trades
  const { data: openTrades, error } = await supabase
    .from('trades')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!openTrades || openTrades.length === 0) {
    return NextResponse.json({ message: 'No open trades to clean up', closed: 0 });
  }

  const toClose: string[] = [];
  const keepOnePerSymbol = new Set<string>();

  for (const trade of openTrades) {
    // Close all removed symbol trades
    if (removedSymbols.includes(trade.symbol)) {
      toClose.push(trade.id);
      continue;
    }

    // Keep only the most recent trade per symbol (list is sorted desc)
    if (keepOnePerSymbol.has(trade.symbol)) {
      toClose.push(trade.id);
    } else {
      keepOnePerSymbol.add(trade.symbol);
    }
  }

  if (toClose.length === 0) {
    return NextResponse.json({ message: 'No duplicates found', closed: 0 });
  }

  // Close all duplicate/removed trades
  const { error: updateError } = await supabase
    .from('trades')
    .update({
      status: 'closed',
      exit_time: new Date().toISOString(),
      exit_price: 0,
      outcome: 'breakeven',
      pnl_dollars: 0,
      pnl_percent: 0,
      failure_reason: 'Cleanup — duplicate or removed symbol',
    })
    .in('id', toClose);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    message: `Cleaned up ${toClose.length} trades`,
    closed: toClose.length,
    kept: keepOnePerSymbol.size,
    keptSymbols: Array.from(keepOnePerSymbol),
  });
}
