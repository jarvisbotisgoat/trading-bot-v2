'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, CandlestickData, Time } from 'lightweight-charts';

interface TradeMarker {
  time: number;
  type: 'entry' | 'exit';
  price: number;
}

interface CandlestickChartProps {
  data: CandlestickData<Time>[];
  markers?: TradeMarker[];
  height?: number;
}

export function CandlestickChart({ data, markers = [], height = 400 }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#161b22' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' },
      },
      width: containerRef.current.clientWidth,
      height,
      crosshair: {
        vertLine: { color: '#8b949e', width: 1, style: 3 },
        horzLine: { color: '#8b949e', width: 1, style: 3 },
      },
      timeScale: {
        borderColor: '#21262d',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#21262d',
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#00d4aa',
      downColor: '#ff4d4f',
      borderDownColor: '#ff4d4f',
      borderUpColor: '#00d4aa',
      wickDownColor: '#ff4d4f',
      wickUpColor: '#00d4aa',
    });

    series.setData(data);

    // Trade markers (entry/exit dots) — markers API may require
    // lightweight-charts primitives plugin for v5+

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, markers, height]);

  return <div ref={containerRef} className="w-full rounded-lg overflow-hidden" />;
}
