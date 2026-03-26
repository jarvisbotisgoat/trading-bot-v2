'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Trade, BotStatus } from '@/lib/types';
import { StatTile } from '@/components/ui/stat-tile';
import { Card } from '@/components/ui/card';
import { BotStatusBadge } from '@/components/dashboard/bot-status-badge';
import { BotToggle } from '@/components/dashboard/bot-toggle';
import { OpenTradesTable } from '@/components/dashboard/open-trades-table';
import { WatchlistStrip } from '@/components/dashboard/watchlist-strip';
import { LiveFeed } from '@/components/dashboard/live-feed';
import { AnimatedBalance } from '@/components/dashboard/animated-balance';

const CRYPTO_WATCHLIST = ['BTC-USD', 'ETH-USD', 'SOL-USD'];
const STARTING_BALANCE = 100_000;

function getPositionInfo(trade: Trade): { position_size: number; quantity: number } {
  if (trade.notes) {
    try {
      const info = JSON.parse(trade.notes);
      if (info.position_size && info.quantity) return info;
    } catch { /* ignore */ }
  }
  const ps = STARTING_BALANCE * 0.3;
  return { position_size: ps, quantity: ps / trade.entry_price };
}

export default function DashboardPage() {
  const [botStatus, setBotStatus] = useState<BotStatus>({
    status: 'idle',
    lastRun: null,
    openTrades: 0,
  });
  const [botRunning, setBotRunning] = useState(false);
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [liveStats, setLiveStats] = useState<{
    totalPnl: number;
    todayPnl: number;
    winRate: number;
    wins: number;
    losses: number;
    totalTrades: number;
    openTrades: number;
    maxDrawdown: number;
    balance: number;
  } | null>(null);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [prevPrices, setPrevPrices] = useState<Record<string, number>>({});

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
  const maxDrawdown = liveStats?.maxDrawdown ?? 0;

  // Main data fetch (every 15s) — stats, trades, equity
  const fetchData = useCallback(async () => {
    try {
      const [statusRes, tradesRes, controlRes, statsRes] = await Promise.all([
        fetch('/api/bot-status'),
        fetch('/api/trades?status=open'),
        fetch('/api/bot/control'),
        fetch('/api/stats'),
      ]);

      if (statusRes.ok) setBotStatus(await statusRes.json());
      if (controlRes.ok) {
        const control = await controlRes.json();
        setBotRunning(control.is_running || false);
      }
      if (tradesRes.ok) {
        const tradesData: Trade[] = await tradesRes.json();
        setOpenTrades(tradesData);
      }
      if (statsRes.ok) setLiveStats(await statsRes.json());
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Fast price polling (every 5s) — just prices for live P/L
  const fetchPrices = useCallback(async () => {
    const symbols = CRYPTO_WATCHLIST;
    try {
      const res = await fetch(`/api/prices?symbols=${symbols.join(',')}`);
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30">
            Crypto — 24/7
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              if (!confirm('Clean up duplicate open trades? Your win/loss history will be kept.')) return;
              const res = await fetch('/api/bot/cleanup', { method: 'POST' });
              const result = await res.json();
              alert(`Done! ${result.remaining.open} open trades, ${result.remaining.closed} closed trades kept.`);
              fetchData();
            }}
            className="text-xs px-3 py-1.5 rounded bg-[#21262d] text-[#8b949e] border border-[#30363d] hover:text-[#ff4d4f] hover:border-[#ff4d4f]/30 transition-colors"
          >
            Clean Up
          </button>
          <BotToggle isRunning={botRunning} onToggle={setBotRunning} />
          <BotStatusBadge status={{
            ...botStatus,
            status: botRunning ? 'active' : botStatus.status,
          }} />
        </div>
      </div>

      {/* Watchlist with live prices */}
      <WatchlistStrip
        symbols={CRYPTO_WATCHLIST}
        prices={currentPrices}
        prevPrices={prevPrices}
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <AnimatedBalance value={liveBalance} />
        <StatTile
          label="Today P/L"
          value={`${todayPnl >= 0 ? '+' : ''}$${todayPnl.toFixed(2)}`}
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
          color={maxDrawdown > 0 ? 'red' : 'white'}
        />
      </div>

      {/* Live Feed */}
      <Card>
        <LiveFeed isRunning={botRunning} onScanComplete={fetchData} />
      </Card>

      {/* Open Trades with live P/L */}
      <Card>
        <h2 className="text-sm text-[#8b949e] uppercase tracking-wider mb-3">
          Open Trades ({openTrades.length})
        </h2>
        <OpenTradesTable trades={openTrades} currentPrices={currentPrices} />
      </Card>
    </div>
  );
}
