import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  // Try service client first, fall back to anon
  const supabase = createClient(url, serviceKey || anonKey);

  // Stop bot
  await supabase.from('bot_control').update({ is_running: false }).eq('id', 1);

  // Delete in order: summaries (FK) -> trades -> logs
  await supabase.from('daily_summary').delete().gte('date', '2000-01-01');
  await supabase.from('trades').delete().gte('created_at', '2000-01-01');
  await supabase.from('bot_log').delete().gte('created_at', '2000-01-01');

  return NextResponse.json({ message: 'Reset complete' }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    },
  });
}
