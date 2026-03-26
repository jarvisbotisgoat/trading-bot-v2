'use client';

interface TickerItem {
  label: string;
  price: number | null;
  change: number;
}

interface TickerBarProps {
  prices: Record<string, number>;
  prevPrices: Record<string, number>;
}

const TICKERS = [
  { key: 'BTC-USD', label: 'BTC' },
  { key: 'ETH-USD', label: 'ETH' },
  { key: 'SOL-USD', label: 'SOL' },
];

export function TickerBar({ prices, prevPrices }: TickerBarProps) {
  const items: TickerItem[] = TICKERS.map(t => {
    const price = prices[t.key] ?? null;
    const prev = prevPrices[t.key] ?? price;
    const change = price && prev ? ((price - prev) / prev) * 100 : 0;
    return { label: t.label, price, change };
  });

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-[#0d1117] border-b border-[#21262d] overflow-x-auto text-xs">
      {items.map(item => {
        const isUp = item.change >= 0;
        return (
          <div key={item.label} className="flex items-center gap-1.5 shrink-0">
            <span className="text-[#8b949e] font-medium">{item.label}</span>
            <span className="text-white font-medium" style={{ fontFeatureSettings: '"tnum"' }}>
              {item.price
                ? item.price >= 1000
                  ? `$${item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `$${item.price.toFixed(2)}`
                : '—'}
            </span>
            <span className={`${isUp ? 'text-[#00d4aa]' : 'text-[#ff4d4f]'}`}>
              {isUp ? '▲' : '▼'} {Math.abs(item.change).toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
