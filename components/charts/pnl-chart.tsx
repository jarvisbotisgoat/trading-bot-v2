'use client';

import { useEffect, useRef } from 'react';

interface PnlChartProps {
  data: { time: number; value: number }[];
  height?: number;
}

export function PnlChart({ data, height = 200 }: PnlChartProps) {
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
    const padding = { top: 20, right: 60, bottom: 25, left: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // Clear
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
    const fillColor = isUp ? 'rgba(0, 212, 170, 0.15)' : 'rgba(255, 77, 79, 0.15)';

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
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(values[0]));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(toX(i), toY(values[i]));
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Current value label
    const labelY = toY(lastVal);
    ctx.fillStyle = lineColor;
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`$${lastVal.toFixed(2)}`, w - padding.right + 5, labelY + 4);

    // $0 label
    ctx.fillStyle = '#484f58';
    ctx.fillText('$0', w - padding.right + 5, zeroY + 4);

  }, [data, height]);

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-[#484f58] text-sm" style={{ height }}>
        No trade history yet
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height }}
      className="block"
    />
  );
}
