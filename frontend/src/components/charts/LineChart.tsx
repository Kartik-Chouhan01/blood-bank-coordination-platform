import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { CHART_INK, SERIES_COLORS, formatNumber, niceScale } from './chartTheme';
import { Legend, TooltipRows } from './ChartCard';
import { useElementWidth } from './useElementWidth';

export interface LineSeries {
  label: string;
  values: number[];
  /** Palette slot — fixed per metric so a metric keeps its colour everywhere. */
  slot: 0 | 1;
}

interface LineChartProps {
  /** Short x labels (one per point). */
  labels: string[];
  /** Full x labels for the tooltip. */
  longLabels?: string[];
  series: LineSeries[];
  /** Accessible summary of what the chart shows. */
  summary: string;
  height?: number;
}

const M = { top: 12, left: 40, bottom: 26 };
const LABEL_GAP = 16;

/**
 * Trend over time: 2px lines, an end dot with a surface ring, a crosshair that snaps to the
 * nearest point (pointer or arrow keys) and one tooltip listing every series. A single series
 * gets a 10% area wash; two series get a legend and direct end labels when they do not collide.
 */
export function LineChart({ labels, longLabels, series, summary, height = 220 }: LineChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const multi = series.length > 1;
  const right = multi ? 88 : 16;
  const plotW = Math.max(40, width - M.left - right);
  const plotH = height - M.top - M.bottom;
  const { max, ticks } = niceScale(Math.max(0, ...series.flatMap((s) => s.values)));
  const n = labels.length;
  const x = (i: number) => M.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const path = (values: number[]) =>
    values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');

  // Direct end labels only when they will not collide; otherwise the legend carries identity.
  const ends = series.map((s) => y(s.values.at(-1) ?? 0));
  const endLabels = multi && Math.abs((ends[0] ?? 0) - (ends[1] ?? 0)) >= 14;

  const xTickEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 70))));
  const pick = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const rel = (event.clientX - box.left) / Math.max(1, box.width);
    setActive(Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1)))));
  };
  const onKey = (event: KeyboardEvent<SVGRectElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    setActive((i) => Math.min(n - 1, Math.max(0, (i ?? (step > 0 ? -1 : n)) + step)));
  };

  return (
    <div ref={ref} className="relative">
      <Legend
        mark="line"
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
        {labels.map((label, i) =>
          i % xTickEvery === 0 || i === n - 1 ? (
            <text
              key={`${label}-${i}`}
              x={x(i)}
              y={height - 8}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              fontSize={11}
              fill={CHART_INK.muted}
            >
              {label}
            </text>
          ) : null,
        )}
        {!multi && series[0] && (
          <path
            d={`${path(series[0].values)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`}
            fill={SERIES_COLORS[series[0].slot]}
            fillOpacity={0.1}
          />
        )}
        {series.map((s) => (
          <path
            key={s.label}
            d={path(s.values)}
            fill="none"
            stroke={SERIES_COLORS[s.slot]}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {series.map((s, si) => (
          <g key={`end-${s.label}`}>
            <circle
              cx={x(n - 1)}
              cy={ends[si]}
              r={4}
              fill={SERIES_COLORS[s.slot]}
              stroke={CHART_INK.surface}
              strokeWidth={2}
            />
            {endLabels && (
              <text
                x={x(n - 1) + LABEL_GAP / 2 + 4}
                y={ends[si]}
                dy="0.32em"
                fontSize={11}
                fill={CHART_INK.secondary}
              >
                {s.label}
              </text>
            )}
          </g>
        ))}
        {active !== null && (
          <g>
            <line
              x1={x(active)}
              x2={x(active)}
              y1={M.top}
              y2={M.top + plotH}
              stroke={CHART_INK.axis}
              strokeWidth={1}
            />
            {series.map((s) => (
              <circle
                key={s.label}
                cx={x(active)}
                cy={y(s.values[active] ?? 0)}
                r={4}
                fill={SERIES_COLORS[s.slot]}
                stroke={CHART_INK.surface}
                strokeWidth={2}
              />
            ))}
          </g>
        )}
        <rect
          x={M.left}
          y={M.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          tabIndex={0}
          aria-label="Chart data: use left and right arrow keys to read values"
          onPointerMove={pick}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((i) => i ?? n - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
          className="outline-none focus-visible:outline-2 focus-visible:outline-brand-600"
        />
      </svg>
      {active !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-8 rounded-lg bg-white px-3 py-2 shadow-md ring-1 ring-slate-200"
          style={
            x(active) > width / 2 ? { right: width - x(active) + 12 } : { left: x(active) + 12 }
          }
        >
          <TooltipRows
            title={longLabels?.[active] ?? labels[active] ?? ''}
            rows={series.map((s) => ({
              label: s.label,
              value: formatNumber(s.values[active] ?? 0),
              color: SERIES_COLORS[s.slot],
            }))}
          />
        </div>
      )}
    </div>
  );
}
