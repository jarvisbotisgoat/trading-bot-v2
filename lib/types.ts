export type TradeStatus = 'open' | 'closed';
export type TradeOutcome = 'win' | 'loss' | 'breakeven' | null;
export type BotLogLevel = 'info' | 'warn' | 'error';
export type SetupType = 'ORB' | 'VWAP_RECLAIM' | 'HOD_BREAK' | 'WAVE_LONG' | 'WAVE_SHORT';

export interface Trade {
  id: string;
  created_at: string;
  symbol: string;
  setup_type: SetupType;
  market_regime: string | null;
  entry_price: number;
  stop_price: number;
  target_price: number;
  entry_time: string;
  exit_price: number | null;
  exit_time: string | null;
  outcome: TradeOutcome;
  pnl_dollars: number | null;
  pnl_percent: number | null;
  risk_percent: number | null;
  entry_quality_score: number | null;
  thesis: string | null;
  failure_reason: string | null;
  notes: string | null;
  status: TradeStatus;
}

export interface Setup {
  id: string;
  name: string;
  description: string | null;
  score: number;
  trade_count: number;
  win_rate: number;
  avg_rr: number;
  last_updated: string;
  is_active: boolean;
}

export interface DailySummary {
  id?: string;
  date: string;
  total_pnl: number;
  win_count: number;
  loss_count: number;
  win_rate: number;
  max_drawdown: number;
  best_trade_id: string | null;
  worst_trade_id: string | null;
  notes: string | null;
}

export interface BotLog {
  id?: string;
  created_at?: string;
  level: BotLogLevel;
  message: string;
  metadata: Record<string, unknown> | null;
}

export interface BotStatus {
  status: 'active' | 'idle' | 'error';
  lastRun: string | null;
  openTrades: number;
  message?: string;
}

export interface SetupSignal {
  symbol: string;
  setup_type: SetupType;
  entry_price: number;
  stop_price: number;
  target_price: number;
  thesis: string;
  entry_quality_score: number;
  market_regime: string;
}

export interface PriceBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
