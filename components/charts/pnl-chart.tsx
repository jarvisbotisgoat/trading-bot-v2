'use client';

import { useEffect, useRef } from 'react';

interface PnlChartProps {
  data: { time: number; value: number }[];
  stats: {
    totalPnl: number;
    winRate: number;
    wins: number;
    losses: number;
    maxDrawdown: number;
  };
  height?: number;
}

export function PnlChart({ data, stats, height = 250 }: PnlChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = height;
    const padding = { top: 15, right: 55, bottom: 20, left: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    const values = data.map(d => d.value);
    const minVal = Math.min(0, ...values);
    const maxVal = Math.max(0, ...values);
    const range = maxVal - minVal || 1;

    const toX = (i: number) => padding.left + (i / (data.length - 1)) * chartW;
    const toY = (v: number) => padding.top + (1 - (v - minVal) / range) * chartH;

    const lastVal = values[values.length - 1];
    const isUp = lastVal >= 0;
    const lineColor = isUp ? '#00d4aa' : '#ff4d4f';

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, toY(maxVal), 0, toY(0));
    if (isUp) {
      gradient.addColorStop(0, 'rgba(0, 212, 170, 0.25)');
      gradient.addColorStop(1, 'rgba(0, 212, 170, 0.02)');
    } else {
      gradient.addColorStop(0, 'rgba(255, 77, 79, 0.02)');
      gradient.addColorStop(1, 'rgba(255, 77, 79, 0.25)');
    }

    // Zero line
    const zeroY = toY(0);
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(w - padding.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Fill area
    ctx.beginPath();
    ctx.moveTo(toX(0), zeroY);
    for (let i = 0; i < data.length; i++) {
      ctx.lineTo(toX(i), toY(values[i]));
    }
    ctx.lineTo(toX(data.length - 1), zeroY);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line with glow
    ctx.shadowColor = lineColor;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(values[0]));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(toX(i), toY(values[i]));
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Current value label
    const labelY = toY(lastVal);
    ctx.fillStyle = lineColor;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`$${lastVal.toFixed(2)}`, w - padding.right + 4, labelY + 4);

    // $0 label
    ctx.fillStyle = '#484f58';
    ctx.font = '10px monospace';
    ctx.fillText('$0', w - padding.right + 4, zeroY + 4);

  }, [data, height]);

  // Compute profit factor
  const totalWins = stats.wins;
  const totalLosses = stats.losses;
  const profitFactor = totalLosses > 0 ? (totalWins / totalLosses).toFixed(1) : totalWins > 0 ? '∞' : '—';

  return (
    <div className="flex gap-4">
      {/* Chart */}
      <div className="flex-1 min-w-0">
        {data.length < 2 ? (
          <div className="flex items-center justify-center text-[#484f58] text-sm" style={{ height }}>
            Waiting for first trade...
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height }}
            className="block"
          />
        )}
      </div>

      {/* Stats sidebar */}
      <div className="w-32 flex flex-col justify-center gap-3 text-xs shrink-0">
        <div>
          <div className="text-[#484f58] uppercase tracking-wider">Total P/L</div>
          <div className={`text-lg font-bold ${stats.totalPnl >= 0 ? 'text-[#00d4aa]' : 'text-[#ff4d4f]'}`}>
            {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-[#484f58] uppercase tracking-wider">Win Rate</div>
          <div className="text-white font-medium">{(stats.winRate * 100).toFixed(0)}%</div>
        </div>
        <div>
          <div className="text-[#484f58] uppercase tracking-wider">Profit Factor</div>
          <div className="text-white font-medium">{profitFactor}</div>
        </div>
        <div>
          <div className="text-[#484f58] uppercase tracking-wider">Max DD</div>
          <div className="text-[#ff4d4f] font-medium">${stats.maxDrawdown.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}
