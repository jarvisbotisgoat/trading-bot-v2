'use client';

import { useState } from 'react';

interface BotToggleProps {
  isRunning: boolean;
  onToggle: (running: boolean) => void;
}

export function BotToggle({ isRunning, onToggle }: BotToggleProps) {
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_running: !isRunning }),
      });
      if (res.ok) {
        onToggle(!isRunning);
      }
    } catch (err) {
      console.error('Failed to toggle bot:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`
        relative inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium
        transition-all duration-200
        ${isRunning
          ? 'border-[#ff4d4f]/30 bg-[#ff4d4f]/10 text-[#ff4d4f] hover:bg-[#ff4d4f]/20'
          : 'border-[#00d4aa]/30 bg-[#00d4aa]/10 text-[#00d4aa] hover:bg-[#00d4aa]/20'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <span className={`h-2 w-2 rounded-full ${isRunning ? 'bg-[#ff4d4f]' : 'bg-[#00d4aa]'}`} />
      )}
      {loading ? 'Updating...' : isRunning ? 'Stop Bot' : 'Start Bot'}
    </button>
  );
}
