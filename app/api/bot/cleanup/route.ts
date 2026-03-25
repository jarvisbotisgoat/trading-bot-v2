import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bot/cleanup
 * Full reset: closes ALL open trades, wipes history, starts fresh at $100k.
 */
export async function POST() {
  const supabase = getServiceClient();

  // Delete all trades (clean slate)
  const { error: deleteError } = await supabase
    .from('trades')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all rows

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Clear bot logs
  await supabase
    .from('bot_log')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  return NextResponse.json({
    message: 'Reset complete — $100k fresh start',
    trades_cleared: true,
  });
}
