const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export const formatDate = (iso: string | null | undefined, fallback = '—') =>
  iso ? dateFormat.format(new Date(iso)) : fallback;

export const formatDateTime = (iso: string | null | undefined, fallback = '—') =>
  iso ? dateTimeFormat.format(new Date(iso)) : fallback;

/** YYYY-MM-DD for <input type="date">, `days` from today. */
export function isoDateFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "in 3 hours", "2 days ago" — the largest sensible unit. */
export function formatRelative(iso: string, now = Date.now()): string {
  const diffMs = new Date(iso).getTime() - now;
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
}

/** Local time for <input type="datetime-local">, `hours` from now. */
export function localDateTimeFromNow(hours: number): string {
  const date = new Date(Date.now() + hours * 3_600_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

/** Converts an ISO timestamp to the local value an <input type="datetime-local"> expects. */
export function toLocalDateTimeInput(iso: string): string {
  const date = new Date(iso);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}
