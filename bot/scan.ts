import yahooFinance from 'yahoo-finance2';
import { getServiceClient } from '../lib/supabase';
import type { PriceBar } from '../lib/types';
import { detectSetups } from './strategy';
import { openPaperTrade, checkAndCloseTrades } from './executor';
import { log } from './logger';
import { getActiveWatchlist, displaySymbol } from './market-hours';

async function fetchBars(symbol: string): Promise<PriceBar[]> {
  try {
    const result = await yahooFinance.chart(symbol, {
      period1: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      interval: '5m' as '1m',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chartResult = result as any;
    if (!chartResult?.quotes) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return chartResult.quotes
      .filter((q: any) => q.open != null && q.high != null && q.low != null && q.close != null)
      .map((q: any) => ({
        time: new Date(q.date).getTime() / 1000,
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume || 0,
      }));
  } catch (err) {
    await log('warn', `Failed to fetch bars for ${displaySymbol(symbol)}`, { error: String(err) });
    return [];
  }
}

function computeVWAP(bars: PriceBar[]): number {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumulativeTPV += typicalPrice * bar.volume;
    cumulativeVolume += bar.volume;
  }
  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0;
}

async function getOpenSymbols(): Promise<Set<string>> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('trades')
    .select('symbol')
    .eq('status', 'open');
  return new Set((data || []).map((t: { symbol: string }) => t.symbol));
}

export interface ScanResult {
  symbol: string;
  price: number;
  bars_count: number;
  vwap: number;
  signals_found: number;
  skipped: boolean;
  signal_type?: string;
}

interface PlanSetup {
  symbol: string;
  thesis: string;
  entryZone: string;
  stop: string;
  target: string;
  invalidation: string;
}

async function savePlannedSetups(setups: PlanSetup[]): Promise<void> {
  if (setups.length === 0) return;

  const supabase = getServiceClient();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const date = tomorrow.toISOString().split('T')[0];

  // Pad to 3 slots
  while (setups.length < 3) {
    setups.push({ symbol: '', thesis: '', entryZone: '', stop: '', target: '', invalidation: '' });
  }

  const planData = {
    slots: setups.slice(0, 3),
    holdAllDay: setups.length > 0 ? `${setups[0].symbol} — strongest signal` : '',
    swingWindow: '6:30–10:00 AM PT',
  };

  await supabase.from('daily_summary').upsert(
    {
      date,
      notes: JSON.stringify(planData),
      total_pnl: 0,
      win_count: 0,
      loss_count: 0,
      win_rate: 0,
      max_drawdown: 0,
    },
    { onConflict: 'date' }
  );

  await log('info', `Saved ${Math.min(setups.filter(s => s.symbol).length, 3)} trade plans for tomorrow`, { date });
}

export async function runScan(): Promise<ScanResult[]> {
  const { symbols: WATCHLIST, mode } = getActiveWatchlist();

  await log('info', `Bot scan started — ${mode} mode`, { watchlist: WATCHLIST.map(displaySymbol), mode });

  const openSymbols = await getOpenSymbols();
  const currentPrices: Record<string, number> = {};
  const results: ScanResult[] = [];
  const plannedSetups: PlanSetup[] = [];

  for (const symbol of WATCHLIST) {
    const display = displaySymbol(symbol);
    try {
      const bars = await fetchBars(symbol);
      if (bars.length === 0) {
        results.push({ symbol, price: 0, bars_count: 0, vwap: 0, signals_found: 0, skipped: true });
        await log('info', `Scanning ${display}: no data`, { symbol });
        continue;
      }

      const latest = bars[bars.length - 1];
      currentPrices[symbol] = latest.close;
      const vwap = computeVWAP(bars);
      const prevHod = Math.max(...bars.slice(0, -1).map((b) => b.high));

      if (openSymbols.has(symbol)) {
        results.push({
          symbol,
          price: latest.close,
          bars_count: bars.length,
          vwap,
          signals_found: 0,
          skipped: true,
        });
        await log('info', `Scanning ${display}: $${latest.close.toFixed(2)} — skipped (open trade)`, {
          symbol,
          price: latest.close,
        });
        continue;
      }

      const signals = detectSetups({ symbol, bars, vwap, prevHod });

      results.push({
        symbol,
        price: latest.close,
        bars_count: bars.length,
        vwap,
        signals_found: signals.length,
        skipped: false,
        signal_type: signals.length > 0 ? signals[0].setup_type : undefined,
      });

      if (signals.length > 0) {
        const sig = signals[0];
        await log('info', `Scanning ${display}: $${latest.close.toFixed(2)} — SIGNAL: ${sig.setup_type}`, {
          symbol,
          price: latest.close,
          setup: sig.setup_type,
          entry: sig.entry_price,
        });
        await openPaperTrade(sig);

        // Save as a planned setup for tomorrow
        plannedSetups.push({
          symbol: display,
          thesis: sig.thesis,
          entryZone: `$${(sig.entry_price * 0.998).toFixed(2)}–$${(sig.entry_price * 1.002).toFixed(2)}`,
          stop: `$${sig.stop_price.toFixed(2)}`,
          target: `$${sig.target_price.toFixed(2)}`,
          invalidation: `Break below $${sig.stop_price.toFixed(2)}`,
        });
      } else {
        await log('info', `Scanning ${display}: $${latest.close.toFixed(2)} — no setup`, {
          symbol,
          price: latest.close,
          vwap,
        });

        // Even without a signal, if price is near VWAP, note it as a potential plan
        const distFromVwap = Math.abs(latest.close - vwap) / vwap;
        if (distFromVwap < 0.005 && plannedSetups.length < 3) {
          const risk = latest.close * 0.01; // 1% risk
          plannedSetups.push({
            symbol: display,
            thesis: `Near VWAP ($${vwap.toFixed(2)}) — watch for reclaim setup at open`,
            entryZone: `$${(vwap * 0.998).toFixed(2)}–$${(vwap * 1.002).toFixed(2)}`,
            stop: `$${(latest.close - risk).toFixed(2)}`,
            target: `$${(latest.close + risk * 2).toFixed(2)}`,
            invalidation: `Fails to hold VWAP on volume`,
          });
        }
      }
    } catch (err) {
      await log('error', `Error scanning ${display}`, { error: String(err) });
      results.push({ symbol, price: 0, bars_count: 0, vwap: 0, signals_found: 0, skipped: true });
    }
  }

  await checkAndCloseTrades(currentPrices);

  // Save planned setups for tomorrow's plan page
  await savePlannedSetups(plannedSetups);

  await log('info', `Bot scan completed — ${mode} mode`, {
    scanned: results.length,
    signals: results.filter((r) => r.signals_found > 0).length,
    mode,
    plans_generated: plannedSetups.filter(s => s.symbol).length,
  });

  return results;
}
