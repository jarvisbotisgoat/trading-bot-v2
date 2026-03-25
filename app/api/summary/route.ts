import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const limit = parseInt(searchParams.get('limit') || '30', 10);

  let query = supabase
    .from('daily_summary')
    .select('*')
    .order('date', { ascending: false })
    .limit(limit);

  if (date) query = query.eq('date', date);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
