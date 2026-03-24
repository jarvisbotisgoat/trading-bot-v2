'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, AreaSeries, Time } from 'lightweight-charts';

interface EquityCurveProps {
  data: { time: string; value: number }[];
  height?: number;
}

export function EquityCurve({ data, height = 150 }: EquityCurveProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#161b22' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: '#21262d' },
      },
      width: containerRef.current.clientWidth,
      height,
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        visible: false,
      },
      crosshair: {
        vertLine: { visible: false },
        horzLine: { visible: false },
      },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: '#00d4aa',
      topColor: 'rgba(0, 212, 170, 0.3)',
      bottomColor: 'rgba(0, 212, 170, 0.02)',
      lineWidth: 2,
    });

    series.setData(
      data.map((d) => ({ time: d.time as Time, value: d.value }))
    );

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
  }, [data, height]);

  return <div ref={containerRef} className="w-full rounded-lg overflow-hidden" />;
}
