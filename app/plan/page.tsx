'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';

interface SetupSlot {
  symbol: string;
  thesis: string;
  entryZone: string;
  stop: string;
  target: string;
  invalidation: string;
}

const emptySlot = (): SetupSlot => ({
  symbol: '',
  thesis: '',
  entryZone: '',
  stop: '',
  target: '',
  invalidation: '',
});

export default function PlanPage() {
  const [date] = useState(new Date().toISOString().split('T')[0]);
  const [slots, setSlots] = useState<SetupSlot[]>([emptySlot(), emptySlot(), emptySlot()]);
  const [holdAllDay, setHoldAllDay] = useState('');
  const [swingWindow, setSwingWindow] = useState('6:00–8:00 AM PT');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function loadPlan() {
      try {
        const res = await fetch('/api/plan');
        if (res.ok) {
          const data = await res.json();
          if (data?.notes) {
            try {
              const parsed = JSON.parse(data.notes);
              if (parsed.slots) setSlots(parsed.slots);
              if (parsed.holdAllDay) setHoldAllDay(parsed.holdAllDay);
              if (parsed.swingWindow) setSwingWindow(parsed.swingWindow);
            } catch {
              // Notes is plain text, not JSON plan
            }
          }
        }
      } catch (err) {
        console.error('Failed to load plan:', err);
      }
    }
    loadPlan();
  }, []);

  const updateSlot = (index: number, field: keyof SetupSlot, value: string) => {
    const newSlots = [...slots];
    newSlots[index] = { ...newSlots[index], [field]: value };
    setSlots(newSlots);
  };

  const savePlan = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const planData = {
        slots,
        holdAllDay,
        swingWindow,
      };
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: JSON.stringify(planData) }),
      });
      if (res.ok) setSaved(true);
    } catch (err) {
      console.error('Failed to save plan:', err);
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full bg-[#0d0f14] border border-[#21262d] rounded-md px-3 py-2 text-sm text-white placeholder-[#8b949e]/50 focus:border-[#00d4aa] focus:outline-none';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Premarket Plan</h1>
        <span className="text-[#8b949e] text-sm">{date}</span>
      </div>

      {/* Setup slots */}
      {slots.map((slot, i) => (
        <Card key={i}>
          <h2 className="text-sm text-[#8b949e] uppercase tracking-wider mb-3">
            Setup #{i + 1}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">Symbol</label>
              <input
                className={inputClass}
                placeholder="e.g. TSLA"
                value={slot.symbol}
                onChange={(e) => updateSlot(i, 'symbol', e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">Entry Zone</label>
              <input
                className={inputClass}
                placeholder="e.g. $245.20–$245.80"
                value={slot.entryZone}
                onChange={(e) => updateSlot(i, 'entryZone', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">Stop</label>
              <input
                className={inputClass}
                placeholder="e.g. $243.50"
                value={slot.stop}
                onChange={(e) => updateSlot(i, 'stop', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">Target</label>
              <input
                className={inputClass}
                placeholder="e.g. $248.50"
                value={slot.target}
                onChange={(e) => updateSlot(i, 'target', e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-[#8b949e] mb-1 block">Thesis</label>
              <input
                className={inputClass}
                placeholder="Why this trade makes sense..."
                value={slot.thesis}
                onChange={(e) => updateSlot(i, 'thesis', e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-[#8b949e] mb-1 block">
                Invalidation Rule
              </label>
              <input
                className={inputClass}
                placeholder="What would make this setup invalid..."
                value={slot.invalidation}
                onChange={(e) => updateSlot(i, 'invalidation', e.target.value)}
              />
            </div>
          </div>
        </Card>
      ))}

      {/* Hold all day + Swing window */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <label className="text-xs text-[#8b949e] uppercase tracking-wider mb-2 block">
            Hold-All-Day Candidate
          </label>
          <input
            className={inputClass}
            placeholder="e.g. NVDA — strong trend day setup"
            value={holdAllDay}
            onChange={(e) => setHoldAllDay(e.target.value)}
          />
        </Card>
        <Card>
          <label className="text-xs text-[#8b949e] uppercase tracking-wider mb-2 block">
            Quick Swing Window
          </label>
          <input
            className={inputClass}
            placeholder="e.g. 6:00–8:00 AM PT"
            value={swingWindow}
            onChange={(e) => setSwingWindow(e.target.value)}
          />
        </Card>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={savePlan}
          disabled={saving}
          className="px-6 py-2.5 bg-[#00d4aa] text-[#0d0f14] font-medium rounded-md hover:bg-[#00d4aa]/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Plan'}
        </button>
        {saved && (
          <span className="text-sm text-[#00d4aa]">Plan saved successfully</span>
        )}
      </div>
    </div>
  );
}
