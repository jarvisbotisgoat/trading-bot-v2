import { NextRequest, NextResponse } from 'next/server';
import { getCryptoPrices } from '@/lib/alpaca';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get('symbols');
  if (!symbolsParam) {
    return NextResponse.json({});
  }

  const symbols = symbolsParam.split(',').slice(0, 20);

  try {
    const prices = await getCryptoPrices(symbols);
    return NextResponse.json(prices, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    // Fallback to Yahoo if Alpaca keys aren't set
    console.error('Alpaca prices failed, trying Yahoo fallback:', err);
    const prices: Record<string, number> = {};
    try {
      await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=5m`;
            const res = await fetch(url, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(4000),
            });
            if (!res.ok) return;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data: any = await res.json();
            const meta = data?.chart?.result?.[0]?.meta;
            if (meta?.regularMarketPrice) {
              prices[symbol] = meta.regularMarketPrice;
            }
          } catch { /* skip */ }
        })
      );
    } catch { /* skip */ }
    return NextResponse.json(prices, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
