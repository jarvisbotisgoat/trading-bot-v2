'use client';

interface WatchlistStripProps {
  symbols: string[];
  prices?: Record<string, number>;
  prevPrices?: Record<string, number>;
}

function displaySymbol(s: string): string {
  return s.replace('-USD', '');
}

export function WatchlistStrip({ symbols, prices = {}, prevPrices = {} }: WatchlistStripProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {symbols.map((symbol) => {
        const price = prices[symbol];
        const prev = prevPrices[symbol];
        const change = price && prev ? ((price - prev) / prev) * 100 : 0;
        const isUp = change >= 0;

        return (
          <div
            key={symbol}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#21262d]/50 border border-[#30363d]/50 min-w-[140px]"
          >
            <span className="text-sm font-bold text-[#00d4aa]">
              ${displaySymbol(symbol)}
            </span>
            {price ? (
              <div className="flex flex-col items-end ml-auto">
                <span className="text-sm text-white font-medium" style={{ fontFeatureSettings: '"tnum"' }}>
                  ${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className={`text-xs ${isUp ? 'text-[#00d4aa]' : 'text-[#ff4d4f]'}`}>
                  {isUp ? '+' : ''}{change.toFixed(2)}%
                </span>
              </div>
            ) : (
              <span className="text-xs text-[#484f58] ml-auto">--</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
