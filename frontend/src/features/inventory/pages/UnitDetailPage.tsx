import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import {
  COMPONENT_LABELS,
  EXPIRABLE_UNIT_STATUSES,
  type AvailableUnitTransition,
} from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { DetailList, PageHeader } from '@/components/ui/PageHeader';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { toApiClientError } from '@/services/apiError';
import { formatDateTime } from '@/utils/format';
import { unitsApi } from '../api';
import { ExpiryBadge } from '../components/ExpiryBadge';

const IN_INVENTORY = new Set<string>(EXPIRABLE_UNIT_STATUSES);

export function UnitDetailPage() {
  const { id = '' } = useParams();
  const {
    data: unit,
    error,
    isLoading,
    refetch,
    setData,
  } = useApiQuery(() => unitsApi.get(id), [id]);
  const [action, setAction] = useState<AvailableUnitTransition | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string }>();

  if (isLoading) return <LoadingState />;
  if (error || !unit) return <ErrorState error={error} onRetry={refetch} />;

  const apply = async (reason?: string) => {
    if (!action) return;
    setSaving(true);
    try {
      setData(
        await unitsApi.transition(unit.id, {
          to: action.to,
          ...(reason && { reason }),
          ...(action.override && { override: true }),
        }),
      );
      setNotice({ tone: 'success', text: `${action.label}: done.` });
    } catch (err) {
      setNotice({ tone: 'error', text: toApiClientError(err).message });
    } finally {
      setSaving(false);
      setAction(null);
    }
  };

  return (
    <>
      <Link
        to="/admin/inventory"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" aria-hidden /> Inventory
      </Link>
      <PageHeader
        title={unit.unitCode}
        description={`${COMPONENT_LABELS[unit.componentType]} · ${unit.bloodBank.name}`}
        actions={unit.allowedTransitions.map((t) => (
          <Button
            key={`${t.to}-${t.override}`}
            variant={t.to === 'DISCARDED' || t.override ? 'secondary' : 'primary'}
            icon={t.override ? <ShieldAlert className="size-4" aria-hidden /> : undefined}
            onClick={() => setAction(t)}
          >
            {t.label}
          </Button>
        ))}
      />
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {unit.expiredByDate && (
        <Alert tone="error" title="Past expiry date">
          This unit can no longer be used. It will be marked expired automatically; record its
          disposal once it is.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-fit">
          <CardHeader title="Unit" />
          <DetailList
            items={[
              {
                label: 'Blood group',
                value: (
                  <span className="rounded-md bg-brand-50 px-2 py-0.5 font-bold text-brand-800">
                    {unit.bloodGroup}
                  </span>
                ),
              },
              { label: 'Component', value: COMPONENT_LABELS[unit.componentType] },
              { label: 'Status', value: <StatusBadge kind="unit" value={unit.status} /> },
              {
                label: 'Testing',
                value: (
                  <Badge
                    tone={
                      unit.testingStatus === 'PASSED'
                        ? 'success'
                        : unit.testingStatus === 'FAILED'
                          ? 'critical'
                          : 'neutral'
                    }
                  >
                    {unit.testingStatus === 'PENDING'
                      ? 'Pending'
                      : unit.testingStatus === 'PASSED'
                        ? 'Passed'
                        : 'Failed'}
                  </Badge>
                ),
              },
              { label: 'Collected', value: formatDateTime(unit.collectedAt) },
              {
                label: 'Expiry',
                value: (
                  <ExpiryBadge
                    expiryDate={unit.expiryDate}
                    daysToExpiry={unit.daysToExpiry}
                    expiredByDate={unit.expiredByDate}
                    inInventory={IN_INVENTORY.has(unit.status)}
                  />
                ),
              },
              { label: 'Volume', value: unit.volumeMl ? `${unit.volumeMl} ml` : '—' },
              { label: 'Storage', value: unit.storageLocation ?? '—' },
              {
                label: 'Donation',
                value: (
                  <Link
                    className="text-brand-700 hover:underline"
                    to={`/admin/donations/${unit.donationId}`}
                  >
                    View donation
                  </Link>
                ),
              },
              ...(unit.donor
                ? [
                    {
                      label: 'Donor',
                      value: (
                        <Link
                          className="text-brand-700 hover:underline"
                          to={`/admin/donors/${unit.donor.id}`}
                        >
                          {unit.donor.name}
                        </Link>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Lifecycle" description="Every status change, newest first." />
          <ol className="divide-y divide-slate-100">
            {unit.statusHistory.map((entry, i) => (
              <li key={`${entry.at}-${i}`} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <StatusBadge kind="unit" value={entry.to} />
                    {entry.override && (
                      <Badge
                        tone="critical"
                        icon={<ShieldAlert className="size-3.5" aria-hidden />}
                      >
                        Override
                      </Badge>
                    )}
                  </span>
                  <time dateTime={entry.at} className="text-slate-500">
                    {formatDateTime(entry.at)}
                  </time>
                </div>
                <p className="mt-1 text-slate-600">
                  {entry.by ? `by ${entry.by.name}` : 'by the system'}
                  {entry.reason && <> — “{entry.reason}”</>}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {action && (
        <ConfirmationDialog
          open
          title={action.label}
          description={
            action.override
              ? 'This is an administrator override of the normal workflow. It will be flagged in the unit history and the audit log. The unit will need to pass testing again before it can be used.'
              : action.to === 'DISCARDED'
                ? 'Discarded units can never be used. Record why.'
                : `Move ${unit.unitCode} to “${action.label}”.`
          }
          confirmLabel={action.label}
          tone={action.to === 'DISCARDED' || action.override ? 'danger' : 'primary'}
          requireReason={action.requiresReason}
          isLoading={saving}
          onConfirm={apply}
          onCancel={() => setAction(null)}
        />
      )}
    </>
  );
}
