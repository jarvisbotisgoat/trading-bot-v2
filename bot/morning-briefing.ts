import { getServiceClient } from '../lib/supabase';
import { fetchCryptoBars } from './crypto-fetch';
import { analyzeWave } from './wave-strategy';
import { log } from './logger';
import { sendTelegramMessage } from './telegram';

const STOCK_WATCHLIST = (process.env.WATCHLIST || 'TSLA,NVDA,SPY,AAPL,AMZN').split(',');
const CRYPTO_WATCHLIST = ['BTC-USD', 'ETH-USD', 'SOL-USD'];

interface MarketMover {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
}

interface NewsItem {
  title: string;
  source: string;
}

/**
 * Fetch stock quotes from Yahoo Finance for premarket data.
 */
async function fetchStockQuotes(): Promise<MarketMover[]> {
  const movers: MarketMover[] = [];

  for (const symbol of STOCK_WATCHLIST) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) continue;

      const json = await res.json();
      const meta = json?.chart?.result?.[0]?.meta;
      const quotes = json?.chart?.result?.[0]?.indicators?.quote?.[0];

      if (meta && quotes) {
        const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
        const currentPrice = meta.regularMarketPrice || 0;
        const change = currentPrice - prevClose;
        const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

        movers.push({ symbol, price: currentPrice, change, changePct });
      }
    } catch {
      // skip
    }
  }

  return movers;
}

/**
 * Fetch crypto quotes and wave analysis.
 */
async function fetchCryptoAnalysis(): Promise<{ symbol: string; price: number; changePct: number; trend: string; rsi: number }[]> {
  const analysis = [];

  for (const symbol of CRYPTO_WATCHLIST) {
    try {
      const bars = await fetchCryptoBars(symbol);
      if (bars.length < 25) continue;

      const latest = bars[bars.length - 1];
      const dayAgo = bars.find(b => b.time <= latest.time - 86400);
      const prevPrice = dayAgo?.close || bars[0].close;
      const changePct = ((latest.close - prevPrice) / prevPrice) * 100;

      // Compute VWAP
      let cTPV = 0, cVol = 0;
      for (const b of bars) {
        const tp = (b.high + b.low + b.close) / 3;
        cTPV += tp * b.volume;
        cVol += b.volume;
      }
      const vwap = cVol > 0 ? cTPV / cVol : latest.close;

      const wave = analyzeWave(bars, vwap);

      analysis.push({
        symbol: symbol.replace('-USD', ''),
        price: latest.close,
        changePct,
        trend: wave.trend,
        rsi: wave.rsi,
      });
    } catch {
      // skip
    }
  }

  return analysis;
}

/**
 * Fetch top financial headlines from Yahoo Finance RSS.
 */
