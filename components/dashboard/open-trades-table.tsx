'use client';

import type { Trade } from '@/lib/types';
import { Badge } from '../ui/badge';
import { getPositionInfo } from '@/lib/utils';

interface OpenTradesTableProps {
  trades: Trade[];
  currentPrices?: Record<string, number>;
}

export function OpenTradesTable({ trades, currentPrices = {} }: OpenTradesTableProps) {
  if (trades.length === 0) {
    return (
      <div className="text-center text-[#8b949e] py-8 text-sm">
        No open trades
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[#8b949e] text-xs uppercase tracking-wider border-b border-[#21262d]">
            <th className="text-left py-2 px-3">Symbol</th>
            <th className="text-left py-2 px-3">Setup</th>
            <th className="text-right py-2 px-3">Allocated</th>
            <th className="text-right py-2 px-3">Entry</th>
            <th className="text-right py-2 px-3">Current</th>
            <th className="text-right py-2 px-3">P/L</th>
            <th className="text-right py-2 px-3">Return</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => {
            const current = currentPrices[trade.symbol] || trade.entry_price;
            const { position_size: positionSize, quantity } = getPositionInfo(trade);
            const isLong = trade.target_price > trade.entry_price;
            const priceChange = isLong
              ? current - trade.entry_price
              : trade.entry_price - current;
            const pnl = quantity * priceChange;
            const returnPct = (pnl / positionSize) * 100;

            return (
              <tr key={trade.id} className="border-b border-[#21262d]/50 hover:bg-[#21262d]/30">
                <td className="py-2.5 px-3 font-medium text-white">
                  {trade.symbol.replace('-USD', '')}
                </td>
                <td className="py-2.5 px-3">
                  <Badge label={trade.setup_type} variant="gray" />
                </td>
                <td className="py-2.5 px-3 text-right text-[#8b949e]">
                  ${positionSize.toLocaleString()}
                </td>
                <td className="py-2.5 px-3 text-right text-[#8b949e]">
                  ${trade.entry_price.toFixed(2)}
                </td>
                <td className={`py-2.5 px-3 text-right font-medium ${
                  current !== trade.entry_price ? 'text-white' : 'text-[#484f58]'
                }`}>
                  ${current.toFixed(2)}
                </td>
                <td
                  className={`py-2.5 px-3 text-right font-medium ${
                    pnl >= 0 ? 'text-[#00d4aa]' : 'text-[#ff4d4f]'
                  }`}
                >
                  {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                </td>
                <td
                  className={`py-2.5 px-3 text-right font-medium ${
                    returnPct >= 0 ? 'text-[#00d4aa]' : 'text-[#ff4d4f]'
                  }`}
                >
                  {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
