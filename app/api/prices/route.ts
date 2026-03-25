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

  const yahooFinance = (await import('yahoo-finance2')).default;

  // Use chart() instead of quote() — chart() works reliably on Vercel serverless
  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await yahooFinance.chart(symbol, {
          period1: new Date(Date.now() - 60 * 60 * 1000).toISOString().split('T')[0],
          interval: '5m' as '1m',
        });
        const quotes = result?.quotes;
        if (quotes && quotes.length > 0) {
          const last = quotes[quotes.length - 1];
          if (last.close != null) {
            prices[symbol] = last.close;
          }
        }
      } catch {
        // skip failed symbol
      }
    })
  );

  return NextResponse.json(prices);
}
