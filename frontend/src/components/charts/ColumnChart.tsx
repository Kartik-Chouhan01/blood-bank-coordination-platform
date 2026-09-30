import { useState } from 'react';
import { CHART_INK, SERIES_COLORS, formatNumber, niceScale } from './chartTheme';
import { Legend, TooltipRows } from './ChartCard';
import { useElementWidth } from './useElementWidth';

export interface ColumnSeries {
  label: string;
  values: number[];
  slot: 0 | 1;
}

interface ColumnChartProps {
  categories: string[];
  series: ColumnSeries[];
  summary: string;
  height?: number;
  /** Put each value on its column cap (single series only; grouped charts use the tooltip). */
  labelValues?: boolean;
}

const M = { top: 18, left: 40, right: 8, bottom: 26 };
const MAX_BAR = 24;
const GAP = 2;

/** Rounded 4px data-end, square at the baseline. */
function columnPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return '';
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Magnitude by category: thin columns (≤24px) growing from one baseline, a 2px gap between
 * grouped columns, a hover/focus tooltip per column with a hit area the full height of the band.
 */
export function ColumnChart({
  categories,
  series,
  summary,
  height = 220,
  labelValues = false,
}: ColumnChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<{ c: number; s: number } | null>(null);
  const plotW = Math.max(40, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const { max, ticks } = niceScale(Math.max(0, ...series.flatMap((s) => s.values)));
  const band = plotW / Math.max(1, categories.length);
  const barW = Math.min(MAX_BAR, (band * 0.7 - GAP * (series.length - 1)) / series.length);
  const groupW = barW * series.length + GAP * (series.length - 1);
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const barX = (c: number, s: number) => M.left + band * c + (band - groupW) / 2 + s * (barW + GAP);

  return (
    <div ref={ref} className="relative">
      <Legend
        mark="rect"
        items={series.map((s) => ({ label: s.label, color: SERIES_COLORS[s.slot] }))}
      />
      <svg width={width} height={height} role="img" aria-label={summary} className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={M.left}
              x2={M.left + plotW}
              y1={y(t)}
              y2={y(t)}
              stroke={t === 0 ? CHART_INK.axis : CHART_INK.grid}
              strokeWidth={1}
            />
            <text
              x={M.left - 6}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              fontSize={11}
              fill={CHART_INK.muted}
              className="tabular-nums"
            >
              {formatNumber(t)}
            </text>
          </g>
        ))}
        {categories.map((category, c) => (
          <g key={category}>
            <text
              x={M.left + band * c + band / 2}
              y={height - 8}
              textAnchor="middle"
              fontSize={11}
              fill={CHART_INK.secondary}
            >
              {category}
            </text>
            {series.map((s, si) => {
              const v = s.values[c] ?? 0;
              const isActive = active?.c === c && active.s === si;
              return (
                <g key={s.label}>
                  <path
                    d={columnPath(barX(c, si), y(v), barW, y(0) - y(v))}
                    fill={SERIES_COLORS[s.slot]}
                    opacity={active && !isActive ? 0.55 : 1}
                  />
                  {labelValues && series.length === 1 && (
                    <text
                      x={barX(c, si) + barW / 2}
                      y={y(v) - 4}
                      textAnchor="middle"
                      fontSize={11}
                      fill={CHART_INK.secondary}
                      className="tabular-nums"
                    >
                      {formatNumber(v)}
                    </text>
                  )}
                  <rect
                    x={barX(c, si) - GAP}
                    y={M.top}
                    width={barW + GAP * 2}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    role="img"
                    aria-label={`${category}, ${s.label}: ${formatNumber(v)}`}
                    onPointerEnter={() => setActive({ c, s: si })}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive({ c, s: si })}
                    onBlur={() => setActive(null)}
                    className="outline-none focus-visible:outline-2 focus-visible:outline-brand-600"
                  />
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      {active && (
        <div
          role="status"
          className="pointer-events-none absolute top-8 rounded-lg bg-white px-3 py-2 shadow-md ring-1 ring-slate-200"
          style={
            barX(active.c, active.s) > width / 2
              ? { right: width - barX(active.c, active.s) + 8 }
              : { left: barX(active.c, active.s) + barW + 8 }
          }
        >
          <TooltipRows
            title={categories[active.c] ?? ''}
            rows={series.map((s) => ({
              label: s.label,
              value: formatNumber(s.values[active.c] ?? 0),
              color: SERIES_COLORS[s.slot],
            }))}
          />
        </div>
      )}
    </div>
  );
}
