'use client';

import type { Trade } from '@/lib/types';
import { Badge } from '../ui/badge';

interface TradeRowProps {
  trade: Trade;
}

export function TradeRow({ trade }: TradeRowProps) {
  const outcomeBadge = () => {
    switch (trade.outcome) {
      case 'win':
        return <Badge label="W" variant="green" />;
      case 'loss':
        return <Badge label="L" variant="red" />;
      case 'breakeven':
        return <Badge label="BE" variant="yellow" />;
      default:
        return <Badge label="OPEN" variant="gray" />;
    }
  };

  const pnl = trade.pnl_dollars ?? 0;
  const time = new Date(trade.entry_time).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="border-b border-[#21262d]/50 py-3 px-4 hover:bg-[#21262d]/20 transition-colors">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-white font-medium w-16">{trade.symbol}</span>
          <Badge label={trade.setup_type} variant="gray" />
          {outcomeBadge()}
        </div>
        <div className="flex items-center gap-4 text-sm shrink-0">
          <span className="text-[#8b949e]">
            ${trade.entry_price.toFixed(2)}
            {trade.exit_price != null && ` → $${trade.exit_price.toFixed(2)}`}
          </span>
          {trade.status === 'closed' && (
            <span
              className={`font-medium min-w-[80px] text-right ${
                pnl >= 0 ? 'text-[#00d4aa]' : 'text-[#ff4d4f]'
              }`}
            >
              {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
            </span>
          )}
        </div>
      </div>
      {(trade.thesis || trade.failure_reason) && (
        <div className="mt-1.5 text-xs text-[#8b949e] flex gap-4">
          {trade.thesis && <span>Thesis: {trade.thesis}</span>}
          {trade.failure_reason && (
            <span className="text-[#ff4d4f]/80">Failure: {trade.failure_reason}</span>
          )}
        </div>
      )}
      <div className="mt-1 text-xs text-[#8b949e]/60">{time}</div>
    </div>
  );
}
