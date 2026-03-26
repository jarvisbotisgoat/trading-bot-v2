'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Trade, BotStatus } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { BotStatusBadge } from '@/components/dashboard/bot-status-badge';
import { BotToggle } from '@/components/dashboard/bot-toggle';
import { OpenTradesTable } from '@/components/dashboard/open-trades-table';
import { LiveFeed } from '@/components/dashboard/live-feed';
import { AnimatedBalance } from '@/components/dashboard/animated-balance';
import { PnlChart } from '@/components/charts/pnl-chart';
import { TickerBar } from '@/components/dashboard/ticker-bar';
import { Badge } from '@/components/ui/badge';
import { getPositionInfo, STARTING_BALANCE } from '@/lib/utils';

const CRYPTO_WATCHLIST = ['BTC-USD', 'ETH-USD', 'SOL-USD'];

export default function DashboardPage() {
  const [botStatus, setBotStatus] = useState<BotStatus>({ status: 'idle', lastRun: null, openTrades: 0 });
  const [botRunning, setBotRunning] = useState(false);
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
  const [liveStats, setLiveStats] = useState<{
    totalPnl: number; todayPnl: number; winRate: number;
    wins: number; losses: number; totalTrades: number;
    openTrades: number; maxDrawdown: number; balance: number;
  } | null>(null);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [prevPrices, setPrevPrices] = useState<Record<string, number>>({});
  const [pnlHistory, setPnlHistory] = useState<{ time: number; value: number }[]>([]);

  // Compute unrealized P/L from live prices
  const unrealizedPnl = openTrades.reduce((total, trade) => {
    const price = currentPrices[trade.symbol];
    if (!price) return total;
    const { quantity } = getPositionInfo(trade);
    const isLong = trade.target_price > trade.entry_price;
    const change = isLong ? price - trade.entry_price : trade.entry_price - price;
    return total + quantity * change;
  }, 0);

  const realizedBalance = liveStats?.balance ?? STARTING_BALANCE;
  const liveBalance = realizedBalance + unrealizedPnl;
  const todayPnl = (liveStats?.todayPnl ?? 0) + unrealizedPnl;
  const winRate = liveStats?.winRate ?? 0;
  const wins = liveStats?.wins ?? 0;
  const losses = liveStats?.losses ?? 0;
  const maxDrawdown = liveStats?.maxDrawdown ?? 0;
  const totalPnl = liveStats?.totalPnl ?? 0;

  // Main data fetch (every 15s)
  const fetchData = useCallback(async () => {
    try {
      const cb = `_t=${Date.now()}`;
      const nocache = { cache: 'no-store' as RequestCache };
      const [statusRes, openRes, closedRes, controlRes, statsRes, pnlRes] = await Promise.all([
        fetch(`/api/bot-status?${cb}`, nocache),
        fetch(`/api/trades?status=open&${cb}`, nocache),
        fetch(`/api/trades?status=closed&limit=20&${cb}`, nocache),
        fetch(`/api/bot/control?${cb}`, nocache),
        fetch(`/api/stats?${cb}`, nocache),
        fetch(`/api/pnl-history?${cb}`, nocache),
      ]);

      if (statusRes.ok) setBotStatus(await statusRes.json());
      if (controlRes.ok) {
        const control = await controlRes.json();
        setBotRunning(control.is_running || false);
      }
      if (openRes.ok) {
        const openData = await openRes.json();
        const fresh = Array.isArray(openData) ? openData.filter((t: Trade) =>
          new Date(t.created_at) > new Date('2026-03-27T00:00:00Z')
        ) : [];
        setOpenTrades(fresh);
      } else {
        setOpenTrades([]);
      }
      if (closedRes.ok) {
        const closedData = await closedRes.json();
        const fresh = Array.isArray(closedData) ? closedData.filter((t: Trade) =>
          new Date(t.created_at) > new Date('2026-03-27T00:00:00Z')
        ) : [];
        setClosedTrades(fresh);
      }
      if (statsRes.ok) setLiveStats(await statsRes.json());
      if (pnlRes.ok) setPnlHistory(await pnlRes.json());
    } catch (err) {
      console.error('Failed to fetch:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Fast price polling (every 5s)
  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch(`/api/prices?symbols=${CRYPTO_WATCHLIST.join(',')}&_t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const newPrices = await res.json();
        setCurrentPrices((prev) => {
          setPrevPrices(prev);
          return { ...prev, ...newPrices };
        });
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 5000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  return (
    <div className="space-y-4">
      {/* Ticker Bar */}
      <TickerBar prices={currentPrices} prevPrices={prevPrices} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AnimatedBalance value={liveBalance} />
          <div className="flex flex-col gap-1">
            <span className={`text-sm font-medium ${todayPnl >= 0 ? 'text-[#00d4aa]' : 'text-[#ff4d4f]'}`}>
              {todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(2)} today
            </span>
            <span className="text-xs text-[#8b949e]">
              {wins}W {losses}L · {(winRate * 100).toFixed(0)}% win rate
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              if (!confirm('Delete ALL trades and start fresh at $100?')) return;
              const res = await fetch(`/api/bot/cleanup?confirm=yes&_t=${Date.now()}`, { cache: 'no-store' });
              const data = await res.json();
              alert(JSON.stringify(data.results || data, null, 2));
              window.location.reload();
            }}
            className="text-xs px-3 py-1.5 rounded bg-[#21262d] text-[#8b949e] border border-[#30363d] hover:text-[#ff4d4f] hover:border-[#ff4d4f]/30 transition-colors"
          >
            Reset
          </button>
          <BotToggle isRunning={botRunning} onToggle={setBotRunning} />
          <BotStatusBadge status={{
            ...botStatus,
            status: botRunning ? 'active' : botStatus.status,
          }} />
        </div>
      </div>

      {/* Equity Curve with Stats */}
      <Card>
        <h2 className="text-sm text-[#8b949e] uppercase tracking-wider mb-2">
          Equity Curve
        </h2>
        <PnlChart
          data={pnlHistory}
          stats={{ totalPnl, winRate, wins, losses, maxDrawdown }}
          height={250}
        />
      </Card>

      {/* Live Feed */}
      <Card>
        <LiveFeed isRunning={botRunning} onScanComplete={fetchData} />
      </Card>

      {/* Open Positions */}
      <Card>
        <h2 className="text-sm text-[#8b949e] uppercase tracking-wider mb-3">
          Open Positions ({openTrades.length})
        </h2>
        <OpenTradesTable trades={openTrades} currentPrices={currentPrices} />
      </Card>

      {/* Recent Closed Trades */}
      {closedTrades.length > 0 && (
        <Card>
          <h2 className="text-sm text-[#8b949e] uppercase tracking-wider mb-3">
            Recent Trades
          </h2>
          <div className="space-y-0">
            {closedTrades.map((trade) => {
              const pnl = trade.pnl_dollars ?? 0;
              const pnlPct = trade.pnl_percent ?? 0;
              const isWin = trade.outcome === 'win';
              const time = new Date(trade.exit_time || trade.entry_time).toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              });
              return (
                <div key={trade.id} className="flex items-center justify-between py-2.5 px-1 border-b border-[#21262d]/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-medium text-sm w-10">
                      {trade.symbol.replace('-USD', '')}
                    </span>
                    <Badge label={isWin ? 'W' : trade.outcome === 'loss' ? 'L' : 'BE'} variant={isWin ? 'green' : 'red'} />
                    <span className="text-xs text-[#484f58]">{time}</span>
                  </div>
                  <span className={`text-sm font-medium ${pnl >= 0 ? 'text-[#00d4aa]' : 'text-[#ff4d4f]'}`}>
                    {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
