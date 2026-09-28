import type { AuditEntityType } from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { usePermission } from '@/hooks/useAuth';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { auditApi } from '@/features/organisations/api';
import { AuditEntryItem } from './AuditEntryItem';

function HistoryList({ entityType, entityId }: { entityType: AuditEntityType; entityId: string }) {
  const { data, error, isLoading, refetch } = useApiQuery(
    () => auditApi.list({ entityType, entityId, limit: 20 }),
    [entityType, entityId],
  );
  if (isLoading) return <LoadingState label="Loading history…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data?.items.length) return <EmptyState title="No recorded changes" />;
  return (
    <ul className="divide-y divide-slate-100">
      {data.items.map((entry) => (
        <AuditEntryItem key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}

/** Audit trail for one record. Rendered only for roles allowed to read the audit log. */
export function EntityHistory({
  entityType,
  entityId,
  refreshKey,
}: {
  entityType: AuditEntityType;
  entityId: string;
  /** Change to reload after an action on the record. */
  refreshKey?: unknown;
}) {
  const canRead = usePermission('audit:read');
  if (!canRead) return null;
  return (
    <Card>
      <CardHeader title="History" description="Every recorded change, newest first." />
      <HistoryList key={String(refreshKey)} entityType={entityType} entityId={entityId} />
    </Card>
  );
}
