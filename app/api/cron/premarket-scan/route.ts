import { NextRequest, NextResponse } from 'next/server';
import { runPremarketScan } from '@/bot/premarket-scanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const urlSecret = req.nextUrl.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && urlSecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await runPremarketScan();
    return NextResponse.json({ status: 'sent', timestamp: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ status: 'error', error: String(err) }, { status: 500 });
  }
}
