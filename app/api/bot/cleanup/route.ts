import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST() {
  // Use the EXACT same client that trades API uses successfully
  const supabase = getServiceClient();
  const results: string[] = [];

  // Stop bot
  await supabase.from('bot_control').update({ is_running: false }).eq('id', 1);
  results.push('bot stopped');

  // First: read trades to confirm we can see them
  const { data: allTrades, error: readErr } = await supabase
    .from('trades')
    .select('id, status')
    .limit(500);

  results.push(`read: ${readErr ? 'ERROR ' + readErr.message : (allTrades?.length ?? 0) + ' trades'}`);

  if (!allTrades || allTrades.length === 0) {
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Null out FK references in daily_summary first
  const { error: fkErr } = await supabase
    .from('daily_summary')
    .update({ best_trade_id: null, worst_trade_id: null })
    .not('id', 'is', null);
  results.push(`null FKs: ${fkErr ? 'ERROR ' + fkErr.message : 'ok'}`);

  // Delete daily_summary
  const { error: dsErr } = await supabase
    .from('daily_summary')
    .delete()
    .not('id', 'is', null);
  results.push(`del summary: ${dsErr ? 'ERROR ' + dsErr.message : 'ok'}`);

  // Delete trades in batches by ID
  const ids = allTrades.map(t => t.id);
  let totalDeleted = 0;

  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    const { error: bErr, count } = await supabase
      .from('trades')
      .delete({ count: 'exact' })
      .in('id', batch);

    if (bErr) {
      results.push(`batch ${i}: ERROR ${bErr.message}`);
      break;
    }
    totalDeleted += count ?? 0;
  }
  results.push(`deleted ${totalDeleted} trades`);

  // Delete logs
  await supabase.from('bot_log').delete().not('id', 'is', null);

  // Verify
  const { data: check } = await supabase.from('trades').select('id').limit(1);
  results.push(`remaining: ${check?.length ?? '?'}`);

  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
}
