import { NextRequest, NextResponse } from 'next/server';
import { sendMorningBriefing } from '@/bot/morning-briefing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sends this header for cron jobs)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Allow if no secret configured (dev mode) or if secret matches
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await sendMorningBriefing();
    return NextResponse.json({ status: 'sent', timestamp: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ status: 'error', error: String(err) }, { status: 500 });
  }
}
