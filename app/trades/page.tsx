'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Trade } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { TradeRow } from '@/components/trades/trade-row';
import { FilterBar } from '@/components/trades/filter-bar';

interface Filters {
  symbol: string;
  setup_type: string;
  outcome: string;
  from: string;
  to: string;
}

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    symbol: '',
    setup_type: '',
    outcome: '',
    from: '',
    to: '',
  });

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.symbol) params.set('symbol', filters.symbol);
      if (filters.setup_type) params.set('setup_type', filters.setup_type);
      if (filters.outcome) params.set('outcome', filters.outcome);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);

      const res = await fetch(`/api/trades?${params.toString()}`);
      if (res.ok) {
        setTrades(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch trades:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  const exportCSV = () => {
    if (trades.length === 0) return;

    const headers = [
      'Date',
      'Symbol',
      'Setup',
      'Entry',
      'Exit',
      'Outcome',
      'P/L ($)',
      'P/L (%)',
      'Thesis',
      'Failure Reason',
    ];
    const rows = trades.map((t) => [
      t.entry_time,
      t.symbol,
      t.setup_type,
      t.entry_price,
      t.exit_price ?? '',
      t.outcome ?? '',
      t.pnl_dollars ?? '',
      t.pnl_percent ?? '',
      t.thesis ?? '',
      t.failure_reason ?? '',
    ]);

    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openCount = trades.filter((t) => t.status === 'open').length;
  const closedTrades = trades.filter((t) => t.status === 'closed');
  const wins = closedTrades.filter((t) => t.outcome === 'win').length;
  const losses = closedTrades.filter((t) => t.outcome === 'loss').length;
  const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl_dollars ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trade Feed</h1>
        {!loading && trades.length > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[#8b949e]">{openCount} open</span>
            <span className="text-[#00d4aa]">{wins}W</span>
            <span className="text-[#ff4d4f]">{losses}L</span>
            <span className={totalPnl >= 0 ? 'text-[#00d4aa] font-medium' : 'text-[#ff4d4f] font-medium'}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      <FilterBar filters={filters} onChange={setFilters} onExport={exportCSV} />

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="text-center text-[#8b949e] py-12 text-sm">Loading trades...</div>
        ) : trades.length === 0 ? (
          <div className="text-center text-[#8b949e] py-12 text-sm">
            No trades found. The bot will populate this once connected to Supabase.
          </div>
        ) : (
          trades.map((trade) => <TradeRow key={trade.id} trade={trade} />)
        )}
      </Card>
    </div>
  );
}
