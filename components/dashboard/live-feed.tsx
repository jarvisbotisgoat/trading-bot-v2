'use client';

import { useEffect, useState, useRef } from 'react';
import type { BotLog } from '@/lib/types';

interface LiveFeedProps {
  refreshInterval?: number;
}

function getLogColor(level: string): string {
  switch (level) {
    case 'error': return 'text-[#ff4d4f]';
    case 'warn': return 'text-yellow-400';
    default: return 'text-[#8b949e]';
  }
}

function getLogIcon(message: string): string {
  if (message.includes('SIGNAL')) return '!!';
  if (message.includes('Opened paper trade')) return '>>';
  if (message.includes('Closed trade')) return '<<';
  if (message.includes('started')) return '--';
  if (message.includes('completed')) return 'OK';
  if (message.includes('Scanning')) return '..';
  if (message.includes('Error') || message.includes('Failed')) return 'XX';
  return '  ';
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function LiveFeed({ refreshInterval = 5000 }: LiveFeedProps) {
  const [logs, setLogs] = useState<BotLog[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/bot/feed?limit=100');
        if (res.ok) {
          const data = await res.json();
          setLogs(data);
        }
      } catch {
        // silently fail
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (feedRef.current) {
      setAutoScroll(feedRef.current.scrollTop < 10);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-[#8b949e] uppercase tracking-wider">Live Feed</h2>
        <span className="text-xs text-[#8b949e]">
          {logs.length > 0 ? `${logs.length} entries` : 'Waiting for activity...'}
        </span>
      </div>
      <div
        ref={feedRef}
        onScroll={handleScroll}
        className="h-[300px] overflow-y-auto rounded-lg bg-[#0d1117] border border-[#1e2733] p-3 font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[#8b949e]">
            Start the bot to see live scan activity
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={log.id || i} className="flex gap-2 py-0.5 hover:bg-[#161b22] -mx-1 px-1 rounded">
              <span className="text-[#484f58] shrink-0">
                {log.created_at ? formatTime(log.created_at) : '--:--:--'}
              </span>
              <span className={`shrink-0 font-bold ${
                log.message.includes('SIGNAL') ? 'text-[#00d4aa]' :
                log.message.includes('Opened') ? 'text-blue-400' :
                log.message.includes('Closed') ? 'text-purple-400' :
                getLogColor(log.level)
              }`}>
                [{getLogIcon(log.message)}]
              </span>
              <span className={`${
                log.message.includes('SIGNAL') ? 'text-[#00d4aa] font-semibold' :
                log.message.includes('Opened') ? 'text-blue-400' :
                log.message.includes('Closed') ? 'text-purple-400' :
                getLogColor(log.level)
              }`}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
