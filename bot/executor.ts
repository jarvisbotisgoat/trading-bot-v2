import { getServiceClient } from '../lib/supabase';
import type { SetupSignal, Trade } from '../lib/types';
import { log } from './logger';

// Position sizing: allocate this fraction of balance per trade
const POSITION_ALLOCATION = 0.30; // 30% of balance per trade (3 symbols = ~90% deployed)
const STARTING_BALANCE = 100_000;

export interface TradeOpenResult {
  trade: Trade | null;
  error: string | null;
}

async function getCurrentBalance(): Promise<number> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('trades')
    .select('pnl_dollars')
    .eq('status', 'closed');

  const totalPnl = (data || []).reduce(
    (sum: number, t: { pnl_dollars: number | null }) => sum + (t.pnl_dollars || 0),
    0
  );
  return STARTING_BALANCE + totalPnl;
}

export async function openPaperTrade(signal: SetupSignal): Promise<TradeOpenResult> {
  const supabase = getServiceClient();

  // Prevent duplicate open trades for the same symbol
  const { data: existing } = await supabase
    .from('trades')
    .select('id')
    .eq('symbol', signal.symbol)
    .eq('status', 'open')
    .limit(1);

  if (existing && existing.length > 0) {
    return { trade: null, error: `Skipped — already have open trade for ${signal.symbol}` };
  }

  // Position sizing: allocate 30% of current balance
  const balance = await getCurrentBalance();
  const positionSize = Math.floor(balance * POSITION_ALLOCATION);
  const quantity = positionSize / signal.entry_price;

  const tradeData = {
    symbol: signal.symbol,
    setup_type: signal.setup_type,
    market_regime: signal.market_regime,
    entry_price: signal.entry_price,
    stop_price: signal.stop_price,
    target_price: signal.target_price,
    entry_time: new Date().toISOString(),
    entry_quality_score: signal.entry_quality_score,
    thesis: signal.thesis,
    risk_percent:
      Math.abs(signal.entry_price - signal.stop_price) / signal.entry_price * 100,
    status: 'open' as const,
    notes: JSON.stringify({ position_size: positionSize, quantity }),
  };

  try {
    const { data, error } = await supabase
      .from('trades')
      .insert(tradeData)
      .select()
      .single();

    if (error) {
      const msg = `Failed to open trade for ${signal.symbol}: ${error.message} (code: ${error.code}, details: ${error.details})`;
      await log('error', msg, { error: error.message, code: error.code, details: error.details, hint: error.hint });
      return { trade: null, error: msg };
    }

    await log('info', `Opened paper trade: ${signal.symbol} ${signal.setup_type} — $${positionSize.toLocaleString()} (${quantity.toFixed(4)} units)`, {
      trade_id: data.id,
      entry: signal.entry_price,
      position_size: positionSize,
      quantity,
    });

    return { trade: data as Trade, error: null };
  } catch (err) {
    const msg = `Exception opening trade for ${signal.symbol}: ${String(err)}`;
    await log('error', msg, { error: String(err) });
    return { trade: null, error: msg };
  }
}

function getPositionInfo(trade: Trade): { position_size: number; quantity: number } {
  // Parse position info from notes, fall back to default allocation
  if (trade.notes) {
    try {
      const info = JSON.parse(trade.notes);
      if (info.position_size && info.quantity) return info;
    } catch { /* fall through */ }
  }
  // Fallback for old trades without position sizing
  const positionSize = STARTING_BALANCE * POSITION_ALLOCATION;
  return { position_size: positionSize, quantity: positionSize / trade.entry_price };
}

export async function checkAndCloseTrades(
  currentPrices: Record<string, number>
): Promise<void> {
  const supabase = getServiceClient();

  const { data: openTrades, error } = await supabase
    .from('trades')
    .select('*')
    .eq('status', 'open');

  if (error) {
    await log('error', 'Failed to fetch open trades', { error: error.message });
    return;
  }

  if (!openTrades || openTrades.length === 0) return;

  for (const trade of openTrades as Trade[]) {
    const currentPrice = currentPrices[trade.symbol];
    if (!currentPrice) continue;

    const isLong = trade.target_price > trade.entry_price;
    let shouldClose = false;
    let exitPrice = currentPrice;
    let outcome: 'win' | 'loss' | 'breakeven' = 'breakeven';
    let failureReason: string | null = null;

    if (isLong) {
      if (currentPrice <= trade.stop_price) {
        shouldClose = true;
        exitPrice = trade.stop_price;
        outcome = 'loss';
        failureReason = 'Stop hit';
      } else if (currentPrice >= trade.target_price) {
        shouldClose = true;
        exitPrice = trade.target_price;
        outcome = 'win';
      }
    } else {
      if (currentPrice >= trade.stop_price) {
        shouldClose = true;
        exitPrice = trade.stop_price;
        outcome = 'loss';
        failureReason = 'Stop hit';
      } else if (currentPrice <= trade.target_price) {
        shouldClose = true;
        exitPrice = trade.target_price;
        outcome = 'win';
      }
    }

    if (shouldClose) {
      const { position_size, quantity } = getPositionInfo(trade);
      const priceChange = isLong
        ? exitPrice - trade.entry_price
        : trade.entry_price - exitPrice;
      const pnlDollars = quantity * priceChange;
      const pnlPercent = (pnlDollars / position_size) * 100;

      const { error: updateError } = await supabase
        .from('trades')
        .update({
          exit_price: exitPrice,
          exit_time: new Date().toISOString(),
          outcome,
          pnl_dollars: pnlDollars,
          pnl_percent: pnlPercent,
          failure_reason: failureReason,
          status: 'closed',
        })
        .eq('id', trade.id);

      if (updateError) {
        await log('error', `Failed to close trade ${trade.id}`, {
          error: updateError.message,
        });
        continue;
      }

      await log('info', `Closed trade: ${trade.symbol} ${outcome} — ${pnlDollars >= 0 ? '+' : ''}$${pnlDollars.toFixed(2)} (${pnlPercent.toFixed(1)}%)`, {
        trade_id: trade.id,
        pnl: pnlDollars,
        position_size,
      });
    }
  }
}
