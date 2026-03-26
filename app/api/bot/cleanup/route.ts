import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bot/cleanup
 * Nuclear reset: deletes ALL trades (open + closed), all logs.
 * Fresh start at $100.
 */
export async function POST() {
  const supabase = getServiceClient();

  // Delete ALL trades — open and closed
  await supabase
    .from('trades')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  // Delete all bot logs
  await supabase
    .from('bot_log')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  // Delete daily summaries
  await supabase
    .from('daily_summary')
    .delete()
    .neq('date', '1900-01-01');

  return NextResponse.json({
    message: 'Full reset — $100 fresh start',
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
