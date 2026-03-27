import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { runScan } from '@/bot/scan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const urlSecret = req.nextUrl.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && urlSecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();

  // Check if bot is enabled
  const { data: control } = await supabase
    .from('bot_control')
    .select('is_running')
    .eq('id', 1)
    .single();

  if (control && !control.is_running) {
    return NextResponse.json({ status: 'skipped', reason: 'Bot is stopped' });
  }

  try {
    const results = await runScan();
    const signals = results.filter(r => r.signals_found > 0);
    const trades = results.filter(r => r.trade_opened);

    return NextResponse.json({
      status: 'completed',
      scanned: results.length,
      signals: signals.length,
      trades_opened: trades.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Log the error so it appears in the feed
    await supabase.from('bot_log').insert({
      level: 'error',
      message: `Cron scan error: ${String(err)}`,
      metadata: { error: String(err) },
    });
    return NextResponse.json(
      { status: 'error', error: String(err) },
      { status: 500 }
    );
  }
}
