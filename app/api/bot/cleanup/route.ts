import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bot/cleanup
 * Nuclear cleanup: deletes ALL open trades. Keeps closed trade history.
 */
export async function POST() {
  const supabase = getServiceClient();

  // Delete every single open trade
  const { error, count } = await supabase
    .from('trades')
    .delete({ count: 'exact' })
    .eq('status', 'open');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    message: `Deleted ${count ?? 'all'} open trades`,
    deleted: count,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
