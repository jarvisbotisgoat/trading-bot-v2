import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('bot_control')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data) {
    // Default to running — bot should always be active unless explicitly stopped
    return NextResponse.json({ is_running: true, updated_at: null });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const { is_running } = await request.json();
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('bot_control')
    .upsert({
      id: 1,
      is_running: Boolean(is_running),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log the state change
  await supabase.from('bot_log').insert({
    level: 'info',
    message: is_running ? 'Bot started by user' : 'Bot stopped by user',
  });

  return NextResponse.json(data);
}
