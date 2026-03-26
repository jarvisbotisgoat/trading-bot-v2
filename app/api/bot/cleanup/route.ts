import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = getServiceClient();
  const results: string[] = [];

  // Step 1: Delete daily_summary FIRST (has FK references to trades)
  const { error: e1, count: c1 } = await supabase
    .from('daily_summary')
    .delete({ count: 'exact' })
    .gte('date', '2000-01-01');
  results.push(`daily_summary: ${e1 ? 'ERROR: ' + e1.message : 'deleted ' + (c1 ?? '?')}`);

  // Step 2: Now delete trades (no more FK blocking)
  const { error: e2, count: c2 } = await supabase
    .from('trades')
    .delete({ count: 'exact' })
    .gte('created_at', '2000-01-01');
  results.push(`trades: ${e2 ? 'ERROR: ' + e2.message : 'deleted ' + (c2 ?? '?')}`);

  // Step 3: Delete bot logs
  const { error: e3, count: c3 } = await supabase
    .from('bot_log')
    .delete({ count: 'exact' })
    .gte('created_at', '2000-01-01');
  results.push(`bot_log: ${e3 ? 'ERROR: ' + e3.message : 'deleted ' + (c3 ?? '?')}`);

  // Step 4: Stop the bot so cron doesn't immediately recreate trades
  await supabase
    .from('bot_control')
    .update({ is_running: false })
    .eq('id', 1);

  // Step 5: Verify trades are actually gone
  const { data: remaining } = await supabase
    .from('trades')
    .select('id', { count: 'exact', head: true });

  results.push(`trades remaining: ${remaining?.length ?? 'unknown'}`);

  return NextResponse.json({
    message: 'Reset complete',
    results,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
