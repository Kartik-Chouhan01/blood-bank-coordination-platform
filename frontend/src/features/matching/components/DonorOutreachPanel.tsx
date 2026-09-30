import { useState } from 'react';
import { Mail, Phone, UserSearch } from 'lucide-react';
import {
  POTENTIAL_DONOR_LABEL,
  type BloodRequestDetail,
  type DonorCandidate,
  type RequestOutreachSummary,
} from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { toApiClientError } from '@/services/apiError';
import { formatDateTime } from '@/utils/format';
import { matchingApi } from '../api';

const distance = (km: number | null) => (km === null ? 'same city' : `≈${km} km`);

function Group({ group, confirmed }: { group: string; confirmed: boolean }) {
  return (
    <span className="font-semibold">
      {group}
      {!confirmed && (
        <span className="ml-1 text-xs font-normal text-slate-500">(self-declared)</span>
      )}
    </span>
  );
}

function FindDonorsDialog({
  request,
  onClose,
  onContacted,
}: {
  request: BloodRequestDetail;
  onClose: () => void;
  onContacted: (summary: RequestOutreachSummary) => void;
}) {
  const { data, error, isLoading, refetch } = useApiQuery(
    () => matchingApi.donors(request.id),
    [request.id],
  );
  const [chosen, setChosen] = useState<Set<string>>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  const suggested = (data?.candidates ?? []).slice(0, data?.suggestedCount ?? 0);
  const selected = chosen ?? new Set(suggested.map((c) => c.donorId));
  const toggle = (c: DonorCandidate) => {
    const next = new Set(selected);
    if (next.has(c.donorId)) next.delete(c.donorId);
    else next.add(c.donorId);
    setChosen(next);
  };

  const submit = async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      onContacted(await matchingApi.startOutreach(request.id, { donorIds: [...selected] }));
      onClose();
    } catch (err) {
      setSaveError(toApiClientError(err).message);
      setChosen(undefined);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="wide"
      onClose={onClose}
      title="Find potential donors"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={saving} disabled={selected.size === 0 || isLoading}>
            Contact {selected.size} donor{selected.size === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {data && (
          <p>
            {data.shortfall} unit{data.shortfall === 1 ? '' : 's'} still needed. Showing donors{' '}
            {data.searchedBy === 'DISTANCE'
              ? `within ${data.radiusKm} km of the hospital`
              : "in the hospital's city"}{' '}
            who are verified, available, allow contact and have not been contacted too recently. The
            top {data.suggestedCount} are pre-selected. Names and contact details appear only after
            a donor says they are interested.
          </p>
        )}
        {saveError && <Alert tone="error">{saveError}</Alert>}
        {isLoading ? (
          <LoadingState label="Searching…" />
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.candidates.length === 0 ? (
          <EmptyState
            title="No potential donors match the criteria"
            description="Everyone suitable nearby may already have been contacted."
          />
        ) : (
          <div className="max-h-96 overflow-auto rounded-lg ring-1 ring-slate-200">
            <table className="min-w-full text-sm">
              <caption className="sr-only">{POTENTIAL_DONOR_LABEL}</caption>
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">Select</span>
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Group
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Area
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Distance
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.candidates.map((c, i) => (
                  <tr key={c.donorId}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-slate-300"
                        aria-label={`Select potential donor ${i + 1}`}
                        checked={selected.has(c.donorId)}
                        onChange={() => toggle(c)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Group group={c.bloodGroup} confirmed={c.bloodGroupConfirmed} />{' '}
                      {c.groupMatch === 'COMPATIBLE' && <Badge tone="warning">Substitute</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      {c.area}, {c.city}
                    </td>
                    <td className="px-3 py-2">{distance(c.approxDistanceKm)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500">
          {POTENTIAL_DONOR_LABEL}. Blood-bank staff decide whether anyone can donate.
        </p>
      </div>
    </Modal>
  );
}

/** Donors contacted for a request, their replies, and (once interested) how to reach them. */
export function DonorOutreachPanel({ request }: { request: BloodRequestDetail }) {
  const { data, error, isLoading, refetch, setData } = useApiQuery(
    () => matchingApi.outreach(request.id),
    [request.id, request.outreachStatus],
  );
  const [finding, setFinding] = useState(false);
  const canSearch = request.allowedActions.includes('OUTREACH');

  return (
    <Card>
      <CardHeader
        title="Donor outreach"
        description="Contact potential donors when stock cannot cover the request."
        actions={
          canSearch && (
            <Button
              size="sm"
              variant="secondary"
              icon={<UserSearch className="size-4" aria-hidden />}
              onClick={() => setFinding(true)}
            >
              Find potential donors
            </Button>
          )
        }
      />
      {isLoading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.outreach.length === 0 ? (
        <EmptyState title="No donors contacted for this request" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.outreach.map((o) => (
            <li key={o.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <div className="space-y-0.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Group group={o.bloodGroup} confirmed={o.bloodGroupConfirmed} />
                  <StatusBadge kind="outreach" value={o.status} />
                </div>
                <p className="text-slate-500">
                  {o.area}, {o.city} · {distance(o.approxDistanceKm)} · contacted{' '}
                  {formatDateTime(o.notifiedAt)}
                </p>
              </div>
              {o.contact && (
                <div className="text-sm">
                  <p className="font-medium text-slate-900">{o.contact.name}</p>
                  <a
                    href={`tel:${o.contact.phone.replace(/\s/g, '')}`}
                    className="flex items-center gap-1 text-brand-700 hover:underline"
                  >
                    <Phone className="size-3.5" aria-hidden /> {o.contact.phone}
                  </a>
                  <a
                    href={`mailto:${o.contact.email}`}
                    className="flex items-center gap-1 text-brand-700 hover:underline"
                  >
                    <Mail className="size-3.5" aria-hidden /> {o.contact.email}
                  </a>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {finding && (
        <FindDonorsDialog
          request={request}
          onClose={() => setFinding(false)}
          onContacted={setData}
        />
      )}
    </Card>
  );
}
