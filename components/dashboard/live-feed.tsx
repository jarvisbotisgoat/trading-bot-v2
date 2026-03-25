'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface FeedLine {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'signal' | 'scan' | 'system' | 'error';
}

interface BotLogEntry {
  id: number;
  created_at: string;
  level: string;
  message: string;
  meta?: Record<string, unknown>;
}

interface ScanResult {
  symbol: string;
  price: number;
  bars_count: number;
  vwap: number;
  signals_found: number;
  skipped: boolean;
  signal_type?: string;
  wave_analysis?: {
    trend: string;
    rsi: number;
    emaSpread: number;
    volumeRatio: number;
  };
  trade_opened?: boolean;
  trade_error?: string;
}

interface LiveFeedProps {
  isRunning: boolean;
  onScanComplete?: () => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function now(): string {
  return formatTime(new Date().toISOString());
}

function displaySymbol(s: string): string {
  return s.replace('-USD', '');
}

let lineId = 100000;

function classifyLog(entry: BotLogEntry): FeedLine['type'] {
  const msg = entry.message.toLowerCase();
  if (entry.level === 'error') return 'error';
  if (msg.includes('signal') || msg.includes('opened paper trade')) return 'signal';
  if (msg.includes('scan started') || msg.includes('scanning')) return 'scan';
  if (msg.includes('completed') || msg.includes('started') || msg.includes('stopped') || msg.includes('closed trade')) return 'system';
  return 'info';
}

function getIcon(type: FeedLine['type'], message: string): string {
  if (type === 'signal') return '!!';
  if (type === 'scan') return '>>';
  if (type === 'system' && message.toLowerCase().includes('started')) return 'ON';
  if (type === 'system' && message.toLowerCase().includes('stopped')) return '--';
  if (type === 'system' && message.toLowerCase().includes('completed')) return 'OK';
  if (type === 'error') return 'XX';
  return '..';
}

function getColor(line: FeedLine): string {
  switch (line.type) {
    case 'signal': return 'text-[#00d4aa] font-semibold';
    case 'scan': return 'text-[#58a6ff]';
    case 'system': return line.message.toLowerCase().includes('started') ? 'text-[#00d4aa]' : line.message.toLowerCase().includes('stopped') ? 'text-yellow-400' : 'text-[#58a6ff]';
    case 'error': return 'text-[#ff4d4f]';
    default: return 'text-[#8b949e]';
  }
}

export function LiveFeed({ isRunning, onScanComplete }: LiveFeedProps) {
  const [lines, setLines] = useState<FeedLine[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const lastSeenId = useRef<number>(0);
  const wasRunning = useRef(false);
  const hasRunInitialScan = useRef(false);

  const addLine = useCallback((message: string, type: FeedLine['type'] = 'info') => {
    setLines(prev => [{ id: String(++lineId), time: now(), message, type }, ...prev].slice(0, 200));
  }, []);

  // Trigger one scan (on start or manual)
  const triggerScan = useCallback(async () => {
    setScanning(true);
    addLine('Scan started — fetching market data...', 'scan');

    try {
      const res = await fetch('/api/bot/scan');
      const data = await res.json();

      if (data.status === 'completed' && data.results) {
        const results: ScanResult[] = data.results;
        for (const r of results) {
          const sym = displaySymbol(r.symbol);
          const wave = r.wave_analysis;
          const waveTag = wave
            ? ` [${wave.trend.toUpperCase()} RSI:${wave.rsi.toFixed(0)} Vol:${wave.volumeRatio.toFixed(1)}x]`
            : '';

          if (r.price === 0) {
            addLine(`${sym}: no data available`, 'info');
          } else if (r.skipped) {
            addLine(`${sym}: $${r.price.toFixed(2)} — monitoring open trade${waveTag}`, 'info');
          } else if (r.signals_found > 0) {
            const direction = r.signal_type?.includes('SHORT') ? 'SHORT' : 'LONG';
            if (r.trade_opened) {
              addLine(`${sym}: $${r.price.toFixed(2)} — OPENED ${direction} (${r.signal_type})${waveTag}`, 'signal');
            } else if (r.trade_error) {
              addLine(`${sym}: $${r.price.toFixed(2)} — ${direction} signal but FAILED: ${r.trade_error}`, 'error');
            } else {
              addLine(`${sym}: $${r.price.toFixed(2)} — ${direction} SIGNAL: ${r.signal_type}${waveTag}`, 'signal');
            }
          } else {
            addLine(`${sym}: $${r.price.toFixed(2)} — watching${waveTag}`, 'info');
          }
        }
        const signals = results.filter(r => r.signals_found > 0).length;
        addLine(`Scan completed — ${results.length} symbols, ${signals} signal${signals !== 1 ? 's' : ''}`, 'system');
      } else if (data.status === 'skipped') {
        addLine('Scan skipped — bot is stopped', 'system');
      } else if (data.status === 'error') {
        addLine(`Scan error: ${data.error}`, 'error');
      }

      onScanComplete?.();
    } catch (err) {
      addLine(`Scan failed: ${String(err)}`, 'error');
    } finally {
      setScanning(false);
    }
  }, [addLine, onScanComplete]);

  // Fetch recent logs from database to backfill the feed
  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/feed?limit=50');
      if (!res.ok) return;

      const logs: BotLogEntry[] = await res.json();
      if (!Array.isArray(logs) || logs.length === 0) return;

      const maxId = Math.max(...logs.map(l => l.id));
      const hasNew = maxId > lastSeenId.current;
      lastSeenId.current = maxId;

      // Convert logs to feed lines
      const feedLines: FeedLine[] = logs.map((entry) => {
        const type = classifyLog(entry);
        return {
          id: `log-${entry.id}`,
          time: formatTime(entry.created_at),
          message: entry.message,
          type,
        };
      });

      // Merge: keep local lines (from live scans) + add DB lines we don't have
      setLines(prev => {
        const localIds = new Set(prev.map(l => l.id));
        const newFromDb = feedLines.filter(l => !localIds.has(l.id));
        if (newFromDb.length === 0 && prev.length > 0) return prev;
        return [...prev.filter(l => !l.id.startsWith('log-')), ...feedLines].slice(0, 200);
      });

      setLastFetch(now());

      if (hasNew) {
        onScanComplete?.();
      }
    } catch {
      // Silently fail
    }
  }, [onScanComplete]);

  // When bot starts: run one immediate scan + log it
  useEffect(() => {
    if (isRunning && !wasRunning.current) {
      addLine('Bot started — running initial scan', 'system');
      hasRunInitialScan.current = false;
    } else if (!isRunning && wasRunning.current) {
      addLine('Bot stopped by user', 'system');
    }
    wasRunning.current = isRunning;
  }, [isRunning, addLine]);

  // Trigger initial scan when bot starts
  useEffect(() => {
    if (isRunning && !hasRunInitialScan.current) {
      hasRunInitialScan.current = true;
      triggerScan();
    }
  }, [isRunning, triggerScan]);

  // Poll DB logs every 15 seconds for background cron activity
  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 15000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  // Auto-scroll to top (newest)
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [lines]);

  return (
    <div className="space-y-2">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00d4aa] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00d4aa]" />
            </span>
          )}
          <h2 className="text-sm text-[#8b949e] uppercase tracking-wider">
            {isRunning ? 'Live Feed' : 'Bot Log'}
          </h2>
          {scanning && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#58a6ff]/10 border border-[#58a6ff]/30 px-2 py-0.5 text-[10px] font-medium text-[#58a6ff]">
              <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-[#58a6ff] border-t-transparent" />
              SCANNING
            </span>
          )}
          {isRunning && !scanning && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#00d4aa]/10 border border-[#00d4aa]/30 px-2 py-0.5 text-[10px] font-medium text-[#00d4aa]">
              ACTIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-[#484f58]">
          {lastFetch && <span>Updated: {lastFetch}</span>}
          <span>{lines.length} entries</span>
        </div>
      </div>

      {/* Terminal feed */}
      <div
        ref={feedRef}
        className="h-[300px] overflow-y-auto rounded-lg bg-[#0d1117] border border-[#1e2733] p-3 font-mono text-xs leading-relaxed"
      >
        {lines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[#484f58]">
            {isRunning ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#484f58] border-t-transparent mr-2" />
                Connecting...
              </>
            ) : (
              'Hit "Start Bot" to begin scanning'
            )}
          </div>
        ) : (
          lines.map((line) => (
            <div key={line.id} className="flex gap-2 py-0.5 hover:bg-[#161b22] -mx-1 px-1 rounded">
              <span className="text-[#484f58] shrink-0">{line.time}</span>
              <span className={`shrink-0 font-bold ${getColor(line)}`}>
                [{getIcon(line.type, line.message)}]
              </span>
              <span className={getColor(line)}>{line.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
