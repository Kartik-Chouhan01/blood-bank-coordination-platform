import { useId, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { ArrowLeft, CheckCircle2, Pencil, Siren, XCircle } from 'lucide-react';
import {
  COMPONENT_LABELS,
  REQUEST_REASON_LABELS,
  URGENCY_RANK,
  type BloodRequestDetail,
  type Urgency,
} from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { Modal } from '@/components/ui/Modal';
import { DetailList, PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/fields';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { MedicalDisclaimer } from '@/components/domain/MedicalDisclaimer';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { EntityHistory } from '@/features/audit/components/EntityHistory';
import { toApiClientError } from '@/services/apiError';
import { formatDateTime } from '@/utils/format';
import { requestsApi } from '../api';
import { RequestForm } from '../components/RequestForm';
import { RequiredBy } from '../components/RequiredBy';

type Dialog = 'edit' | 'escalate' | 'cancel' | 'approve' | 'reject' | null;

function EscalateDialog({
  request,
  onClose,
  onDone,
}: {
  request: BloodRequestDetail;
  onClose: () => void;
  onDone: (r: BloodRequestDetail) => void;
}) {
  const options = (['URGENT', 'EMERGENCY'] as const).filter(
    (u) => URGENCY_RANK[u] < URGENCY_RANK[request.urgency],
  );
  const [urgency, setUrgency] = useState<Urgency>(options[options.length - 1] ?? 'EMERGENCY');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const ids = { urgency: useId(), reason: useId() };

  const submit = async () => {
    setSaving(true);
    setError(undefined);
    try {
      onDone(
        await requestsApi.escalate(request.id, {
          urgency: urgency as 'URGENT' | 'EMERGENCY',
          reason: reason.trim(),
        }),
      );
      onClose();
    } catch (err) {
      setError(toApiClientError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Raise urgency"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant={urgency === 'EMERGENCY' ? 'danger' : 'primary'}
            onClick={submit}
            isLoading={saving}
            disabled={reason.trim().length < 5}
          >
            Raise to {urgency === 'EMERGENCY' ? 'Emergency' : 'Urgent'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <p>
          Urgency can only be raised.{' '}
          {request.status === 'PENDING' && 'Raising to Emergency approves the request immediately.'}
        </p>
        <div className="max-w-48 space-y-1.5">
          <label htmlFor={ids.urgency} className="block text-sm font-medium text-slate-700">
            New urgency
          </label>
          <Select
            id={ids.urgency}
            value={urgency}
            onChange={(e) => setUrgency(e.target.value as Urgency)}
          >
            {options.map((u) => (
              <option key={u} value={u}>
                {u === 'EMERGENCY' ? 'Emergency' : 'Urgent'}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.reason} className="block text-sm font-medium text-slate-700">
            Reason <span className="text-slate-400">(no patient details)</span>
          </label>
          <textarea
            id={ids.reason}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
          />
        </div>
      </div>
    </Modal>
  );
}

export function RequestDetailPage({ area }: { area: 'hospital' | 'admin' }) {
  const { id = '' } = useParams();
  const justCreated = (useLocation().state as { created?: boolean } | null)?.created;
  const {
    data: request,
    error,
    isLoading,
    refetch,
    setData,
  } = useApiQuery(() => requestsApi.get(id), [id]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string }>();

  if (isLoading) return <LoadingState />;
  if (error || !request) return <ErrorState error={error} onRetry={refetch} />;

  const can = (action: BloodRequestDetail['allowedActions'][number]) =>
    request.allowedActions.includes(action);
  const run = async (fn: () => Promise<BloodRequestDetail>, message: string) => {
    setSaving(true);
    try {
      setData(await fn());
      setNotice({ tone: 'success', text: message });
    } catch (err) {
      setNotice({ tone: 'error', text: toApiClientError(err).message });
    } finally {
      setSaving(false);
      setDialog(null);
    }
  };

  const backTo = area === 'admin' ? '/admin/requests' : '/hospital/requests';
  return (
    <>
      <Link
        to={backTo}
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" aria-hidden /> Requests
      </Link>
      <PageHeader
        title={`Request ${request.requestNumber}`}
        description={
          area === 'admin'
            ? `${request.hospital.name}, ${request.hospital.city}`
            : `Raised ${formatDateTime(request.createdAt)}`
        }
        actions={
          <>
            {can('REVIEW') && (
              <>
                <Button
                  icon={<CheckCircle2 className="size-4" aria-hidden />}
                  onClick={() => setDialog('approve')}
                >
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  icon={<XCircle className="size-4" aria-hidden />}
                  onClick={() => setDialog('reject')}
                >
                  Reject
                </Button>
              </>
            )}
            {can('EDIT') && (
              <Button
                variant="secondary"
                icon={<Pencil className="size-4" aria-hidden />}
                onClick={() => setDialog('edit')}
              >
                Edit
              </Button>
            )}
            {can('ESCALATE') && (
              <Button
                variant="secondary"
                icon={<Siren className="size-4" aria-hidden />}
                onClick={() => setDialog('escalate')}
              >
                Raise urgency
              </Button>
            )}
            {can('CANCEL') && (
              <Button variant="ghost" onClick={() => setDialog('cancel')}>
                Cancel request
              </Button>
            )}
          </>
        }
      />

      {justCreated && !notice && (
        <Alert tone="success">
          {request.status === 'APPROVED'
            ? 'Emergency request raised and approved automatically. It is at the top of the blood-bank staff queue.'
            : 'Request raised. Blood-bank staff will review it shortly.'}
        </Alert>
      )}
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {request.statusReason && ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(request.status) && (
        <Alert
          tone={request.status === 'REJECTED' ? 'error' : 'info'}
          title={
            request.status === 'REJECTED'
              ? 'Rejected'
              : request.status === 'CANCELLED'
                ? 'Cancelled'
                : 'Expired'
          }
        >
          {request.statusReason}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit lg:col-span-1">
          <CardHeader
            title="Request"
            actions={<StatusBadge kind="request" value={request.status} />}
          />
          <div className="flex items-center gap-3 px-5 pt-4">
            <span className="rounded-md bg-brand-50 px-3 py-1 text-2xl font-bold text-brand-800">
              {request.bloodGroup}
            </span>
            <span className="text-sm text-slate-700">
              {request.unitsRequested} × {COMPONENT_LABELS[request.componentType]}
            </span>
          </div>
          <DetailList
            items={[
              { label: 'Urgency', value: <StatusBadge kind="urgency" value={request.urgency} /> },
              {
                label: 'Required by',
                value: <RequiredBy iso={request.requiredBy} overdue={request.overdue} />,
              },
              { label: 'Reason', value: REQUEST_REASON_LABELS[request.reasonCategory] },
              {
                label: 'Allocated / issued',
                value: `${request.unitsAllocated} / ${request.unitsIssued} of ${request.unitsRequested}`,
              },
              ...(request.hospitalReference
                ? [{ label: 'Hospital reference', value: request.hospitalReference }]
                : []),
              ...(request.notes ? [{ label: 'Notes', value: request.notes }] : []),
              { label: 'Raised by', value: request.createdBy?.name ?? '—' },
              ...(request.reviewedBy
                ? [
                    {
                      label: 'Reviewed by',
                      value: `${request.reviewedBy.name}, ${formatDateTime(request.reviewedAt)}`,
                    },
                  ]
                : []),
            ]}
          />
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {area === 'admin' && request.exactMatchAvailable !== null && (
            <Card>
              <CardHeader
                title="Stock"
                description="Unit reservation and compatible-group matching arrive with the matching workflow."
              />
              <p className="px-5 py-4 text-sm text-slate-700">
                <strong className="text-lg tabular-nums">{request.exactMatchAvailable}</strong>{' '}
                usable {request.bloodGroup} {COMPONENT_LABELS[request.componentType].toLowerCase()}{' '}
                unit{request.exactMatchAvailable === 1 ? '' : 's'} in stock (exact group only).
              </p>
            </Card>
          )}
          <Card>
            <CardHeader title="Progress" description="Every status change, newest first." />
            <ol className="divide-y divide-slate-100">
              {request.statusHistory.map((entry, i) => (
                <li key={`${entry.at}-${i}`} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge kind="request" value={entry.to} />
                    <time dateTime={entry.at} className="text-slate-500">
                      {formatDateTime(entry.at)}
                    </time>
                  </div>
                  <p className="mt-1 text-slate-600">
                    {entry.by ? `by ${entry.by.name}` : 'automatically'}
                    {entry.reason && <> — “{entry.reason}”</>}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
      {area === 'admin' && (
        <EntityHistory
          entityType="BloodRequest"
          entityId={request.id}
          refreshKey={`${request.status}-${request.urgency}`}
        />
      )}
      <MedicalDisclaimer variant="compatibility" />

      <Modal open={dialog === 'edit'} onClose={() => setDialog(null)} title="Edit request">
        {dialog === 'edit' && (
          <RequestForm
            existing={request}
            submitLabel="Save changes"
            onCancel={() => setDialog(null)}
            onSubmit={async (input) => {
              const { urgency: _urgency, ...changes } = input;
              setData(await requestsApi.update(request.id, changes));
              setNotice({ tone: 'success', text: 'Request updated.' });
              setDialog(null);
            }}
          />
        )}
      </Modal>
      {dialog === 'escalate' && (
        <EscalateDialog
          request={request}
          onClose={() => setDialog(null)}
          onDone={(updated) => {
            setData(updated);
            setNotice({
              tone: 'success',
              text: `Urgency raised to ${updated.urgency.toLowerCase()}.`,
            });
          }}
        />
      )}
      <ConfirmationDialog
        open={dialog === 'cancel'}
        title="Cancel request"
        description="The request will be closed. This cannot be undone; raise a new request if blood is needed later."
        confirmLabel="Cancel request"
        tone="danger"
        requireReason
        isLoading={saving}
        onConfirm={(reason) =>
          void run(() => requestsApi.cancel(request.id, { reason: reason! }), 'Request cancelled.')
        }
        onCancel={() => setDialog(null)}
      />
      <ConfirmationDialog
        open={dialog === 'approve'}
        title="Approve request"
        description={`Approve ${request.unitsRequested} × ${request.bloodGroup} ${COMPONENT_LABELS[request.componentType].toLowerCase()} for ${request.hospital.name}. It then moves to allocation.`}
        confirmLabel="Approve"
        isLoading={saving}
        onConfirm={() =>
          void run(
            () => requestsApi.review(request.id, { decision: 'APPROVE' }),
            'Request approved.',
          )
        }
        onCancel={() => setDialog(null)}
      />
      <ConfirmationDialog
        open={dialog === 'reject'}
        title="Reject request"
        description="The hospital will see your reason."
        confirmLabel="Reject"
        tone="danger"
        requireReason
        isLoading={saving}
        onConfirm={(reason) =>
          void run(
            () => requestsApi.review(request.id, { decision: 'REJECT', reason: reason! }),
            'Request rejected.',
          )
        }
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
