import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Using GET because POST endpoints mysteriously can't read from Supabase
// while GET endpoints (like /api/trades) work fine with the same client
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('confirm') !== 'yes') {
    return NextResponse.json({ error: 'Add ?confirm=yes to execute reset' });
  }

  const supabase = getServiceClient();
  const results: string[] = [];

  // Stop bot
  await supabase.from('bot_control').update({ is_running: false }).eq('id', 1);
  results.push('bot stopped');

  // Read trades
  const { data: allTrades, error: readErr } = await supabase
    .from('trades')
    .select('id')
    .limit(500);

  results.push(`read: ${readErr ? 'ERROR ' + readErr.message : (allTrades?.length ?? 0) + ' trades'}`);

  if (allTrades && allTrades.length > 0) {
    // Null FK refs
    await supabase
      .from('daily_summary')
      .update({ best_trade_id: null, worst_trade_id: null })
      .not('id', 'is', null);

    // Delete summaries
    await supabase.from('daily_summary').delete().not('id', 'is', null);

    // Delete trades in batches
    const ids = allTrades.map(t => t.id);
    let deleted = 0;
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20);
      const { count } = await supabase
        .from('trades')
        .delete({ count: 'exact' })
        .in('id', batch);
      deleted += count ?? 0;
    }
    results.push(`deleted: ${deleted} trades`);

    // Delete logs
    await supabase.from('bot_log').delete().not('id', 'is', null);
    results.push('logs cleared');
  }

  // Verify
  const { data: check } = await supabase.from('trades').select('id').limit(1);
  results.push(`remaining: ${check?.length ?? '?'}`);

  return NextResponse.json({ results }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

// Keep POST as a redirect to GET
export async function POST() {
  return NextResponse.json({ redirect: true, message: 'Use GET with ?confirm=yes' });
}
