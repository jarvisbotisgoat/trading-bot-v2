import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get('symbols');
  if (!symbolsParam) {
    return NextResponse.json({});
  }

  const symbols = symbolsParam.split(',').slice(0, 20);
  const prices: Record<string, number> = {};

  try {
    const yahooFinance = (await import('yahoo-finance2')).default;

    // Fetch quotes one at a time to avoid type issues with batch
    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result: any = await yahooFinance.quote(symbol);
          if (result?.regularMarketPrice) {
            prices[symbol] = result.regularMarketPrice;
          }
        } catch { /* skip failed symbol */ }
      })
    );
  } catch (err) {
    console.error('Failed to fetch prices:', err);
  }

  return NextResponse.json(prices);
}
