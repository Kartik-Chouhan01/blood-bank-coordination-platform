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
