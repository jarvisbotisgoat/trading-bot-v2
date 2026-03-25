import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { runScan } from '@/bot/scan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

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
    const signals = results.filter(r => r.signals_found > 0);
    return NextResponse.json({
      status: 'completed',
      scanned: results.length,
      signals: signals.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: String(err) },
      { status: 500 }
    );
  }
}
