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

  // Delete ALL trades — use gte on created_at to match everything
  const { error: e1 } = await supabase
    .from('trades')
    .delete()
    .gte('created_at', '2000-01-01');

  // Delete all bot logs
  const { error: e2 } = await supabase
    .from('bot_log')
    .delete()
    .gte('created_at', '2000-01-01');

  // Delete daily summaries
  const { error: e3 } = await supabase
    .from('daily_summary')
    .delete()
    .gte('date', '2000-01-01');

  const errors = [e1, e2, e3].filter(Boolean);
  if (errors.length > 0) {
    return NextResponse.json({
      message: 'Reset had errors',
      errors: errors.map(e => e?.message),
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({
    message: 'Full reset — $100 fresh start',
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
