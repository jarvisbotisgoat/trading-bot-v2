'use client';

interface WatchlistStripProps {
  symbols: string[];
  activeSymbol: string;
  onSelect: (symbol: string) => void;
}

export function WatchlistStrip({ symbols, activeSymbol, onSelect }: WatchlistStripProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {symbols.map((symbol) => (
        <button
          key={symbol}
          onClick={() => onSelect(symbol)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
            symbol === activeSymbol
              ? 'bg-[#00d4aa]/20 text-[#00d4aa] border border-[#00d4aa]/30'
              : 'bg-[#21262d]/50 text-[#8b949e] border border-transparent hover:text-white'
          }`}
        >
          ${symbol}
        </button>
      ))}
    </div>
  );
}
