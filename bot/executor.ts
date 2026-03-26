import { getServiceClient } from '../lib/supabase';
import { submitOrder, closePosition } from '../lib/alpaca';
import type { SetupSignal, Trade } from '../lib/types';
import { log } from './logger';
import { STARTING_BALANCE, POSITION_ALLOCATION, getPositionInfo } from '../lib/utils';

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

  // Prevent duplicate open trades for the same symbol (only post-reset)
  const cutoff = process.env.RESET_CUTOFF_DATE || '2026-03-27';
  const { data: existing } = await supabase
    .from('trades')
    .select('id')
    .eq('symbol', signal.symbol)
    .eq('status', 'open')
    .gte('created_at', cutoff)
    .limit(1);

  if (existing && existing.length > 0) {
    return { trade: null, error: `Skipped — already have open trade for ${signal.symbol}` };
  }

  // Position sizing
  const balance = await getCurrentBalance();
  const positionSize = Math.max(1, Math.floor(balance * POSITION_ALLOCATION * 100) / 100);
  const quantity = positionSize / signal.entry_price;

  // Place Alpaca paper order
  let alpacaOrderId: string | null = null;
  try {
    const alpacaSymbol = signal.symbol.replace('-', '/'); // BTC-USD -> BTC/USD
    const order = await submitOrder({
      symbol: alpacaSymbol,
      notional: positionSize,
      side: 'buy',
    });
    alpacaOrderId = order.id;
    await log('info', `Alpaca order placed: ${signal.symbol} $${positionSize.toFixed(2)}`, {
      order_id: order.id,
      status: order.status,
    });
  } catch (err) {
    await log('warn', `Alpaca order failed for ${signal.symbol} — recording trade locally`, {
      error: String(err),
    });
    // Continue to record trade even if Alpaca fails
  }

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
    notes: JSON.stringify({ position_size: positionSize, quantity, alpaca_order_id: alpacaOrderId }),
  };

  try {
    const { data, error } = await supabase
      .from('trades')
      .insert(tradeData)
      .select()
      .single();

    if (error) {
      const msg = `Failed to record trade for ${signal.symbol}: ${error.message}`;
      await log('error', msg, { error: error.message });
      return { trade: null, error: msg };
    }

    await log('info', `Opened: ${signal.symbol} ${signal.setup_type} — $${positionSize.toFixed(2)} (${quantity.toFixed(6)} units)`, {
      trade_id: data.id,
      entry: signal.entry_price,
      position_size: positionSize,
    });

    return { trade: data as Trade, error: null };
  } catch (err) {
    const msg = `Exception opening trade for ${signal.symbol}: ${String(err)}`;
    await log('error', msg, { error: String(err) });
    return { trade: null, error: msg };
  }
}

export async function checkAndCloseTrades(
  currentPrices: Record<string, number>
): Promise<void> {
  const supabase = getServiceClient();

  const cutoff = process.env.RESET_CUTOFF_DATE || '2026-03-27';
  const { data: openTrades, error } = await supabase
    .from('trades')
    .select('*')
    .eq('status', 'open')
    .gte('created_at', cutoff);

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
      // Close on Alpaca
      try {
        const alpacaSymbol = trade.symbol.replace('-', '/');
        await closePosition(alpacaSymbol);
        await log('info', `Alpaca position closed: ${trade.symbol}`, {});
      } catch (err) {
        await log('warn', `Alpaca close failed for ${trade.symbol}: ${String(err)}`, {});
        // Continue to record close locally
      }

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
        await log('error', `Failed to close trade ${trade.id}`, { error: updateError.message });
        continue;
      }

      await log('info', `Closed: ${trade.symbol} ${outcome} — ${pnlDollars >= 0 ? '+' : ''}$${pnlDollars.toFixed(2)} (${pnlPercent.toFixed(1)}%)`, {
        trade_id: trade.id,
        pnl: pnlDollars,
      });
    }
  }
}
