import type { AnalyticsBucket, StockLevel } from '@bbms/shared';

const DAY_MS = 86_400_000;

/** Days per period decide the bucket size: daily up to a month, weekly for a quarter, else monthly. */
export function bucketFor(days: number): AnalyticsBucket {
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

/** The local calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** The bucket a local calendar date falls in: itself, its Monday, or the 1st of its month. */
export function bucketKey(date: string, bucket: AnalyticsBucket): string {
  if (bucket === 'day') return date;
  if (bucket === 'month') return `${date.slice(0, 7)}-01`;
  const d = new Date(`${date}T00:00:00Z`);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - sinceMonday * DAY_MS).toISOString().slice(0, 10);
}

/** Every bucket from `from` to `to` inclusive, in order, so empty periods still appear as zero. */
export function bucketKeys(from: Date, to: Date, bucket: AnalyticsBucket, timeZone: string) {
  const keys = new Set<string>();
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    keys.add(bucketKey(localDate(new Date(t), timeZone), bucket));
  }
  keys.add(bucketKey(localDate(to, timeZone), bucket));
  return [...keys];
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A share rounded to three decimals, or null when there is nothing to divide by. */
export const rate = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null;

/** Coarse public stock level: exact counts are never published (they are scrapeable and misread). */
export function stockLevel(units: number, lowBelow: number, goodFrom: number): StockLevel {
  if (units < lowBelow) return 'LOW';
  return units >= goodFrom ? 'GOOD' : 'MODERATE';
}
