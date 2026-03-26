'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineStyle, AreaSeriesPartialOptions } from 'lightweight-charts';

interface PnlChartProps {
  data: { time: string; value: number }[];
  height?: number;
}

export function PnlChart({ data, height = 200 }: PnlChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8b949e',
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: '#21262d', style: LineStyle.Dotted },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        horzLine: { visible: false },
        vertLine: { color: '#484f58', style: LineStyle.Dotted },
      },
    });

    const lastValue = data[data.length - 1]?.value ?? 0;
    const lineColor = lastValue >= 0 ? '#00d4aa' : '#ff4d4f';
    const areaTopColor = lastValue >= 0 ? 'rgba(0, 212, 170, 0.3)' : 'rgba(255, 77, 79, 0.3)';
    const areaBottomColor = lastValue >= 0 ? 'rgba(0, 212, 170, 0.02)' : 'rgba(255, 77, 79, 0.02)';

    const seriesOptions: AreaSeriesPartialOptions = {
      lineColor,
      topColor: areaTopColor,
      bottomColor: areaBottomColor,
      lineWidth: 2,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const series = (chart as any).addSeries('Area', seriesOptions);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    series.setData(data as any);
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

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-[#484f58] text-sm" style={{ height }}>
        No trade history yet
      </div>
    );
  }

  return <div ref={containerRef} />;
}
