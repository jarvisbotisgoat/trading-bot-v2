import TelegramBot from 'node-telegram-bot-api';
import type { Trade, SetupSignal } from '../lib/types';
import { log } from './logger';

let bot: TelegramBot | null = null;

function getBot(): TelegramBot | null {
  if (!process.env.TELEGRAM_BOT_TOKEN) return null;
  if (!bot) {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
  }
  return bot;
}

function getChatId(): string {
  return process.env.TELEGRAM_CHAT_ID || '';
}

export async function sendEntryAlert(signal: SetupSignal) {
  const b = getBot();
  if (!b || !getChatId()) return;

  const riskPerShare = Math.abs(signal.entry_price - signal.stop_price);
  const rewardPerShare = Math.abs(signal.target_price - signal.entry_price);
  const rr = riskPerShare > 0 ? (rewardPerShare / riskPerShare).toFixed(1) : '?';

  const setupNames: Record<string, string> = {
    ORB: 'Opening Range Breakout',
    VWAP_RECLAIM: 'VWAP Reclaim',
    HOD_BREAK: 'HOD Break',
  };

  const message = `🟢 SIGNAL — $${signal.symbol}
Setup: ${setupNames[signal.setup_type] || signal.setup_type}
Entry zone: $${signal.entry_price.toFixed(2)}
Stop: $${signal.stop_price.toFixed(2)}
Target: $${signal.target_price.toFixed(2)} (${rr}R)
Risk: ${((riskPerShare / signal.entry_price) * 100).toFixed(1)}%
Confidence: ${signal.entry_quality_score}/10 — ${signal.thesis}`;

  try {
    await b.sendMessage(getChatId(), message);
    await log('info', `Telegram entry alert sent for ${signal.symbol}`);
  } catch (err) {
    await log('error', 'Failed to send Telegram entry alert', {
      error: String(err),
      symbol: signal.symbol,
    });
  }
}

export async function sendExitAlert(trade: Trade) {
  const b = getBot();
  if (!b || !getChatId()) return;

  const pnl = trade.pnl_dollars ?? 0;
  const riskPerShare = Math.abs(trade.entry_price - trade.stop_price);
  const rMultiple =
    riskPerShare > 0
      ? ((trade.exit_price! - trade.entry_price) / riskPerShare).toFixed(1)
      : '?';

  const emoji = trade.outcome === 'win' ? '✅' : trade.outcome === 'loss' ? '❌' : '➖';
  const durationMs =
    trade.exit_time && trade.entry_time
      ? new Date(trade.exit_time).getTime() - new Date(trade.entry_time).getTime()
      : 0;
  const durationMin = Math.round(durationMs / 60000);

  const message = `🔴 CLOSED — $${trade.symbol}
Result: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)} (${rMultiple}R) ${emoji}
Setup: ${trade.setup_type} | Entry: $${trade.entry_price.toFixed(2)} | Exit: $${(trade.exit_price ?? 0).toFixed(2)}
Duration: ${durationMin} min
${trade.failure_reason ? `Note: ${trade.failure_reason}` : trade.notes ? `Note: ${trade.notes}` : ''}`;

  try {
    await b.sendMessage(getChatId(), message);
    await log('info', `Telegram exit alert sent for ${trade.symbol}`);
  } catch (err) {
    await log('error', 'Failed to send Telegram exit alert', {
      error: String(err),
      symbol: trade.symbol,
    });
  }
}

export async function sendDailyRecap(recap: string) {
  const b = getBot();
  if (!b || !getChatId()) return;

  try {
    await b.sendMessage(getChatId(), `📊 DAILY RECAP\n\n${recap}`);
  } catch (err) {
    await log('error', 'Failed to send daily recap', { error: String(err) });
  }
}
