'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface FeedLine {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'signal' | 'scan' | 'system' | 'error';
}

interface ScanResult {
  symbol: string;
  price: number;
  bars_count: number;
  vwap: number;
  signals_found: number;
  skipped: boolean;
  signal_type?: string;
}

interface LiveFeedProps {
  isRunning: boolean;
  onScanComplete?: () => void;
}

function now(): string {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function displaySymbol(s: string): string {
  return s.replace('-USD', '');
}

let lineId = 0;
function makeLine(message: string, type: FeedLine['type'] = 'info'): FeedLine {
  return { id: String(++lineId), time: now(), message, type };
}

function getIcon(type: FeedLine['type'], message: string): string {
  if (type === 'signal') return '!!';
  if (type === 'scan') return '>>';
  if (type === 'system' && message.includes('started')) return 'ON';
  if (type === 'system' && message.includes('stopped')) return '--';
  if (type === 'system' && message.includes('completed')) return 'OK';
  if (type === 'error') return 'XX';
  return '..';
}

function getColor(line: FeedLine): string {
  switch (line.type) {
    case 'signal': return 'text-[#00d4aa] font-semibold';
    case 'scan': return 'text-[#58a6ff]';
    case 'system': return line.message.includes('started') ? 'text-[#00d4aa]' : line.message.includes('stopped') ? 'text-yellow-400' : 'text-[#58a6ff]';
    case 'error': return 'text-[#ff4d4f]';
    default: return 'text-[#8b949e]';
  }
}

export function LiveFeed({ isRunning, onScanComplete }: LiveFeedProps) {
  const [lines, setLines] = useState<FeedLine[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const feedRef = useRef<HTMLDivElement>(null);
  const scanInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasRunning = useRef(false);

  const addLine = useCallback((message: string, type: FeedLine['type'] = 'info') => {
    setLines(prev => [makeLine(message, type), ...prev].slice(0, 200));
  }, []);

  const triggerScan = useCallback(async () => {
    setScanning(true);
    setCountdown(60);
    addLine('Scan started — fetching market data...', 'scan');

    try {
      const res = await fetch('/api/bot/scan');
      const data = await res.json();

      if (data.status === 'completed' && data.results) {
        const results: ScanResult[] = data.results;
        for (const r of results) {
          const sym = displaySymbol(r.symbol);
          if (r.price === 0) {
            addLine(`${sym}: no data available`, 'info');
          } else if (r.skipped) {
            addLine(`${sym}: $${r.price.toFixed(2)} — skipped (open trade)`, 'info');
          } else if (r.signals_found > 0) {
            addLine(`${sym}: $${r.price.toFixed(2)} — SIGNAL: ${r.signal_type} (VWAP: $${r.vwap.toFixed(2)})`, 'signal');
          } else {
            addLine(`${sym}: $${r.price.toFixed(2)} — no setup (VWAP: $${r.vwap.toFixed(2)})`, 'info');
          }
        }
        const signals = results.filter(r => r.signals_found > 0).length;
        addLine(`Scan completed — ${results.length} symbols, ${signals} signal${signals !== 1 ? 's' : ''}`, 'system');
      } else if (data.status === 'skipped') {
        addLine('Scan skipped — bot is stopped', 'system');
      } else if (data.status === 'error') {
        addLine(`Scan error: ${data.error}`, 'error');
      }

      setLastScan(now());
      onScanComplete?.();
    } catch (err) {
      addLine(`Scan failed: ${String(err)}`, 'error');
    } finally {
      setScanning(false);
    }
  }, [addLine, onScanComplete]);

  // Start/stop events
  useEffect(() => {
    if (isRunning && !wasRunning.current) {
      addLine('Bot started by user', 'system');
    } else if (!isRunning && wasRunning.current) {
      addLine('Bot stopped by user', 'system');
    }
    wasRunning.current = isRunning;
  }, [isRunning, addLine]);

  // Scan loop when running
  useEffect(() => {
    if (isRunning) {
      triggerScan();
      scanInterval.current = setInterval(triggerScan, 60000);
    } else {
      if (scanInterval.current) {
        clearInterval(scanInterval.current);
        scanInterval.current = null;
      }
      setScanning(false);
      setCountdown(60);
    }
    return () => {
      if (scanInterval.current) clearInterval(scanInterval.current);
    };
  }, [isRunning, triggerScan]);

  // Countdown timer
  useEffect(() => {
    if (isRunning && !scanning) {
      countdownInterval.current = setInterval(() => {
        setCountdown(c => (c > 0 ? c - 1 : 0));
      }, 1000);
    } else {
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
        countdownInterval.current = null;
      }
    }
    return () => {
      if (countdownInterval.current) clearInterval(countdownInterval.current);
    };
  }, [isRunning, scanning]);

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
        </div>
        <div className="flex items-center gap-3 text-[10px] text-[#484f58]">
          {lastScan && <span>Last scan: {lastScan}</span>}
          {isRunning && !scanning && <span>Next scan: {countdown}s</span>}
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
