import { useId, useState } from 'react';
import { ScrollText } from 'lucide-react';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  type AuditAction,
  type AuditEntityType,
  type ListAuditLogsQuery,
} from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/fields';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { AuditEntryItem } from '@/features/audit/components/AuditEntryItem';
import { auditApi } from '@/features/organisations/api';

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<AuditAction | ''>('');
  const [entityType, setEntityType] = useState<AuditEntityType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const fromId = useId();
  const toId = useId();

  const query: Partial<ListAuditLogsQuery> = {
    page,
    limit: 25,
    ...(action && { action }),
    ...(entityType && { entityType }),
    ...(from && { from }),
    ...(to && { to }),
  };
  const { data, error, isLoading, refetch } = useApiQuery(() => auditApi.list(query), [query]);
  const reset =
    <T,>(setter: (v: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Append-only record of important actions: who did what, when and why. Entries cannot be edited or deleted."
      />
      <Card>
        <div className="grid items-end gap-3 border-b border-slate-100 p-4 md:grid-cols-4">
          <Select
            aria-label="Action"
            value={action}
            onChange={(e) => reset(setAction)(e.target.value as AuditAction | '')}
          >
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABELS[a]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Record type"
            value={entityType}
            onChange={(e) => reset(setEntityType)(e.target.value as AuditEntityType | '')}
          >
            <option value="">All record types</option>
            {AUDIT_ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <div className="space-y-1">
            <label htmlFor={fromId} className="block text-xs font-medium text-slate-600">
              From
            </label>
            <Input
              id={fromId}
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => reset(setFrom)(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={toId} className="block text-xs font-medium text-slate-600">
              To
            </label>
            <Input
              id={toId}
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => reset(setTo)(e.target.value)}
            />
          </div>
        </div>
        {isLoading && <LoadingState label="Loading audit log…" />}
        {error && <ErrorState error={error} onRetry={refetch} />}
        {data && data.items.length === 0 && (
          <EmptyState
            icon={<ScrollText className="size-6" aria-hidden />}
            title="No entries match these filters"
          />
        )}
        {data && data.items.length > 0 && (
          <>
            <ul className="divide-y divide-slate-100">
              {data.items.map((entry) => (
                <AuditEntryItem key={entry.id} entry={entry} showEntity />
              ))}
            </ul>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
