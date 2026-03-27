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

  // Try Alpaca first
  const alpacaKey = process.env.ALPACA_API_KEY;
  const alpacaSecret = process.env.ALPACA_API_SECRET;

  if (alpacaKey && alpacaSecret) {
    try {
      const alpacaSymbols = symbols.map(s => s.replace('-', '/'));
      const params = new URLSearchParams({ symbols: alpacaSymbols.join(',') });
      const res = await fetch(
        `https://data.alpaca.markets/v1beta3/crypto/us/latest/trades?${params}`,
        {
          headers: {
            'APCA-API-KEY-ID': alpacaKey,
            'APCA-API-SECRET-KEY': alpacaSecret,
          },
          signal: AbortSignal.timeout(5000),
        }
      );
      if (res.ok) {
        const data = await res.json();
        for (const symbol of symbols) {
          const alpacaSym = symbol.replace('-', '/');
          const trade = data.trades?.[alpacaSym];
          if (trade?.p) {
            prices[symbol] = trade.p;
          }
        }
      }
    } catch {
      // Fall through to Yahoo
    }
  }

  // Yahoo fallback for any symbols we didn't get from Alpaca
  const missing = symbols.filter(s => !prices[s]);
  if (missing.length > 0) {
    await Promise.all(
      missing.map(async (symbol) => {
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
  }

  return NextResponse.json(prices, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
