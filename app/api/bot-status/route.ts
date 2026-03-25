import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getServiceClient();

  // Check last bot_log entry to determine status
  const { data: lastLog, error: logError } = await supabase
    .from('bot_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const { data: openTrades, error: tradesError } = await supabase
    .from('trades')
    .select('id')
    .eq('status', 'open');

  if (logError && tradesError) {
    return NextResponse.json({
      status: 'idle',
      lastRun: null,
      openTrades: 0,
      message: 'Unable to reach database',
    });
  }

  const lastRunTime = lastLog?.created_at || null;
  const isRecent =
    lastRunTime &&
    Date.now() - new Date(lastRunTime).getTime() < 5 * 60 * 1000; // within 5 min
  const hasError = lastLog?.level === 'error';

  return NextResponse.json({
    status: hasError ? 'error' : isRecent ? 'active' : 'idle',
    lastRun: lastRunTime,
    openTrades: openTrades?.length || 0,
    message: lastLog?.message || null,
  });
}
