import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { AUDIT_ACTION_LABELS, ROLE_LABELS, type AuditLogEntry } from '@bbms/shared';
import { formatDateTime } from '@/utils/format';

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Field-by-field comparison of an entry's before/after snapshots. */
function Changes({ before, after }: Pick<AuditLogEntry, 'before' | 'after'>) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (!keys.length) return <p className="text-slate-500">No field changes recorded.</p>;
  return (
    <table className="w-full text-left text-xs">
      <thead className="text-slate-500">
        <tr>
          <th scope="col" className="py-1 pr-3 font-medium">
            Field
          </th>
          <th scope="col" className="py-1 pr-3 font-medium">
            Before
          </th>
          <th scope="col" className="py-1 font-medium">
            After
          </th>
        </tr>
      </thead>
      <tbody>
        {keys.map((key) => {
          const from = formatValue(before?.[key]);
          const to = formatValue(after?.[key]);
          return (
            <tr key={key} className={from !== to ? 'font-medium text-slate-900' : 'text-slate-500'}>
              <td className="py-1 pr-3">{key}</td>
              <td className="py-1 pr-3">{before ? from : '—'}</td>
              <td className="py-1">{after ? to : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function AuditEntryItem({
  entry,
  showEntity = false,
}: {
  entry: AuditLogEntry;
  showEntity?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasDetails = !!(entry.before || entry.after || entry.requestId);
  const actor = entry.actor
    ? `${entry.actor.name} (${ROLE_LABELS[entry.actor.role]})`
    : entry.actorRole === 'SYSTEM'
      ? 'System'
      : 'Deleted user';

  return (
    <li className="px-5 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={!hasDetails}
            aria-expanded={open}
            className="flex items-center gap-1 text-left font-medium text-slate-900 disabled:cursor-default"
          >
            {hasDetails &&
              (open ? (
                <ChevronDown className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4" aria-hidden />
              ))}
            {AUDIT_ACTION_LABELS[entry.action]}
          </button>
          <p className="mt-0.5 text-slate-600">
            by {actor}
            {showEntity && (
              <span className="text-slate-400">
                {' '}
                · {entry.entityType} {entry.entityId.slice(-6)}
              </span>
            )}
          </p>
          {entry.reason && <p className="mt-1 text-slate-700">“{entry.reason}”</p>}
        </div>
        <time dateTime={entry.createdAt} className="shrink-0 text-slate-500">
          {formatDateTime(entry.createdAt)}
        </time>
      </div>
      {open && (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
          <Changes before={entry.before} after={entry.after} />
          <p className="text-xs text-slate-400">
            {entry.requestId && <>Request {entry.requestId}</>}
            {entry.ipTruncated && <> · IP {entry.ipTruncated}</>}
          </p>
        </div>
      )}
    </li>
  );
}
