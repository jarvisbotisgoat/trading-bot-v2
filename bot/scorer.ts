import { getServiceClient } from '../lib/supabase';
import type { Trade, DailySummary } from '../lib/types';
import { log } from './logger';
// Telegram alerts disabled — user wants morning briefs only

export async function runDailyScoring(): Promise<void> {
  const supabase = getServiceClient();
  const today = new Date().toISOString().split('T')[0];

  await log('info', 'Running daily scoring and summary');

  // Fetch today's closed trades
  const { data: trades, error } = await supabase
    .from('trades')
    .select('*')
    .eq('status', 'closed')
    .gte('exit_time', `${today}T00:00:00`)
    .lte('exit_time', `${today}T23:59:59`);

  if (error) {
    await log('error', 'Failed to fetch trades for scoring', { error: error.message });
    return;
  }

  const closedTrades = (trades || []) as Trade[];

  if (closedTrades.length === 0) {
    await log('info', 'No trades to score today');
    return;
  }

  // Calculate daily stats
  const wins = closedTrades.filter((t) => t.outcome === 'win');
  const losses = closedTrades.filter((t) => t.outcome === 'loss');
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl_dollars || 0), 0);
  const winRate = closedTrades.length > 0 ? wins.length / closedTrades.length : 0;

  // Find best and worst trades
  const sorted = [...closedTrades].sort(
    (a, b) => (a.pnl_dollars || 0) - (b.pnl_dollars || 0)
  );
  const worstTrade = sorted[0];
  const bestTrade = sorted[sorted.length - 1];

  // Calculate max drawdown (simple: largest single-trade loss)
  const maxDrawdown = Math.min(
    0,
    Math.min(...closedTrades.map((t) => t.pnl_dollars || 0))
  );

  // Group by setup and update scores
  const setupGroups: Record<string, Trade[]> = {};
  for (const trade of closedTrades) {
    if (!setupGroups[trade.setup_type]) setupGroups[trade.setup_type] = [];
    setupGroups[trade.setup_type].push(trade);
  }

  const learnings: string[] = [];

  for (const [setupType, setupTrades] of Object.entries(setupGroups)) {
    const setupWins = setupTrades.filter((t) => t.outcome === 'win');
    const setupWinRate = setupTrades.length > 0 ? setupWins.length / setupTrades.length : 0;
    const avgRR =
      setupTrades.length > 0
        ? setupTrades.reduce((sum, t) => {
            const risk = Math.abs(t.entry_price - t.stop_price);
            const reward = t.pnl_dollars || 0;
            return sum + (risk > 0 ? reward / risk : 0);
          }, 0) / setupTrades.length
        : 0;

    // Score formula: weighted combo of win rate and avg R:R
    const score = setupWinRate * 5 + Math.max(0, avgRR) * 2.5;

    // Update setups table
    const { error: setupError } = await supabase
      .from('setups')
      .update({
        score: Math.round(score * 10) / 10,
        win_rate: Math.round(setupWinRate * 100) / 100,
        avg_rr: Math.round(avgRR * 100) / 100,
        trade_count: setupTrades.length,
        last_updated: new Date().toISOString(),
      })
      .eq('name', setupType);

    if (setupError) {
      await log('error', `Failed to update setup ${setupType}`, {
        error: setupError.message,
      });
    }

    learnings.push(
      `${setupType}: ${setupTrades.length} trades, ${(setupWinRate * 100).toFixed(0)}% win rate, ${avgRR.toFixed(1)}R avg`
    );
  }

  // Most common failure reasons
  const failures = closedTrades
    .filter((t) => t.failure_reason)
    .map((t) => t.failure_reason!);
  const failureCounts: Record<string, number> = {};
  for (const f of failures) {
    failureCounts[f] = (failureCounts[f] || 0) + 1;
  }
  const topFailures = Object.entries(failureCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => `${reason} (${count}x)`);

  // Build notes
  const notesLines = [
    `Today: ${closedTrades.length} trades, ${wins.length}W/${losses.length}L, $${totalPnl.toFixed(0)} P/L`,
    ...learnings,
    topFailures.length > 0
      ? `Top mistakes: ${topFailures.join(', ')}`
      : 'No notable failure patterns',
  ];
  const notes = notesLines.join('\n');

  // Write daily summary
  const summary: DailySummary = {
    date: today,
    total_pnl: totalPnl,
    win_count: wins.length,
    loss_count: losses.length,
    win_rate: winRate,
    max_drawdown: maxDrawdown,
    best_trade_id: bestTrade?.id || null,
    worst_trade_id: worstTrade?.id || null,
    notes,
  };

  const { error: summaryError } = await supabase
    .from('daily_summary')
    .upsert(summary, { onConflict: 'date' });

  if (summaryError) {
    await log('error', 'Failed to write daily summary', {
      error: summaryError.message,
    });
  }

  await log('info', 'Daily scoring complete', { summary });

  // No Telegram recap — morning briefing is the only message
}
