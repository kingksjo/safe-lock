import React, { useState } from 'react';

interface HourlyChartProps {
  data: { hour: number; count: number }[];
}

export const HourlyChart: React.FC<HourlyChartProps> = ({ data }) => {
  const [hoveredBar, setHoveredBar] = useState<{ hour: number; count: number; x: number; y: number } | null>(null);

  // SVG dimensions
  const width = 600;
  const height = 180;
  const paddingLeft = 35;
  const paddingRight = 10;
  const paddingTop = 25;
  const paddingBottom = 20;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Calculate scaling
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const yTicks = 4; // Number of horizontal gridlines

  // Bar dimensions
  const numBars = 24;
  const barGap = 4;
  const barWidth = (chartWidth - barGap * (numBars - 1)) / numBars;

  return (
    <div className="relative bg-surface-container-low border border-outline-variant p-4 rounded-md">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[10px] uppercase font-bold text-outline tracking-wider">
          Peak Access Telemetry Grid (UTC Hours)
        </span>
        {hoveredBar && (
          <span className="text-[10px] font-mono font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
            Hour {hoveredBar.hour.toString().padStart(2, '0')}:00 &rarr; {hoveredBar.count} {hoveredBar.count === 1 ? 'attempt' : 'attempts'}
          </span>
        )}
      </div>

      <div className="w-full overflow-x-auto select-none">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[500px] h-auto overflow-visible">
          {/* Horizontal gridlines */}
          {Array.from({ length: yTicks }).map((_, idx) => {
            const y = paddingTop + (chartHeight / (yTicks - 1)) * idx;
            const val = Math.round(maxCount - (maxCount / (yTicks - 1)) * idx);
            return (
              <g key={idx}>
                {/* Grid Line */}
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#1e293b"
                  strokeWidth="0.5"
                  strokeDasharray="2 2"
                />
                {/* Y-Axis Label */}
                <text
                  x={paddingLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="#88929b"
                  className="font-mono text-[9px] font-medium"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* X-Axis baseline */}
          <line
            x1={paddingLeft}
            y1={height - paddingBottom}
            x2={width - paddingRight}
            y2={height - paddingBottom}
            stroke="#1e293b"
            strokeWidth="1"
          />

          {/* Access Bars */}
          {data.map((bar, idx) => {
            const barHeight = (bar.count / maxCount) * chartHeight;
            const x = paddingLeft + idx * (barWidth + barGap);
            const y = height - paddingBottom - barHeight;

            const isHovered = hoveredBar?.hour === bar.hour;

            return (
              <g key={bar.hour}>
                {/* Invisible hover capture column */}
                <rect
                  x={x - barGap / 2}
                  y={paddingTop}
                  width={barWidth + barGap}
                  height={chartHeight}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => {
                    setHoveredBar({
                      hour: bar.hour,
                      count: bar.count,
                      x: x + barWidth / 2,
                      y: y
                    });
                  }}
                  onMouseLeave={() => setHoveredBar(null)}
                />

                {/* Visible Data Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, 1.5)} // Minimum height of 1.5px to indicate active empty hours
                  rx="1"
                  fill={isHovered ? '#89ceff' : 'rgba(14, 165, 233, 0.25)'}
                  stroke={isHovered ? '#89ceff' : 'rgba(14, 165, 233, 0.5)'}
                  strokeWidth="1"
                  className="transition-all duration-150 pointer-events-none"
                />
              </g>
            );
          })}

          {/* X-Axis Tick Labels at key times */}
          {[0, 6, 12, 18, 23].map((hour) => {
            const x = paddingLeft + hour * (barWidth + barGap) + barWidth / 2;
            const y = height - paddingBottom + 12;
            return (
              <text
                key={hour}
                x={x}
                y={y}
                textAnchor="middle"
                fill="#88929b"
                className="font-mono text-[9px] font-semibold"
              >
                {hour.toString().padStart(2, '0')}:00
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
