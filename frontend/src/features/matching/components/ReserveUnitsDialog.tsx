import { useState } from 'react';
import { COMPONENT_LABELS, type BloodRequestDetail } from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { MedicalDisclaimer } from '@/components/domain/MedicalDisclaimer';
import { ExpiryBadge } from '@/features/inventory/components/ExpiryBadge';
import { toApiClientError } from '@/services/apiError';
import { matchingApi } from '../api';

interface ReserveUnitsDialogProps {
  request: BloodRequestDetail;
  onClose: () => void;
  onReserved: (updated: BloodRequestDetail) => void;
}

/**
 * Lists compatible, in-date units in ranked order with a suggested selection. Nothing is reserved
 * until staff confirm; the server re-checks every unit inside the reservation transaction.
 */
export function ReserveUnitsDialog({ request, onClose, onReserved }: ReserveUnitsDialogProps) {
  const { data, error, isLoading, refetch } = useApiQuery(
    () => matchingApi.inventory(request.id),
    [request.id],
  );
  const [chosen, setChosen] = useState<Set<string>>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  const selected = chosen ?? new Set(data?.preselectedUnitIds ?? []);
  const shortfall = data?.shortfall ?? 0;
  const toggle = (unitId: string) => {
    const next = new Set(selected);
    if (next.has(unitId)) next.delete(unitId);
    else next.add(unitId);
    setChosen(next);
  };

  const submit = async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      onReserved(await matchingApi.reserve(request.id, { unitIds: [...selected] }));
      onClose();
    } catch (err) {
      setSaveError(toApiClientError(err).message);
      setChosen(undefined);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const tooMany = selected.size > shortfall;
  return (
    <Modal
      open
      size="wide"
      onClose={onClose}
      title={`Reserve units for ${request.requestNumber}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            isLoading={saving}
            disabled={selected.size === 0 || tooMany || isLoading}
          >
            Reserve {selected.size} unit{selected.size === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p>
          {shortfall} more unit{shortfall === 1 ? '' : 's'} of {request.bloodGroup}{' '}
          {COMPONENT_LABELS[request.componentType].toLowerCase()} needed. Units are listed exact
          group first, then compatible substitutes, earliest expiry first. Only units usable until
          the required-by time are shown.
        </p>
        {saveError && <Alert tone="error">{saveError}</Alert>}
        {tooMany && (
          <Alert tone="warning">
            Select at most {shortfall} unit{shortfall === 1 ? '' : 's'}.
          </Alert>
        )}
        {isLoading ? (
          <LoadingState label="Finding compatible units…" />
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.candidates.length === 0 ? (
          <EmptyState
            title="No compatible units in stock"
            description="Consider contacting potential donors from the donor outreach panel."
          />
        ) : (
          <div className="max-h-96 overflow-auto rounded-lg ring-1 ring-slate-200">
            <table className="min-w-full text-sm">
              <caption className="sr-only">Compatible units</caption>
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">Select</span>
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Unit
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Group
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Expiry
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Blood bank
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.candidates.map((c) => (
                  <tr key={c.unitId} className={c.canReserve ? '' : 'text-slate-400'}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-slate-300"
                        aria-label={`Select unit ${c.unitCode}`}
                        checked={selected.has(c.unitId)}
                        disabled={!c.canReserve}
                        onChange={() => toggle(c.unitId)}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {c.unitCode}
                      {c.storageLocation && (
                        <span className="block text-xs text-slate-400">{c.storageLocation}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-semibold">{c.bloodGroup}</span>{' '}
                      {c.groupMatch === 'COMPATIBLE' && <Badge tone="warning">Substitute</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      <ExpiryBadge
                        expiryDate={c.expiryDate}
                        daysToExpiry={c.daysToExpiry}
                        expiredByDate={false}
                        inInventory
                      />
                    </td>
                    <td className="px-3 py-2">
                      {c.bloodBank.name}
                      {!c.canReserve && (
                        <span className="block text-xs">Another bank — ask its staff</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data?.truncated && (
          <p className="text-xs text-slate-500">Showing the best-ranked units only.</p>
        )}
        <MedicalDisclaimer variant="compatibility" />
      </div>
    </Modal>
  );
}
