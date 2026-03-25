import { log } from './logger';
import { sendTelegramMessage } from './telegram';
import { FULL_SCAN_LIST } from './watchlist';

/**
 * Premarket Scanner
 *
 * Scans a broad list of popular stocks + crypto for big overnight/premarket moves.
 * Sends Telegram alerts for anything worth watching at the open.
 * Runs every 30 min from 4 AM – 6:30 AM PST.
 */

interface ScanHit {
  symbol: string;
  price: number;
  prevClose: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  isCrypto: boolean;
}

async function fetchQuote(symbol: string): Promise<ScanHit | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const quotes = result.indicators?.quote?.[0];

    const currentPrice = meta.regularMarketPrice || 0;
    const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
    if (!currentPrice || !prevClose) return null;

    const changePct = ((currentPrice - prevClose) / prevClose) * 100;

    // Get volume info
    const volumes: number[] = (quotes?.volume || []).filter((v: number | null) => v != null && v > 0);
    const avgVolume = volumes.length > 1
      ? volumes.slice(0, -1).reduce((a: number, b: number) => a + b, 0) / (volumes.length - 1)
      : 0;
    const currentVolume = volumes.length > 0 ? volumes[volumes.length - 1] : 0;

    return {
      symbol: symbol.replace('-USD', ''),
      price: currentPrice,
      prevClose,
      changePct,
      volume: currentVolume,
      avgVolume,
      isCrypto: symbol.endsWith('-USD'),
    };
  } catch {
    return null;
  }
}

function formatPrice(price: number): string {
  if (price > 1000) return `$${price.toFixed(0)}`;
  if (price > 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

function getWhyItMatters(hit: ScanHit): string {
  const absPct = Math.abs(hit.changePct);
  const direction = hit.changePct > 0 ? 'up' : 'down';
  const volRatio = hit.avgVolume > 0 ? hit.volume / hit.avgVolume : 0;

  if (hit.isCrypto) {
    if (absPct > 5) return `Big ${direction} move — crypto is volatile today, could see continuation or a sharp reversal`;
    if (absPct > 2) return `Moderate ${direction} swing — watch for the trend to confirm before jumping in`;
    return `Steady ${direction} drift — might set up a good wave trade`;
  }

  if (absPct > 5) {
    return hit.changePct > 0
      ? `Major gap up — likely big news. Watch for a "pullback buy" after the first 15 min. Don't chase the open.`
      : `Major gap down — something happened. Could bounce hard or keep falling. Wait for the first candle to decide.`;
  }

  if (absPct > 2) {
    return hit.changePct > 0
      ? `Solid gap up. If it holds above yesterday's close at ${formatPrice(hit.prevClose)} in the first 15 min, that's bullish.`
      : `Notable drop. If it breaks below ${formatPrice(hit.prevClose)} at the open, could keep falling. If it bounces, nice reversal play.`;
  }

  if (volRatio > 2) {
    return `Volume is ${volRatio.toFixed(1)}x normal — someone big is moving this stock. Worth watching even though the price move is small.`;
  }

  return hit.changePct > 0
    ? `Mild gap up — not urgent, but keep it on the radar if it breaks the high of the first 15 min.`
    : `Mild dip — could be a buying opportunity if it finds support early.`;
}

function getTradePlan(hit: ScanHit): string {
  const price = hit.price;

  if (hit.changePct > 2) {
    const pullbackEntry = price * 0.99;
    const stop = price * 0.975;
    const target = price * 1.02;
    return `PLAY: Wait for pullback to ~${formatPrice(pullbackEntry)}, stop ${formatPrice(stop)}, target ${formatPrice(target)}`;
  }

  if (hit.changePct < -2) {
    const bounceEntry = price * 1.005;
    const stop = price * 1.025;
    const target = price * 0.98;
    return `PLAY: Short if it rejects ${formatPrice(bounceEntry)}, stop ${formatPrice(stop)}, target ${formatPrice(target)}`;
  }

  if (hit.changePct > 0) {
    const breakoutLevel = price * 1.005;
    return `PLAY: Watch for breakout above ${formatPrice(breakoutLevel)} in first 15 min with volume`;
  }

  const supportLevel = price * 0.995;
  return `PLAY: Watch ${formatPrice(supportLevel)} as support — bounce = long, break = short`;
}

export async function runPremarketScan(): Promise<void> {
  await log('info', 'Premarket scanner running');

  // Fetch all quotes in parallel
  const results = await Promise.all(FULL_SCAN_LIST.map(fetchQuote));
  const hits = results.filter((r): r is ScanHit => r !== null);

  // Filter for interesting movers: >1% move or unusual volume
  const movers = hits
    .filter(h => Math.abs(h.changePct) > 1 || (h.avgVolume > 0 && h.volume / h.avgVolume > 2))
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  if (movers.length === 0) {
    // Quiet market — don't spam Telegram, just log it
    await log('info', 'Premarket scan: quiet market, no movers — skipping Telegram');
    return;
  }

  // Build alert for each mover
  let msg = `🔥 PREMARKET MOVERS ALERT\n\n`;
  msg += `Found ${movers.length} stock${movers.length > 1 ? 's' : ''} making moves right now:\n\n`;

  for (const mover of movers.slice(0, 8)) {
    const arrow = mover.changePct >= 0 ? '🟢' : '🔴';
    const sign = mover.changePct >= 0 ? '+' : '';
    const volTag = mover.avgVolume > 0 && mover.volume / mover.avgVolume > 1.5
      ? ` | Vol: ${(mover.volume / mover.avgVolume).toFixed(1)}x avg`
      : '';

    msg += `${arrow} $${mover.symbol}: ${formatPrice(mover.price)} (${sign}${mover.changePct.toFixed(1)}%)${volTag}\n`;
    msg += `↳ ${getWhyItMatters(mover)}\n`;
    msg += `↳ ${getTradePlan(mover)}\n\n`;
  }

  // Quick summary
  const bullish = movers.filter(m => m.changePct > 1);
  const bearish = movers.filter(m => m.changePct < -1);

  msg += `📊 MARKET VIBE\n`;
  if (bullish.length > bearish.length * 2) {
    msg += `Mostly green — market feeling bullish this morning. Look for long setups.\n`;
  } else if (bearish.length > bullish.length * 2) {
    msg += `Mostly red — market feeling heavy. Be careful with longs, watch for short setups.\n`;
  } else {
    msg += `Mixed signals — some up, some down. Be selective and wait for clean setups.\n`;
  }

  msg += `\n⏰ Next scan in 30 min. Market opens 6:30 AM PT.`;

  await sendTelegramMessage(msg);
  await log('info', `Premarket scan: found ${movers.length} movers, sent alert`);
}
