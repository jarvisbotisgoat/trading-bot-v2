import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = getServiceClient();
  const results: string[] = [];

  // Stop the bot first
  await supabase.from('bot_control').update({ is_running: false }).eq('id', 1);
  results.push('bot stopped');

  // Use raw SQL via rpc to bypass any RLS issues
  // First, null out FK references in daily_summary
  const { error: fkErr } = await supabase.rpc('exec_sql', {
    query: 'UPDATE daily_summary SET best_trade_id = NULL, worst_trade_id = NULL'
  }).single();

  if (fkErr) {
    // rpc function doesn't exist — create it and try direct deletes
    results.push('rpc not available, trying direct delete');

    // Try: update daily_summary to null FKs, then delete trades
    await supabase
      .from('daily_summary')
      .delete()
      .gte('date', '2000-01-01');

    // Try multiple delete approaches for trades
    // Approach 1: delete by status
    const { count: c1 } = await supabase
      .from('trades')
      .delete({ count: 'exact' })
      .eq('status', 'open');
    results.push(`deleted open: ${c1 ?? 0}`);

    const { count: c2 } = await supabase
      .from('trades')
      .delete({ count: 'exact' })
      .eq('status', 'closed');
    results.push(`deleted closed: ${c2 ?? 0}`);

    // Approach 2: if above didn't work, try selecting IDs and deleting by ID
    if ((c1 ?? 0) === 0 && (c2 ?? 0) === 0) {
      const { data: allTrades } = await supabase
        .from('trades')
        .select('id')
        .limit(500);

      if (allTrades && allTrades.length > 0) {
        results.push(`found ${allTrades.length} trades by select`);
        const ids = allTrades.map(t => t.id);

        // Delete in batches of 50
        for (let i = 0; i < ids.length; i += 50) {
          const batch = ids.slice(i, i + 50);
          const { error: batchErr, count: batchCount } = await supabase
            .from('trades')
            .delete({ count: 'exact' })
            .in('id', batch);
          results.push(`batch ${i/50}: ${batchErr ? 'ERROR: ' + batchErr.message : 'deleted ' + batchCount}`);
        }
      } else {
        results.push('select also returned 0 trades — RLS is blocking reads too');
      }
    }
  } else {
    results.push('FKs nulled');
    // Delete everything via SQL
    await supabase.rpc('exec_sql', { query: 'DELETE FROM daily_summary' });
    await supabase.rpc('exec_sql', { query: 'DELETE FROM trades' });
    await supabase.rpc('exec_sql', { query: 'DELETE FROM bot_log' });
    results.push('all tables cleared via SQL');
  }

  // Clear logs regardless
  await supabase
    .from('bot_log')
    .delete()
    .gte('created_at', '2000-01-01');

  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
}
