import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { runScan } from '@/bot/scan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60s for scanning all symbols

export async function GET(request: Request) {
  // Verify cron secret or allow manual trigger
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // If CRON_SECRET is set, verify it (Vercel cron sends this automatically)
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if bot is enabled
  const supabase = getServiceClient();
  const { data: control } = await supabase
    .from('bot_control')
    .select('is_running')
    .eq('id', 1)
    .single();

  if (!control?.is_running) {
    return NextResponse.json({ status: 'skipped', reason: 'Bot is stopped' });
  }

  try {
    const results = await runScan();
    return NextResponse.json({ status: 'completed', results });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: String(err) },
      { status: 500 }
    );
  }
}
