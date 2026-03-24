-- Run this in the Supabase SQL Editor to create all tables

-- Trades table
create table if not exists trades (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  symbol text not null,
  setup_type text not null,
  market_regime text,
  entry_price numeric not null,
  stop_price numeric not null,
  target_price numeric not null,
  entry_time timestamptz not null,
  exit_price numeric,
  exit_time timestamptz,
  outcome text check (outcome in ('win', 'loss', 'breakeven')),
  pnl_dollars numeric,
  pnl_percent numeric,
  risk_percent numeric,
  entry_quality_score integer check (entry_quality_score between 1 and 10),
  thesis text,
  failure_reason text,
  notes text,
  status text not null default 'open' check (status in ('open', 'closed'))
);

-- Setups table
create table if not exists setups (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  description text,
  score numeric default 0,
  trade_count integer default 0,
  win_rate numeric default 0,
  avg_rr numeric default 0,
  last_updated timestamptz default now(),
  is_active boolean default true
);

-- Daily summary table
create table if not exists daily_summary (
  id uuid default gen_random_uuid() primary key,
  date date not null unique,
  total_pnl numeric default 0,
  win_count integer default 0,
  loss_count integer default 0,
  win_rate numeric default 0,
  max_drawdown numeric default 0,
  best_trade_id uuid references trades(id),
  worst_trade_id uuid references trades(id),
  notes text
);

-- Bot log table
create table if not exists bot_log (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  level text not null check (level in ('info', 'warn', 'error')),
  message text not null,
  metadata jsonb
);

-- Seed default setups
insert into setups (name, description, score, is_active) values
  ('ORB', 'Opening Range Breakout — first 15min range, price breaks above/below with volume', 5.0, true),
  ('VWAP_RECLAIM', 'VWAP Reclaim — price dips below VWAP then closes back above', 5.0, true),
  ('HOD_BREAK', 'High of Day Break — price breaks prior high of day with momentum', 5.0, true)
on conflict (name) do nothing;

-- Create indexes for common queries
create index if not exists idx_trades_status on trades(status);
create index if not exists idx_trades_symbol on trades(symbol);
create index if not exists idx_trades_created_at on trades(created_at desc);
create index if not exists idx_bot_log_created_at on bot_log(created_at desc);
create index if not exists idx_daily_summary_date on daily_summary(date desc);
