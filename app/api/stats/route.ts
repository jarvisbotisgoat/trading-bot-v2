import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getServiceClient();

  // Fetch all closed trades for cumulative stats
  const { data: closedTrades, error: closedErr } = await supabase
    .from('trades')
    .select('pnl_dollars, pnl_percent, outcome, exit_time, entry_time')
    .eq('status', 'closed');

  // Fetch open trade count
  const { data: openTrades, error: openErr } = await supabase
    .from('trades')
    .select('id')
    .eq('status', 'open');

  if (closedErr || openErr) {
    return NextResponse.json(
      { error: closedErr?.message || openErr?.message },
      { status: 500 }
    );
  }

  const closed = closedTrades || [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  // All-time stats
  const totalPnl = closed.reduce((sum, t) => sum + (t.pnl_dollars || 0), 0);
  const wins = closed.filter((t) => t.outcome === 'win').length;
  const losses = closed.filter((t) => t.outcome === 'loss').length;
  const totalDecided = wins + losses;
  const winRate = totalDecided > 0 ? wins / totalDecided : 0;

  // Today stats
  const todayTrades = closed.filter(
    (t) => t.exit_time && t.exit_time >= todayISO
  );
  const todayPnl = todayTrades.reduce(
    (sum, t) => sum + (t.pnl_dollars || 0),
    0
  );

  // Max drawdown (cumulative P/L curve)
  let peak = 0;
  let maxDrawdown = 0;
  let cumulative = 0;
  // Sort by exit_time for proper drawdown calc
  const sorted = [...closed]
    .filter((t) => t.exit_time)
    .sort((a, b) => (a.exit_time! > b.exit_time! ? 1 : -1));
  for (const t of sorted) {
    cumulative += t.pnl_dollars || 0;
    if (cumulative > peak) peak = cumulative;
    const dd = peak - cumulative;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return NextResponse.json({
    totalPnl,
    todayPnl,
    winRate,
    wins,
    losses,
    totalTrades: closed.length,
    openTrades: openTrades?.length || 0,
    maxDrawdown,
    balance: 100 + totalPnl,
  });
}
