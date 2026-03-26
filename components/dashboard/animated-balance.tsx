'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedBalanceProps {
  value: number;
  label?: string;
}

export function AnimatedBalance({ value, label = 'Balance' }: AnimatedBalanceProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [direction, setDirection] = useState<'up' | 'down' | 'flat'>('flat');
  const prevValue = useRef(value);

  useEffect(() => {
    if (value !== prevValue.current) {
      setDirection(value > prevValue.current ? 'up' : 'down');
      prevValue.current = value;

      // Animate to new value
      const start = displayValue;
      const diff = value - start;
      const duration = 600;
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayValue(start + diff * eased);
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setDisplayValue(value);
        }
      };
      requestAnimationFrame(animate);

      // Reset direction flash after 2s
      const timer = setTimeout(() => setDirection('flat'), 2000);
      return () => clearTimeout(timer);
    }
  }, [value, displayValue]);

  const color =
    direction === 'up'
      ? 'text-[#00d4aa]'
      : direction === 'down'
      ? 'text-[#ff4d4f]'
      : 'text-white';

  const formatted = displayValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
      <div className="text-xs text-[#8b949e] uppercase tracking-wider mb-1">
        {label}
      </div>
      <div
        className={`text-2xl font-bold transition-colors duration-300 ${color}`}
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        ${formatted}
      </div>
    </div>
  );
}
