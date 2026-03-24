'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Trade, BotStatus, DailySummary } from '@/lib/types';
import { StatTile } from '@/components/ui/stat-tile';
import { Card } from '@/components/ui/card';
import { BotStatusBadge } from '@/components/dashboard/bot-status-badge';
import { OpenTradesTable } from '@/components/dashboard/open-trades-table';
import { WatchlistStrip } from '@/components/dashboard/watchlist-strip';
import { EquityCurve } from '@/components/charts/equity-curve';
import { CandlestickChart } from '@/components/charts/candlestick-chart';
import { CandlestickData, Time } from 'lightweight-charts';

const WATCHLIST = ['TSLA', 'NVDA', 'SPY', 'AAPL', 'AMZN'];

export default function DashboardPage() {
  const [botStatus, setBotStatus] = useState<BotStatus>({
    status: 'idle',
    lastRun: null,
    openTrades: 0,
  });
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [todaySummary, setTodaySummary] = useState<DailySummary | null>(null);
  const [equityData, setEquityData] = useState<{ time: string; value: number }[]>([]);
  const [activeSymbol, setActiveSymbol] = useState('TSLA');
  const [chartData] = useState<CandlestickData<Time>[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, tradesRes, summaryRes] = await Promise.all([
        fetch('/api/bot-status'),
        fetch('/api/trades?status=open'),
        fetch('/api/summary?limit=30'),
      ]);

      if (statusRes.ok) setBotStatus(await statusRes.json());
      if (tradesRes.ok) setOpenTrades(await tradesRes.json());
      if (summaryRes.ok) {
        const summaries: DailySummary[] = await summaryRes.json();
        if (summaries.length > 0) {
          setTodaySummary(summaries[0]);
          // Build equity curve from daily summaries
          let cumulative = 0;
          const curve = summaries
            .reverse()
            .map((s) => {
              cumulative += s.total_pnl;
              return { time: s.date, value: cumulative };
            });
          setEquityData(curve);
        }
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const todayPnl = todaySummary?.total_pnl ?? 0;
  const winRate = todaySummary?.win_rate ?? 0;
  const maxDrawdown = todaySummary?.max_drawdown ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <BotStatusBadge status={botStatus} />
      </div>

      {/* Watchlist */}
      <WatchlistStrip
        symbols={WATCHLIST}
        activeSymbol={activeSymbol}
        onSelect={setActiveSymbol}
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile
          label="Today P/L"
          value={`${todayPnl >= 0 ? '+' : ''}$${todayPnl.toFixed(0)}`}
          color={todayPnl >= 0 ? 'green' : 'red'}
        />
        <StatTile
          label="Win Rate"
          value={`${(winRate * 100).toFixed(0)}%`}
          color="white"
        />
        <StatTile
          label="Open Trades"
          value={String(openTrades.length)}
          color="white"
        />
        <StatTile
          label="Max Drawdown"
          value={`$${maxDrawdown.toFixed(0)}`}
          color={maxDrawdown < 0 ? 'red' : 'white'}
        />
      </div>

      {/* Equity Curve */}
      {equityData.length > 0 && (
        <Card>
          <h2 className="text-sm text-[#8b949e] uppercase tracking-wider mb-3">
            Equity Curve
          </h2>
          <EquityCurve data={equityData} />
        </Card>
      )}

      {/* Chart */}
      <Card>
        <h2 className="text-sm text-[#8b949e] uppercase tracking-wider mb-3">
          ${activeSymbol} — Intraday
        </h2>
        {chartData.length > 0 ? (
          <CandlestickChart data={chartData} />
        ) : (
          <div className="h-[400px] flex items-center justify-center text-[#8b949e] text-sm">
            Connect Supabase to load chart data
          </div>
        )}
      </Card>

      {/* Open Trades */}
      <Card>
        <h2 className="text-sm text-[#8b949e] uppercase tracking-wider mb-3">
          Open Trades
        </h2>
        <OpenTradesTable trades={openTrades} />
      </Card>
    </div>
  );
}
