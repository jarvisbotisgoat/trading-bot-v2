import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = getServiceClient();
  const results: string[] = [];

  // Check: can we even read trades?
  const { data: trades, error: readErr } = await supabase
    .from('trades')
    .select('id, status')
    .limit(5);

  results.push(`read test: ${readErr ? 'ERROR: ' + readErr.message : (trades?.length ?? 0) + ' rows found'}`);

  // Check: what key are we using?
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY !== 'placeholder';
  results.push(`service key set: ${hasServiceKey}`);

  if (!trades || trades.length === 0) {
    results.push('no trades to delete');
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Try deleting ONE trade by ID to test
  const testId = trades[0].id;
  const { error: delErr, count } = await supabase
    .from('trades')
    .delete({ count: 'exact' })
    .eq('id', testId);

  results.push(`delete test (id=${testId}): ${delErr ? 'ERROR: ' + delErr.message + ' code=' + delErr.code + ' hint=' + delErr.hint : 'deleted ' + count}`);

  // If single delete worked, delete everything
  if (!delErr) {
    // Stop bot first
    await supabase.from('bot_control').update({ is_running: false }).eq('id', 1);

    // Delete daily_summary first (FK refs)
    const { error: e1, count: c1 } = await supabase
      .from('daily_summary')
      .delete({ count: 'exact' })
      .gte('date', '2000-01-01');
    results.push(`daily_summary: ${e1 ? 'ERROR: ' + e1.message : 'deleted ' + c1}`);

    // Delete all trades
    const { error: e2, count: c2 } = await supabase
      .from('trades')
      .delete({ count: 'exact' })
      .gte('created_at', '2000-01-01');
    results.push(`trades: ${e2 ? 'ERROR: ' + e2.message : 'deleted ' + c2}`);

    // Delete logs
    const { error: e3, count: c3 } = await supabase
      .from('bot_log')
      .delete({ count: 'exact' })
      .gte('created_at', '2000-01-01');
    results.push(`bot_log: ${e3 ? 'ERROR: ' + e3.message : 'deleted ' + c3}`);

    // Verify
    const { count: remaining } = await supabase
      .from('trades')
      .select('id', { count: 'exact', head: true });
    results.push(`trades remaining: ${remaining}`);
  }

  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
}
