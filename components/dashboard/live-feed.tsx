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
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const lastSeenId = useRef<number>(0);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/feed?limit=50');
      if (!res.ok) return;

      const logs: BotLogEntry[] = await res.json();
      if (!Array.isArray(logs) || logs.length === 0) return;

      // Check if there are new entries
      const maxId = Math.max(...logs.map(l => l.id));
      const hasNew = maxId > lastSeenId.current;
      lastSeenId.current = maxId;

      // Convert logs to feed lines (they come newest-first from API)
      const feedLines: FeedLine[] = logs.map((entry) => {
        const type = classifyLog(entry);
        return {
          id: String(entry.id),
          time: formatTime(entry.created_at),
          message: entry.message,
          type,
        };
      });

      setLines(feedLines);
      setLastFetch(formatTime(new Date().toISOString()));

      // Notify parent if new scan data arrived
      if (hasNew) {
        onScanComplete?.();
      }
    } catch {
      // Silently fail — dashboard is just a viewer
    }
  }, [onScanComplete]);

  // Poll for new logs every 10 seconds
  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
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
          {isRunning && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#00d4aa]/10 border border-[#00d4aa]/30 px-2 py-0.5 text-[10px] font-medium text-[#00d4aa]">
              CRON ACTIVE
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
              'Waiting for bot activity — scans run automatically via cron'
            ) : (
              'Bot is stopped. Hit "Start Bot" to enable cron scanning.'
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
