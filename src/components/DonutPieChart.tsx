import React, { useState } from 'react';

export interface PieChartSegment {
  id: string;
  label: string;
  value: number;
  color: string;
}

interface DonutPieChartProps {
  title: string;
  subtitle?: string;
  data: PieChartSegment[];
  unit?: string;
  centerTotalLabel?: string;
}

export const DonutPieChart: React.FC<DonutPieChartProps> = ({
  title,
  subtitle,
  data,
  unit = 'รายการ',
  centerTotalLabel = 'รวมทั้งหมด',
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const total = data.reduce((sum, item) => sum + item.value, 0);

  // SVG dimensions
  const size = 220;
  const center = size / 2;
  const radius = 80;
  const innerRadius = 50;

  // Compute SVG arcs
  let accumulatedAngle = 0;
  const slices = data.map((item, index) => {
    const percentage = total > 0 ? (item.value / total) * 100 : 0;
    const angle = total > 0 ? (item.value / total) * 360 : 0;
    const startAngle = accumulatedAngle;
    const endAngle = accumulatedAngle + angle;
    accumulatedAngle += angle;

    // Convert polar to cartesian
    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;

    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);

    const x3 = center + innerRadius * Math.cos(endRad);
    const y3 = center + innerRadius * Math.sin(endRad);
    const x4 = center + innerRadius * Math.cos(startRad);
    const y4 = center + innerRadius * Math.sin(startRad);

    const largeArc = angle > 180 ? 1 : 0;

    // Path for donut segment
    const pathData = total > 0 && item.value > 0
      ? `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`
      : '';

    return {
      ...item,
      percentage,
      pathData,
      index,
    };
  });

  return (
    <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs flex flex-col justify-between space-y-3">
      <div>
        <h4 className="text-sm font-bold text-slate-900">{title}</h4>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 py-1">
        {/* SVG Circle */}
        <div className="relative shrink-0">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
            {total === 0 ? (
              // Empty State ring
              <circle
                cx={center}
                cy={center}
                r={(radius + innerRadius) / 2}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth={radius - innerRadius}
              />
            ) : (
              slices.map((slice) => {
                if (slice.value === 0) return null;
                const isHovered = hoveredIndex === slice.index;
                return (
                  <path
                    key={slice.id}
                    d={slice.pathData}
                    fill={slice.color}
                    className="transition-all duration-200 cursor-pointer"
                    style={{
                      transformOrigin: `${center}px ${center}px`,
                      transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                      opacity: hoveredIndex !== null && !isHovered ? 0.6 : 1,
                    }}
                    onMouseEnter={() => setHoveredIndex(slice.index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />
                );
              })
            )}
          </svg>

          {/* Donut Center Label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
            {hoveredIndex !== null && slices[hoveredIndex] ? (
              <>
                <span className="text-[10px] font-medium text-slate-500 max-w-[80px] truncate">
                  {slices[hoveredIndex].label}
                </span>
                <span className="text-lg font-extrabold text-slate-900">
                  {slices[hoveredIndex].value}
                </span>
                <span className="text-[10px] font-bold text-blue-600">
                  {slices[hoveredIndex].percentage.toFixed(1)}%
                </span>
              </>
            ) : (
              <>
                <span className="text-[10px] font-medium text-slate-400">
                  {centerTotalLabel}
                </span>
                <span className="text-xl font-extrabold text-slate-900">
                  {total}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {unit}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Legend List */}
        <div className="flex-1 min-w-[160px] space-y-1.5 w-full">
          {slices.map((slice) => (
            <div
              key={slice.id}
              onMouseEnter={() => setHoveredIndex(slice.index)}
              onMouseLeave={() => setHoveredIndex(null)}
              className={`p-1.5 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                hoveredIndex === slice.index ? 'bg-slate-100 font-bold' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: slice.color }}
                ></span>
                <span className="text-slate-700 truncate text-[11px]">
                  {slice.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 pl-2">
                <span className="font-bold text-slate-900 text-xs">
                  {slice.value}
                </span>
                <span className="text-[10px] text-slate-400">
                  ({slice.percentage.toFixed(0)}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
