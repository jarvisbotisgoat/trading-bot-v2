'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { BotLog } from '@/lib/types';

interface LiveFeedProps {
  isRunning: boolean;
  onScanComplete?: () => void;
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
  if (message.includes('started by user')) return 'ON';
  if (message.includes('stopped by user')) return '--';
  if (message.includes('scan started')) return '>>';
  if (message.includes('scan completed')) return 'OK';
  if (message.includes('Scanning')) return '..';
  if (message.includes('Error') || message.includes('Failed')) return 'XX';
  return '  ';
}

function getMessageColor(log: BotLog): string {
  const msg = log.message;
  if (msg.includes('SIGNAL')) return 'text-[#00d4aa] font-semibold';
  if (msg.includes('Opened')) return 'text-blue-400';
  if (msg.includes('Closed trade') && msg.includes('win')) return 'text-[#00d4aa]';
  if (msg.includes('Closed trade') && msg.includes('loss')) return 'text-[#ff4d4f]';
  if (msg.includes('started by user')) return 'text-[#00d4aa]';
  if (msg.includes('stopped by user')) return 'text-yellow-400';
  if (msg.includes('scan started') || msg.includes('scan completed')) return 'text-[#58a6ff]';
  if (msg.includes('Scanning')) return 'text-[#8b949e]';
  return getLogColor(log.level);
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function LiveFeed({ isRunning, onScanComplete }: LiveFeedProps) {
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const feedRef = useRef<HTMLDivElement>(null);
  const scanInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/feed?limit=100');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch {
      // silently fail
    }
  }, []);

  const triggerScan = useCallback(async () => {
    setScanning(true);
    setCountdown(60);
    try {
      await fetch('/api/bot/scan');
      setLastScan(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      // Refresh logs immediately after scan
      await fetchLogs();
      onScanComplete?.();
    } catch {
      // silently fail
    } finally {
      setScanning(false);
    }
  }, [fetchLogs, onScanComplete]);

  // Poll logs fast when running
  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, isRunning ? 3000 : 15000);
    return () => clearInterval(interval);
  }, [fetchLogs, isRunning]);

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
        setCountdown((c) => (c > 0 ? c - 1 : 0));
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
          <span>{logs.length} entries</span>
        </div>
      </div>

      {/* Terminal feed */}
      <div
        ref={feedRef}
        className="h-[300px] overflow-y-auto rounded-lg bg-[#0d1117] border border-[#1e2733] p-3 font-mono text-xs leading-relaxed scroll-smooth"
      >
        {!isRunning && logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[#484f58]">
            Hit &quot;Start Bot&quot; to begin scanning
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[#484f58]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#484f58] border-t-transparent mr-2" />
            Waiting for first scan results...
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={log.id || i} className="flex gap-2 py-0.5 hover:bg-[#161b22] -mx-1 px-1 rounded">
              <span className="text-[#484f58] shrink-0">
                {log.created_at ? formatTime(log.created_at) : '--:--:--'}
              </span>
              <span className={`shrink-0 font-bold ${getMessageColor(log)}`}>
                [{getLogIcon(log.message)}]
              </span>
              <span className={getMessageColor(log)}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
