'use client';

import { useRef } from 'react';

interface TickerBarProps {
  prices: Record<string, number>;
}

const TICKERS = [
  { key: 'BTC-USD', label: 'BTC' },
  { key: 'ETH-USD', label: 'ETH' },
  { key: 'SOL-USD', label: 'SOL' },
];

export function TickerBar({ prices }: TickerBarProps) {
  // Track the first price we ever saw for each symbol (session baseline)
  const baselinePrices = useRef<Record<string, number>>({});

  // Set baseline on first price received
  for (const t of TICKERS) {
    if (prices[t.key] && !baselinePrices.current[t.key]) {
      baselinePrices.current[t.key] = prices[t.key];
    }
  }

  return (
    <div className="flex items-center gap-5 px-4 py-2 bg-[#0d1117] border-b border-[#21262d] overflow-x-auto text-xs">
      {TICKERS.map(t => {
        const price = prices[t.key];
        const baseline = baselinePrices.current[t.key];
        const change = price && baseline ? ((price - baseline) / baseline) * 100 : 0;
        const isUp = change >= 0;

        return (
          <div key={t.key} className="flex items-center gap-1.5 shrink-0">
            <span className="text-[#8b949e] font-medium">{t.label}</span>
            <span className="text-white font-medium" style={{ fontFeatureSettings: '"tnum"' }}>
              {price
                ? price >= 1000
                  ? `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `$${price.toFixed(2)}`
                : '—'}
            </span>
            {price && (
              <span className={isUp ? 'text-[#00d4aa]' : 'text-[#ff4d4f]'}>
                {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
