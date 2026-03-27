import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { runScan } from '@/bot/scan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  const now = new Date().toISOString();

  // Always log that cron fired — this is how we know it's running
  await supabase.from('bot_log').insert({
    level: 'info',
    message: `[CRON] Fired at ${now}`,
    metadata: { timestamp: now },
  });

  // Auth check
  const authHeader = req.headers.get('authorization');
  const urlSecret = req.nextUrl.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && urlSecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if bot is enabled
  const { data: control } = await supabase
    .from('bot_control')
    .select('is_running')
    .eq('id', 1)
    .single();

  if (control && !control.is_running) {
    await supabase.from('bot_log').insert({
      level: 'info',
      message: '[CRON] Bot is stopped — skipping scan',
      metadata: {},
    });
    return NextResponse.json({ status: 'skipped', reason: 'Bot is stopped' });
  }

  try {
    const results = await runScan();
    const signals = results.filter(r => r.signals_found > 0).length;
    const trades = results.filter(r => r.trade_opened).length;

    return NextResponse.json({
      status: 'completed',
      scanned: results.length,
      signals,
      trades_opened: trades,
      timestamp: now,
    });
  } catch (err) {
    await supabase.from('bot_log').insert({
      level: 'error',
      message: `[CRON] Scan failed: ${String(err)}`,
      metadata: { error: String(err) },
    });
    return NextResponse.json(
      { status: 'error', error: String(err) },
      { status: 500 }
    );
  }
}
