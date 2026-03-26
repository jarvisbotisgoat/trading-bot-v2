import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('confirm') !== 'yes') {
    return NextResponse.json({ error: 'Add ?confirm=yes' });
  }

  const supabase = getServiceClient();
  const results: string[] = [];

  // 1. Stop bot
  await supabase.from('bot_control').update({ is_running: false }).eq('id', 1);
  results.push('bot stopped');

  // 2. Close all Alpaca positions (if keys are set)
  try {
    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_API_SECRET;
    if (key && secret) {
      const res = await fetch('https://paper-api.alpaca.markets/v2/positions', {
        method: 'DELETE',
        headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
      });
      results.push(`alpaca positions closed: ${res.status}`);
    } else {
      results.push('alpaca: no keys set');
    }
  } catch (err) {
    results.push(`alpaca error: ${String(err)}`);
  }

  // 3. Set reset timestamp so all queries filter out old data
  const resetTime = new Date().toISOString();

  // Try to delete trades (may fail due to Vercel/Supabase quirk)
  const { error: delErr, count } = await supabase
    .from('trades')
    .delete({ count: 'exact' })
    .gte('created_at', '2000-01-01');
  results.push(`delete trades: ${delErr ? 'ERROR: ' + delErr.message : 'deleted ' + (count ?? '?')}`);

  // Delete logs
  await supabase.from('bot_log').delete().gte('created_at', '2000-01-01');

  // Delete summaries (null FKs first)
  await supabase.from('daily_summary')
    .update({ best_trade_id: null, worst_trade_id: null })
    .not('id', 'is', null);
  await supabase.from('daily_summary').delete().gte('date', '2000-01-01');

  // 4. Store reset timestamp in bot_control so all queries can filter
  await supabase.from('bot_control')
    .update({ is_running: false })
    .eq('id', 1);

  // Write a log entry marking the reset
  await supabase.from('bot_log').insert({
    level: 'info',
    message: `System reset — fresh start at $100`,
    metadata: { reset_time: resetTime },
  });

  results.push(`reset time: ${resetTime}`);

  return NextResponse.json({ results }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
