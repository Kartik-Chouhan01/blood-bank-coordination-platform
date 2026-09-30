/**
 * Chart palette (reference data-viz palette, validated for the white card surface: slots 1–2 pass
 * lightness, chroma, CVD ΔE 24.7, normal-vision ΔE 33.6 and 3:1 contrast). Series colours follow
 * the entity — a metric keeps its slot wherever it appears — and are never reused for status.
 */
export const SERIES_COLORS = ['#2a78d6', '#eb6834'] as const;

export const CHART_INK = {
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  muted: '#898781',
  secondary: '#52514e',
  primary: '#0b0b0b',
  surface: '#ffffff',
} as const;

/**
 * A y-axis for counts: the smallest round step (1, 2, 2.5, 5 × 10ⁿ, never below 1) that covers
 * `value` in at most five intervals, and the ticks at every step from 0 to the top.
 */
export function niceScale(value: number, maxIntervals = 5): { max: number; ticks: number[] } {
  if (value <= 0) return { max: 4, ticks: [0, 1, 2, 3, 4] };
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10]
    .map((s) => s * magnitude)
    .filter((s) => s >= 1 && Number.isInteger(s))
    .find((s) => Math.ceil(value / s) <= maxIntervals)!;
  const intervals = Math.max(1, Math.ceil(value / step));
  return {
    max: intervals * step,
    ticks: Array.from({ length: intervals + 1 }, (_, i) => i * step),
  };
}

export const formatNumber = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);

export const formatPercent = (share: number | null) =>
  share === null ? '—' : `${Math.round(share * 100)}%`;

export function formatHours(hours: number | null) {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}
