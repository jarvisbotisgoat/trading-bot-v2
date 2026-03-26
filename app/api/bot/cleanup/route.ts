import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST() {
  const results: string[] = [];

  // Try BOTH clients — service key AND anon key
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  results.push(`url: ${url ? url.substring(0, 30) + '...' : 'MISSING'}`);
  results.push(`anon key: ${anonKey ? 'set (' + anonKey.length + ' chars)' : 'MISSING'}`);
  results.push(`service key: ${serviceKey ? 'set (' + serviceKey.length + ' chars)' : 'MISSING'}`);

  // Try with service key first
  const service = createClient(url, serviceKey);
  const { data: svcRead, error: svcErr } = await service
    .from('trades')
    .select('id')
    .limit(3);
  results.push(`service read: ${svcErr ? 'ERROR: ' + svcErr.message : (svcRead?.length ?? 0) + ' rows'}`);

  // Try with anon key
  const anon = createClient(url, anonKey);
  const { data: anonRead, error: anonErr } = await anon
    .from('trades')
    .select('id')
    .limit(3);
  results.push(`anon read: ${anonErr ? 'ERROR: ' + anonErr.message : (anonRead?.length ?? 0) + ' rows'}`);

  // Use whichever client can read
  const supabase = (svcRead && svcRead.length > 0) ? service : anon;
  const clientType = (svcRead && svcRead.length > 0) ? 'service' : 'anon';
  results.push(`using: ${clientType} client`);

  // Stop bot
  await supabase.from('bot_control').update({ is_running: false }).eq('id', 1);

  // Delete daily_summary FK refs first
  await supabase.from('daily_summary').delete().gte('date', '2000-01-01');

  // Delete ALL trades
  const { error: delErr, count } = await supabase
    .from('trades')
    .delete({ count: 'exact' })
    .gte('created_at', '2000-01-01');
  results.push(`delete trades: ${delErr ? 'ERROR: ' + delErr.message : 'deleted ' + count}`);

  // Delete logs
  await supabase.from('bot_log').delete().gte('created_at', '2000-01-01');

  // Verify
  const { data: remaining } = await supabase.from('trades').select('id').limit(1);
  results.push(`remaining: ${remaining?.length ?? '?'}`);

  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
}
