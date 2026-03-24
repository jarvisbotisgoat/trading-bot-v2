import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('daily_summary')
    .select('*')
    .eq('date', today)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || { date: today, notes: '' });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase.from('daily_summary').upsert(
    {
      date: today,
      notes: body.notes,
      total_pnl: 0,
      win_count: 0,
      loss_count: 0,
      win_rate: 0,
      max_drawdown: 0,
    },
    { onConflict: 'date' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
