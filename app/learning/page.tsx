'use client';

import { useEffect, useState } from 'react';
import type { Setup, Trade, DailySummary } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function LearningPage() {
  const [setups, setSetups] = useState<Setup[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [setupsRes, summaryRes, tradesRes] = await Promise.all([
          fetch('/api/setups'),
          fetch('/api/summary?limit=1'),
          fetch('/api/trades?limit=30'),
        ]);

        if (setupsRes.ok) setSetups(await setupsRes.json());
        if (summaryRes.ok) {
          const data = await summaryRes.json();
          if (data.length > 0) setSummary(data[0]);
        }
        if (tradesRes.ok) setRecentTrades(await tradesRes.json());
      } catch (err) {
        console.error('Failed to load learning data:', err);
      }
    }
    load();
  }, []);

  // Extract top 3 learnings from daily summary notes
  const learnings = summary?.notes
    ? summary.notes.split('\n').filter(Boolean).slice(0, 3)
    : [];

  // Most common failure reasons from recent trades
  const failureCounts: Record<string, number> = {};
  for (const t of recentTrades) {
    if (t.failure_reason) {
      failureCounts[t.failure_reason] = (failureCounts[t.failure_reason] || 0) + 1;
    }
  }
  const topMistakes = Object.entries(failureCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Calibration data: entry quality score vs actual outcome
  const calibrationData = recentTrades
    .filter((t) => t.entry_quality_score != null && t.outcome != null)
    .reduce(
      (acc, t) => {
        const score = t.entry_quality_score!;
        if (!acc[score]) acc[score] = { total: 0, wins: 0 };
        acc[score].total++;
        if (t.outcome === 'win') acc[score].wins++;
        return acc;
      },
      {} as Record<number, { total: number; wins: number }>
    );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Learning Panel</h1>

      {/* What the bot learned today */}
      <Card>
        <h2 className="text-sm text-[#8b949e] uppercase tracking-wider mb-3">
          What the bot learned today
        </h2>
        {learnings.length > 0 ? (
          <ul className="space-y-2">
            {learnings.map((note, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-[#00d4aa] mt-0.5">*</span>
                <span className="text-[#8b949e]">{note}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#8b949e]">
            No learnings yet. The bot will populate this after its first trading day.
          </p>
        )}
      </Card>

      {/* Setup Score Leaderboard */}
      <Card>
        <h2 className="text-sm text-[#8b949e] uppercase tracking-wider mb-3">
          Setup Scores
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#8b949e] text-xs uppercase tracking-wider border-b border-[#21262d]">
                <th className="text-left py-2 px-3">Rank</th>
                <th className="text-left py-2 px-3">Setup</th>
                <th className="text-right py-2 px-3">Score</th>
                <th className="text-right py-2 px-3">Win Rate</th>
                <th className="text-right py-2 px-3">Avg R:R</th>
                <th className="text-right py-2 px-3">Trades</th>
                <th className="text-center py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {setups.map((setup, i) => (
                <tr key={setup.id} className="border-b border-[#21262d]/50">
                  <td className="py-2.5 px-3 text-[#8b949e]">#{i + 1}</td>
                  <td className="py-2.5 px-3 font-medium text-white">{setup.name}</td>
                  <td className="py-2.5 px-3 text-right text-[#00d4aa] font-medium">
                    {setup.score.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {(setup.win_rate * 100).toFixed(0)}%
                  </td>
                  <td className="py-2.5 px-3 text-right">{setup.avg_rr.toFixed(1)}R</td>
                  <td className="py-2.5 px-3 text-right text-[#8b949e]">
                    {setup.trade_count}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <Badge
                      label={setup.is_active ? 'Active' : 'Inactive'}
                      variant={setup.is_active ? 'green' : 'gray'}
                    />
                  </td>
                </tr>
              ))}
              {setups.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-[#8b949e] text-sm">
                    Connect Supabase to load setup data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Top Mistakes */}
      <Card>
        <h2 className="text-sm text-[#8b949e] uppercase tracking-wider mb-3">
          Top Mistakes (Last 30 Trades)
        </h2>
        {topMistakes.length > 0 ? (
          <div className="space-y-2">
            {topMistakes.map(([reason, count]) => (
              <div
                key={reason}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-[#ff4d4f]">{reason}</span>
                <span className="text-[#8b949e]">{count}x</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#8b949e]">No failure data yet</p>
        )}
      </Card>

      {/* Confidence Calibration */}
      <Card>
        <h2 className="text-sm text-[#8b949e] uppercase tracking-wider mb-3">
          Confidence Calibration
        </h2>
        <p className="text-xs text-[#8b949e] mb-3">
          Entry quality score vs actual win rate
        </p>
        <div className="space-y-1.5">
          {Object.entries(calibrationData)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([score, { total, wins }]) => {
              const winPct = total > 0 ? (wins / total) * 100 : 0;
              return (
                <div key={score} className="flex items-center gap-3 text-sm">
                  <span className="w-8 text-right text-[#8b949e]">{score}/10</span>
                  <div className="flex-1 h-5 bg-[#21262d] rounded overflow-hidden">
                    <div
                      className="h-full bg-[#00d4aa]/60 rounded"
                      style={{ width: `${winPct}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-[#8b949e]">
                    {winPct.toFixed(0)}% ({total})
                  </span>
                </div>
              );
            })}
          {Object.keys(calibrationData).length === 0 && (
            <p className="text-sm text-[#8b949e]">Not enough data yet</p>
          )}
        </div>
      </Card>
    </div>
  );
}
