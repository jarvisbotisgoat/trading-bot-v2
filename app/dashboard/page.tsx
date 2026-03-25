'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Trade, BotStatus, DailySummary, PriceBar } from '@/lib/types';
import { StatTile } from '@/components/ui/stat-tile';
import { Card } from '@/components/ui/card';
import { BotStatusBadge } from '@/components/dashboard/bot-status-badge';
import { BotToggle } from '@/components/dashboard/bot-toggle';
import { OpenTradesTable } from '@/components/dashboard/open-trades-table';
import { WatchlistStrip } from '@/components/dashboard/watchlist-strip';
import { EquityCurve } from '@/components/charts/equity-curve';
import { LiveFeed } from '@/components/dashboard/live-feed';
import { CandlestickChart } from '@/components/charts/candlestick-chart';
import { CandlestickData, Time } from 'lightweight-charts';

const STOCK_WATCHLIST = ['TSLA', 'NVDA', 'SPY', 'AAPL', 'AMZN'];
const CRYPTO_WATCHLIST = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD', 'AVAX-USD'];

const STARTING_BALANCE = 100_000;

function isMarketOpenClient(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const month = now.getUTCMonth();
  const isDST = month >= 2 && month <= 10;
  const etOffset = isDST ? 4 : 5;
  const etHour = now.getUTCHours() - etOffset;
  const etMin = now.getUTCMinutes();
  const etTime = etHour * 60 + etMin;
  return etTime >= 570 && etTime < 960;
}

function displaySymbol(s: string): string {
  return s.replace('-USD', '');
}

export default function DashboardPage() {
  const [botStatus, setBotStatus] = useState<BotStatus>({
    status: 'idle',
    lastRun: null,
    openTrades: 0,
  });
  const [botRunning, setBotRunning] = useState(false);
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [todaySummary, setTodaySummary] = useState<DailySummary | null>(null);
  const [equityData, setEquityData] = useState<{ time: string; value: number }[]>([]);
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
  const [marketOpen, setMarketOpen] = useState(isMarketOpenClient());
  const watchlist = marketOpen ? STOCK_WATCHLIST : CRYPTO_WATCHLIST;
  const [activeSymbol, setActiveSymbol] = useState(watchlist[0]);
  const [chartData, setChartData] = useState<CandlestickData<Time>[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});

  // Check market status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const open = isMarketOpenClient();
      setMarketOpen(open);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // When market mode changes, switch active symbol to first in new list
  useEffect(() => {
    const list = marketOpen ? STOCK_WATCHLIST : CRYPTO_WATCHLIST;
    if (!list.includes(activeSymbol)) {
      setActiveSymbol(list[0]);
    }
  }, [marketOpen, activeSymbol]);

  // Fetch chart data when activeSymbol changes
  useEffect(() => {
    let cancelled = false;
    async function loadChart() {
      setChartLoading(true);
      try {
        const res = await fetch(`/api/chart?symbol=${encodeURIComponent(activeSymbol)}`);
        if (res.ok && !cancelled) {
          const bars: PriceBar[] = await res.json();
          if (Array.isArray(bars) && bars.length > 0) {
            setChartData(
              bars.map((b) => ({
                time: b.time as Time,
                open: b.open,
                high: b.high,
                low: b.low,
                close: b.close,
              }))
            );
          } else {
            setChartData([]);
          }
        }
      } catch {
        if (!cancelled) setChartData([]);
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    }
    loadChart();
    return () => { cancelled = true; };
  }, [activeSymbol]);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, tradesRes, summaryRes, controlRes, statsRes] = await Promise.all([
        fetch('/api/bot-status'),
        fetch('/api/trades?status=open'),
        fetch('/api/summary?limit=30'),
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

        // Fetch live prices for open trade symbols
        const symbolSet = new Set(tradesData.map((t) => t.symbol));
        const symbols = Array.from(symbolSet);
        if (symbols.length > 0) {
          try {
            const pricesRes = await fetch(`/api/prices?symbols=${symbols.join(',')}`);
            if (pricesRes.ok) setCurrentPrices(await pricesRes.json());
          } catch { /* prices are optional */ }
        }
      }
      if (statsRes.ok) setLiveStats(await statsRes.json());
      if (summaryRes.ok) {
        const summaries: DailySummary[] = await summaryRes.json();
        if (summaries.length > 0) {
          setTodaySummary(summaries[0]);
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

  // Use live stats from real trade data, fall back to daily_summary
  const todayPnl = liveStats?.todayPnl ?? todaySummary?.total_pnl ?? 0;
  const winRate = liveStats?.winRate ?? todaySummary?.win_rate ?? 0;
  const maxDrawdown = liveStats?.maxDrawdown ?? todaySummary?.max_drawdown ?? 0;
  const currentBalance = liveStats?.balance ?? STARTING_BALANCE + todayPnl;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            marketOpen
              ? 'bg-[#00d4aa]/10 text-[#00d4aa] border border-[#00d4aa]/30'
              : 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
          }`}>
            {marketOpen ? 'Market Open — Stocks' : 'After Hours — Crypto'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <BotToggle isRunning={botRunning} onToggle={setBotRunning} />
          <BotStatusBadge status={{
            ...botStatus,
            status: botRunning ? 'active' : botStatus.status,
          }} />
        </div>
      </div>

      {/* Watchlist */}
      <WatchlistStrip
        symbols={watchlist}
        activeSymbol={activeSymbol}
        onSelect={setActiveSymbol}
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatTile
          label="Balance"
          value={`$${currentBalance.toLocaleString()}`}
          color="white"
        />
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

      {/* Live Feed */}
      <Card>
        <LiveFeed isRunning={botRunning} onScanComplete={fetchData} />
      </Card>

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
          ${displaySymbol(activeSymbol)} — Intraday
        </h2>
        {chartLoading ? (
          <div className="h-[400px] flex items-center justify-center text-[#484f58] text-sm">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#484f58] border-t-transparent mr-2" />
            Loading chart data...
          </div>
        ) : chartData.length > 0 ? (
          <CandlestickChart data={chartData} />
        ) : (
          <div className="h-[400px] flex items-center justify-center text-[#484f58] text-sm">
            No chart data available for {displaySymbol(activeSymbol)}
          </div>
        )}
      </Card>

      {/* Open Trades */}
      <Card>
        <h2 className="text-sm text-[#8b949e] uppercase tracking-wider mb-3">
          Open Trades
        </h2>
        <OpenTradesTable trades={openTrades} currentPrices={currentPrices} />
      </Card>
    </div>
  );
}