async function fetchMarketNews(): Promise<NewsItem[]> {
  const news: NewsItem[] = [];

  try {
    // Yahoo Finance RSS for market news
    const res = await fetch('https://feeds.finance.yahoo.com/rss/2.0/headline?s=TSLA,NVDA,AAPL,SPY,BTC-USD&region=US&lang=en-US', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (res.ok) {
      const text = await res.text();
      // Simple XML parse for titles
      const titleMatches = Array.from(text.matchAll(/<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<\/item>/g));

      for (const match of titleMatches) {
        if (news.length >= 5) break;
        news.push({ title: match[1], source: 'Yahoo Finance' });
      }
    }
  } catch {
    // fallback — no news available
  }

  // Fallback if RSS didn't work — try simple page scrape for titles
  if (news.length === 0) {
    try {
      const res = await fetch('https://finance.yahoo.com/topic/stock-market-news/', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (res.ok) {
        const text = await res.text();
        const matches = Array.from(text.matchAll(/<h3[^>]*>(.*?)<\/h3>/g));
        for (const match of matches) {
          if (news.length >= 5) break;
          const clean = match[1].replace(/<[^>]+>/g, '').trim();
          if (clean.length > 15) {
            news.push({ title: clean, source: 'Yahoo Finance' });
          }
        }
      }
    } catch {
      // no news
    }
  }

  return news;
}

/**
 * Check bot's recent performance for the briefing.
 */
async function getRecentPerformance(): Promise<{ totalTrades: number; wins: number; losses: number; totalPnl: number; bestSetup: string }> {
  try {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from('trades')
      .select('outcome, pnl_dollars, setup_type')
      .eq('status', 'closed')
      .order('exit_time', { ascending: false })
      .limit(20);

    if (!data || data.length === 0) {
      return { totalTrades: 0, wins: 0, losses: 0, totalPnl: 0, bestSetup: 'none yet' };
    }

    const wins = data.filter((t: { outcome: string }) => t.outcome === 'win').length;
    const losses = data.filter((t: { outcome: string }) => t.outcome === 'loss').length;
    const totalPnl = data.reduce((sum: number, t: { pnl_dollars: number | null }) => sum + (t.pnl_dollars || 0), 0);

    // Find best setup type
    const setupCounts: Record<string, number> = {};
    for (const t of data.filter((t: { outcome: string }) => t.outcome === 'win')) {
      const st = (t as { setup_type: string }).setup_type;
      setupCounts[st] = (setupCounts[st] || 0) + 1;
    }
    const bestSetup = Object.entries(setupCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none yet';

    return { totalTrades: data.length, wins, losses, totalPnl, bestSetup };
  } catch {
    return { totalTrades: 0, wins: 0, losses: 0, totalPnl: 0, bestSetup: 'none yet' };
  }
}

/**
 * Build and send the morning briefing to Telegram.
 */
export async function sendMorningBriefing(): Promise<void> {
  await log('info', 'Morning briefing starting');

  const [stocks, crypto, news, performance] = await Promise.all([
    fetchStockQuotes(),
    fetchCryptoAnalysis(),
    fetchMarketNews(),
    getRecentPerformance(),
  ]);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  // ============ BUILD THE MESSAGE ============
  let msg = `☀️ MORNING BRIEFING — ${today}\n\n`;

  // --- NEWS ---
  if (news.length > 0) {
    msg += `📰 WHAT'S HAPPENING\n`;
    for (const n of news) {
      msg += `• ${n.title}\n`;
    }
    msg += `\n`;
  } else {
    msg += `📰 No major news overnight\n\n`;
  }

  // --- STOCKS PREMARKET ---
  msg += `📊 STOCK WATCHLIST\n`;
  if (stocks.length > 0) {
    for (const s of stocks) {
      const arrow = s.changePct >= 0 ? '🟢' : '🔴';
      const sign = s.changePct >= 0 ? '+' : '';
      msg += `${arrow} $${s.symbol}: $${s.price.toFixed(2)} (${sign}${s.changePct.toFixed(1)}%)\n`;
    }
  } else {
    msg += `Markets not open yet — prices at yesterday's close\n`;
  }
  msg += `\n`;

  // --- CRYPTO ---
  msg += `🪙 CRYPTO STATUS\n`;
  if (crypto.length > 0) {
    for (const c of crypto) {
      const arrow = c.changePct >= 0 ? '🟢' : '🔴';
      const sign = c.changePct >= 0 ? '+' : '';
      const trendEmoji = c.trend === 'bullish' ? '📈' : c.trend === 'bearish' ? '📉' : '➡️';
      msg += `${arrow} $${c.symbol}: $${c.price.toFixed(c.price > 100 ? 0 : 2)} (${sign}${c.changePct.toFixed(1)}%) ${trendEmoji} RSI: ${c.rsi.toFixed(0)}\n`;
    }
  } else {
    msg += `Could not fetch crypto data\n`;
  }
  msg += `\n`;

  // --- WHAT TO WATCH ---
  msg += `🎯 TODAY'S GAME PLAN\n`;

  // Stock plays
  const bigMovers = stocks.filter(s => Math.abs(s.changePct) > 1).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  if (bigMovers.length > 0) {
    for (const m of bigMovers.slice(0, 2)) {
      if (m.changePct > 1) {
        msg += `• ${m.symbol} is up ${m.changePct.toFixed(1)}% → watch for pullback-to-VWAP long entry\n`;
      } else {
        msg += `• ${m.symbol} is down ${Math.abs(m.changePct).toFixed(1)}% → watch for breakdown or bounce at support\n`;
      }
    }
  } else {
    msg += `• No big stock movers yet — wait for the open and watch for ORB setups on TSLA/NVDA\n`;
  }

  // Crypto plays
  const btc = crypto.find(c => c.symbol === 'BTC');
  if (btc) {
    if (btc.trend === 'bullish') {
      msg += `• BTC trending bullish (RSI ${btc.rsi.toFixed(0)}) → bot will look for wave longs\n`;
    } else if (btc.trend === 'bearish') {
      msg += `• BTC trending bearish (RSI ${btc.rsi.toFixed(0)}) → bot will look for wave shorts\n`;
    } else {
      msg += `• BTC is neutral — bot will wait for a direction before entering\n`;
    }
  }
  msg += `\n`;

  // --- SIMPLE EXPLANATION ---
  msg += `📖 WHAT THIS MEANS (FOR BEGINNERS)\n`;

  if (bigMovers.length > 0 && bigMovers[0].changePct > 2) {
    msg += `A stock moving 2%+ before the market opens usually means big news. `;
    msg += `The bot will watch for a "pullback" — that's when the price dips a little after the initial move, giving us a safer entry point.\n`;
  } else if (bigMovers.length > 0 && bigMovers[0].changePct < -2) {
    msg += `A stock dropping 2%+ premarket can mean bad news. `;
    msg += `The bot watches to see if it keeps falling (short opportunity) or bounces back (reversal play).\n`;
  } else {
    msg += `Quiet morning so far. The bot will watch the first 15 min of trading to see which direction stocks break — that's called the "opening range breakout" (ORB). It's one of the safest setups.\n`;
  }

  if (btc) {
    msg += `\nFor crypto: RSI ${btc.rsi.toFixed(0)} means `;
    if (btc.rsi > 70) msg += `BTC is "overbought" — it's been going up a lot and might pull back soon. We'll be cautious with longs.`;
    else if (btc.rsi < 30) msg += `BTC is "oversold" — it's been beaten down and might bounce. Good spot to watch for a reversal.`;
    else if (btc.rsi > 55) msg += `BTC has some bullish momentum. Not overheated, good conditions for the bot to catch an up-wave.`;
    else if (btc.rsi < 45) msg += `BTC is leaning bearish. The bot might catch a short wave (profit when price goes down).`;
    else msg += `BTC is right in the middle — could go either way. The bot needs a clear signal before trading.`;
    msg += `\n`;
  }
  msg += `\n`;

  // --- BOT PERFORMANCE ---
  if (performance.totalTrades > 0) {
    const winRate = performance.totalTrades > 0 ? ((performance.wins / performance.totalTrades) * 100).toFixed(0) : '0';
    msg += `📈 BOT TRACK RECORD (last ${performance.totalTrades} trades)\n`;
    msg += `Wins: ${performance.wins} | Losses: ${performance.losses} | Win rate: ${winRate}%\n`;
    msg += `Total P/L: ${performance.totalPnl >= 0 ? '+' : ''}$${performance.totalPnl.toFixed(0)}\n`;
    msg += `Best strategy: ${performance.bestSetup}\n\n`;
  }

  msg += `⏰ Market opens at 6:30 AM PT. Bot is watching.\nGood morning! ☕`;

  // Send it
  await sendTelegramMessage(msg);

  // Also save to plan page
  try {
    const supabase = getServiceClient();
    const todayStr = new Date().toISOString().split('T')[0];

    const planSlots = [];

    // Stocks
    for (const m of bigMovers.slice(0, 2)) {
      planSlots.push({
        symbol: m.symbol,
        thesis: m.changePct > 0
          ? `Gap up ${m.changePct.toFixed(1)}% — watch for pullback to VWAP`
          : `Gap down ${Math.abs(m.changePct).toFixed(1)}% — watch for breakdown or bounce`,
        entryZone: `Near VWAP ($${m.price.toFixed(2)} area)`,
        stop: `$${(m.price * (m.changePct > 0 ? 0.99 : 1.01)).toFixed(2)}`,
        target: `$${(m.price * (m.changePct > 0 ? 1.02 : 0.98)).toFixed(2)}`,
        invalidation: m.changePct > 0 ? 'Fails to hold VWAP on pullback' : 'Bounces hard above VWAP',
      });
    }

    // Crypto
    if (btc) {
      planSlots.push({
        symbol: 'BTC',
        thesis: `${btc.trend} trend, RSI ${btc.rsi.toFixed(0)} — wave ${btc.trend === 'bearish' ? 'short' : 'long'} setup`,
        entryZone: `~$${btc.price.toFixed(0)}`,
        stop: `$${(btc.price * (btc.trend === 'bearish' ? 1.003 : 0.997)).toFixed(0)}`,
        target: `$${(btc.price * (btc.trend === 'bearish' ? 0.994 : 1.006)).toFixed(0)}`,
        invalidation: 'Trend reverses on EMA crossover',
      });
    }

    while (planSlots.length < 3) {
      planSlots.push({ symbol: '', thesis: '', entryZone: '', stop: '', target: '', invalidation: '' });
    }

    await supabase.from('daily_summary').upsert(
      {
        date: todayStr,
        notes: JSON.stringify({ slots: planSlots.slice(0, 3), holdAllDay: '', swingWindow: '6:30–8:00 AM PT' }),
        total_pnl: 0, win_count: 0, loss_count: 0, win_rate: 0, max_drawdown: 0,
      },
      { onConflict: 'date' }
    );
  } catch {
    // non-critical
  }

  await log('info', 'Morning briefing sent to Telegram');
}
