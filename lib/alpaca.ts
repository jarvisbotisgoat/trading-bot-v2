/**
 * Alpaca Paper Trading API client.
 * Uses REST API directly — no heavy npm packages needed.
 *
 * Required env vars:
 *   ALPACA_API_KEY     — Paper trading API key
 *   ALPACA_API_SECRET  — Paper trading API secret
 */

const PAPER_BASE = 'https://paper-api.alpaca.markets';
const DATA_BASE = 'https://data.alpaca.markets';

function getHeaders(): Record<string, string> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) {
    throw new Error('ALPACA_API_KEY and ALPACA_API_SECRET must be set');
  }
  return {
    'APCA-API-KEY-ID': key,
    'APCA-API-SECRET-KEY': secret,
    'Content-Type': 'application/json',
  };
}

// --- Account ---

export interface AlpacaAccount {
  id: string;
  equity: string;
  cash: string;
  buying_power: string;
  portfolio_value: string;
  status: string;
}

export async function getAccount(): Promise<AlpacaAccount> {
  const res = await fetch(`${PAPER_BASE}/v2/account`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Alpaca account error: ${res.status} ${await res.text()}`);
  return res.json();
}

// --- Orders ---

export interface AlpacaOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty?: string;
  notional?: string;
  type: string;
  status: string;
  filled_avg_price?: string;
  filled_qty?: string;
  created_at: string;
}

export async function submitOrder(params: {
  symbol: string;       // e.g. "BTC/USD"
  notional: number;     // dollar amount to buy
  side: 'buy' | 'sell';
}): Promise<AlpacaOrder> {
  const res = await fetch(`${PAPER_BASE}/v2/orders`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      symbol: params.symbol,
      notional: params.notional.toFixed(2),
      side: params.side,
      type: 'market',
      time_in_force: 'ioc', // immediate or cancel for crypto
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Alpaca order error: ${res.status} ${body}`);
  }
  return res.json();
}

export async function closePosition(symbol: string): Promise<AlpacaOrder> {
  // Alpaca uses symbol format without slash for position close
  const alpacaSymbol = symbol.replace('/', '');
  const res = await fetch(`${PAPER_BASE}/v2/positions/${alpacaSymbol}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Alpaca close error: ${res.status} ${body}`);
  }
  return res.json();
}

// --- Positions ---

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  side: string;
}

export async function getPositions(): Promise<AlpacaPosition[]> {
  const res = await fetch(`${PAPER_BASE}/v2/positions`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Alpaca positions error: ${res.status}`);
  return res.json();
}

// --- Market Data (Crypto) ---

export interface CryptoPrice {
  symbol: string;
  price: number;
  timestamp: string;
}

export async function getCryptoPrices(symbols: string[]): Promise<Record<string, number>> {
  // Alpaca crypto symbols use slash: BTC/USD
  const alpacaSymbols = symbols.map(s => s.replace('-', '/'));
  const params = new URLSearchParams({ symbols: alpacaSymbols.join(',') });
  const res = await fetch(
    `${DATA_BASE}/v1beta3/crypto/us/latest/trades?${params}`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    throw new Error(`Alpaca prices error: ${res.status}`);
  }
  const data = await res.json();
  const prices: Record<string, number> = {};

  // Map back to our format (BTC-USD)
  for (const symbol of symbols) {
    const alpacaSym = symbol.replace('-', '/');
    const trade = data.trades?.[alpacaSym];
    if (trade?.p) {
      prices[symbol] = trade.p;
    }
  }
  return prices;
}
