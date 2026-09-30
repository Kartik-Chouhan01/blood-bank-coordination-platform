import { useState } from 'react';
import { PackagePlus, Truck, Undo2 } from 'lucide-react';
import type { AllocationView, BloodRequestDetail } from '@bbms/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/States';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { toApiClientError } from '@/services/apiError';
import { formatDate, formatDateTime } from '@/utils/format';
import { matchingApi } from '../api';
import { ReserveUnitsDialog } from './ReserveUnitsDialog';

interface AllocationPanelProps {
  request: BloodRequestDetail;
  area: 'hospital' | 'admin';
  onChange: (updated: BloodRequestDetail) => void;
  onNotice: (notice: { tone: 'success' | 'error'; text: string }) => void;
}

type Pending = { kind: 'issue' | 'release'; allocation: AllocationView } | null;

function AllocationRow({
  allocation,
  staff,
  onAction,
}: {
  allocation: AllocationView;
  staff: boolean;
  onAction: (pending: Pending) => void;
}) {
  const a = allocation;
  const when =
    a.status === 'RECEIVED'
      ? `Received ${formatDateTime(a.receivedAt)}`
      : a.status === 'ISSUED'
        ? `Issued ${formatDateTime(a.issuedAt)}${a.issuedBy ? ` by ${a.issuedBy.name}` : ''}`
        : a.status === 'RELEASED'
          ? `Released ${formatDateTime(a.releasedAt)}`
          : `Reserved ${formatDateTime(a.reservedAt)}${a.reservedBy ? ` by ${a.reservedBy.name}` : ''}`;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-medium text-slate-900">{a.unit.unitCode}</span>
          <span className="font-semibold">{a.unit.bloodGroup}</span>
          {a.groupMatch === 'COMPATIBLE' && <Badge tone="warning">Substitute</Badge>}
          <StatusBadge kind="allocation" value={a.status} />
        </div>
        <p className="text-slate-500">
          {a.bloodBank.name} · expires {formatDate(a.unit.expiryDate)} · {when}
        </p>
        {a.holdUntil && staff && (
          <p className="text-xs text-slate-500">
            Held until {formatDateTime(a.holdUntil)}, then released automatically.
          </p>
        )}
        {a.releaseReason && <p className="text-xs text-slate-500">“{a.releaseReason}”</p>}
      </div>
      {(a.canIssue || a.canRelease) && (
        <div className="flex gap-2">
          {a.canIssue && (
            <Button
              size="sm"
              icon={<Truck className="size-4" aria-hidden />}
              onClick={() => onAction({ kind: 'issue', allocation: a })}
            >
              Issue
            </Button>
          )}
          {a.canRelease && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Undo2 className="size-4" aria-hidden />}
              onClick={() => onAction({ kind: 'release', allocation: a })}
            >
              Release
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/** Units reserved/issued for a request. Staff reserve, issue and release here. */
export function AllocationPanel({ request, area, onChange, onNotice }: AllocationPanelProps) {
  const staff = area === 'admin';
  const [reserving, setReserving] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [saving, setSaving] = useState(false);
  const canAllocate = request.allowedActions.includes('ALLOCATE');

  const act = async (reason?: string) => {
    if (!pending) return;
    setSaving(true);
    try {
      const { kind, allocation } = pending;
      onChange(
        kind === 'issue'
          ? await matchingApi.issue(allocation.id)
          : await matchingApi.release(allocation.id, { reason: reason! }),
      );
      onNotice({
        tone: 'success',
        text: `Unit ${allocation.unit.unitCode} ${kind === 'issue' ? 'issued' : 'released back to stock'}.`,
      });
    } catch (err) {
      onNotice({ tone: 'error', text: toApiClientError(err).message });
    } finally {
      setSaving(false);
      setPending(null);
    }
  };

  const live = request.allocations.filter((a) => a.status !== 'RELEASED');
  const released = request.allocations.filter((a) => a.status === 'RELEASED');
  const description = staff
    ? request.stock
      ? `In stock: ${request.stock.exact} exact-group, ${request.stock.compatibleSubstitutes} compatible substitute unit${request.stock.compatibleSubstitutes === 1 ? '' : 's'}.`
      : undefined
    : 'Units the blood bank has set aside or sent for this request.';

  return (
    <Card>
      <CardHeader
        title="Units"
        description={description}
        actions={
          canAllocate && (
            <Button
              size="sm"
              icon={<PackagePlus className="size-4" aria-hidden />}
              onClick={() => setReserving(true)}
            >
              Reserve units
            </Button>
          )
        }
      />
      {live.length === 0 ? (
        <EmptyState
          title="No units allocated yet"
          description={
            staff
              ? canAllocate
                ? 'Reserve compatible units from inventory.'
                : 'Units can be reserved once the request is approved.'
              : 'The blood bank will set aside units once the request is approved.'
          }
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {live.map((a) => (
            <AllocationRow key={a.id} allocation={a} staff={staff} onAction={setPending} />
          ))}
        </ul>
      )}
      {staff && released.length > 0 && (
        <details className="border-t border-slate-100">
          <summary className="cursor-pointer px-5 py-3 text-sm text-slate-600">
            {released.length} released reservation{released.length === 1 ? '' : 's'}
          </summary>
          <ul className="divide-y divide-slate-100">
            {released.map((a) => (
              <AllocationRow key={a.id} allocation={a} staff onAction={setPending} />
            ))}
          </ul>
        </details>
      )}

      {reserving && (
        <ReserveUnitsDialog
          request={request}
          onClose={() => setReserving(false)}
          onReserved={(updated) => {
            onChange(updated);
            onNotice({ tone: 'success', text: 'Units reserved.' });
          }}
        />
      )}
      <ConfirmationDialog
        open={pending?.kind === 'issue'}
        title="Issue unit"
        description={`Hand unit ${pending?.allocation.unit.unitCode ?? ''} over to ${request.hospital.name}. The hospital confirms receipt when it arrives.`}
        confirmLabel="Issue unit"
        isLoading={saving}
        onConfirm={() => void act()}
        onCancel={() => setPending(null)}
      />
      <ConfirmationDialog
        open={pending?.kind === 'release'}
        title="Release reservation"
        description={`Unit ${pending?.allocation.unit.unitCode ?? ''} goes back to available stock.`}
        confirmLabel="Release"
        tone="danger"
        requireReason
        isLoading={saving}
        onConfirm={(reason) => void act(reason)}
        onCancel={() => setPending(null)}
      />
    </Card>
  );
}
