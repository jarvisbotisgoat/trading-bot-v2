import { getServiceClient } from '../lib/supabase';
import type { SetupSignal, Trade } from '../lib/types';
import { log } from './logger';
// Telegram alerts disabled — user wants morning briefs only

export async function openPaperTrade(signal: SetupSignal): Promise<Trade | null> {
  const supabase = getServiceClient();

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
  };

  const { data, error } = await supabase
    .from('trades')
    .insert(tradeData)
    .select()
    .single();

  if (error) {
    await log('error', `Failed to open trade for ${signal.symbol}`, {
      error: error.message,
    });
    return null;
  }

  await log('info', `Opened paper trade: ${signal.symbol} ${signal.setup_type}`, {
    trade_id: data.id,
    entry: signal.entry_price,
  });

  // Log trade entry — no Telegram alert (user wants morning briefs only)
  return data as Trade;
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
      // Short trade
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
      const pnlDollars = isLong
        ? exitPrice - trade.entry_price
        : trade.entry_price - exitPrice;
      const pnlPercent = (pnlDollars / trade.entry_price) * 100;

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

      const closedTrade: Trade = {
        ...trade,
        exit_price: exitPrice,
        exit_time: new Date().toISOString(),
        outcome,
        pnl_dollars: pnlDollars,
        pnl_percent: pnlPercent,
        failure_reason: failureReason,
        status: 'closed',
      };

      await log('info', `Closed trade: ${trade.symbol} ${outcome}`, {
        trade_id: trade.id,
        pnl: pnlDollars,
      });

      // No Telegram alert — user wants morning briefs only
    }
  }
}
