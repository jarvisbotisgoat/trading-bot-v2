import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('trades')
    .select('exit_time, pnl_dollars')
    .eq('status', 'closed')
    .not('exit_time', 'is', null)
    .gte('created_at', '2026-03-27')
    .order('exit_time', { ascending: true });

  if (error) {
    return NextResponse.json([], { status: 500 });
  }

  // Build cumulative P/L curve
  let cumulative = 0;
  const points = (data || []).map((t: { exit_time: string; pnl_dollars: number }) => {
    cumulative += t.pnl_dollars || 0;
    // Convert to seconds timestamp for lightweight-charts
    const ts = Math.floor(new Date(t.exit_time).getTime() / 1000);
    return { time: ts, value: Math.round(cumulative * 100) / 100 };
  });

  return NextResponse.json(points, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
