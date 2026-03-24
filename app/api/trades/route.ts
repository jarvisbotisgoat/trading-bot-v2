import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const symbol = searchParams.get('symbol');
  const setup_type = searchParams.get('setup_type');
  const outcome = searchParams.get('outcome');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = parseInt(searchParams.get('limit') || '100', 10);

  let query = supabase
    .from('trades')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  if (symbol) query = query.eq('symbol', symbol);
  if (setup_type) query = query.eq('setup_type', setup_type);
  if (outcome) query = query.eq('outcome', outcome);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
