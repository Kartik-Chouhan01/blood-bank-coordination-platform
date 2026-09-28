import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, FlaskConical } from 'lucide-react';
import { BLOOD_GROUPS, COMPONENT_LABELS, type BloodGroup, type DonationDetail } from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { DetailList, PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/fields';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { MedicalDisclaimer } from '@/components/domain/MedicalDisclaimer';
import { EntityHistory } from '@/features/audit/components/EntityHistory';
import { toApiClientError } from '@/services/apiError';
import { formatDateTime } from '@/utils/format';
import { donationsApi } from '../api';

const TESTING_LABEL = { PENDING: 'Pending', PASSED: 'Passed', FAILED: 'Failed' } as const;
const TESTING_TONE = { PENDING: 'neutral', PASSED: 'success', FAILED: 'critical' } as const;

function TestResultDialog({
  donation,
  onClose,
  onDone,
}: {
  donation: DonationDetail;
  onClose: () => void;
  onDone: (d: DonationDetail) => void;
}) {
  const [result, setResult] = useState<'PASSED' | 'FAILED'>('PASSED');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>(donation.units[0]?.bloodGroup ?? 'O+');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const ids = { group: useId(), note: useId() };
  const underTesting = donation.units.filter((u) => u.status === 'UNDER_TESTING').length;
  const valid = result === 'PASSED' || note.trim().length >= 5;

  const submit = async () => {
    setSaving(true);
    setError(undefined);
    try {
      onDone(
        await donationsApi.recordResult(donation.id, {
          result,
          ...(result === 'PASSED' && { bloodGroup }),
          ...(note.trim() && { note: note.trim() }),
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
      title="Record test result"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant={result === 'FAILED' ? 'danger' : 'primary'}
            onClick={submit}
            isLoading={saving}
            disabled={!valid}
          >
            {result === 'PASSED'
              ? `Release ${underTesting} unit${underTesting === 1 ? '' : 's'}`
              : `Discard ${underTesting} unit${underTesting === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <p>
          Applies to the {underTesting} unit{underTesting === 1 ? '' : 's'} of this donation
          currently under testing.
        </p>
        <fieldset className="flex gap-4 text-sm">
          <legend className="sr-only">Result</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="result"
              className="accent-brand-600"
              checked={result === 'PASSED'}
              onChange={() => setResult('PASSED')}
            />{' '}
            Passed — release to inventory
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="result"
              className="accent-brand-600"
              checked={result === 'FAILED'}
              onChange={() => setResult('FAILED')}
            />{' '}
            Failed — discard
          </label>
        </fieldset>
        {result === 'PASSED' && (
          <div className="max-w-48 space-y-1.5">
            <label htmlFor={ids.group} className="block text-sm font-medium text-slate-700">
              Tested blood group
            </label>
            <Select
              id={ids.group}
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value as BloodGroup)}
            >
              {BLOOD_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
            <p className="text-xs text-slate-500">
              Also confirms the donor&apos;s blood group if not yet confirmed.
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor={ids.note} className="block text-sm font-medium text-slate-700">
            Note{' '}
            {result === 'FAILED' ? (
              <span className="text-slate-400">
                (required; staff and audit only — never shown to the donor)
              </span>
            ) : (
              <span className="text-slate-400">(optional)</span>
            )}
          </label>
          <textarea
            id={ids.note}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
          />
        </div>
      </div>
    </Modal>
  );
}

export function DonationDetailPage() {
  const { id = '' } = useParams();
  const {
    data: donation,
    error,
    isLoading,
    refetch,
    setData,
  } = useApiQuery(() => donationsApi.get(id), [id]);
  const [resultOpen, setResultOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string }>();

  if (isLoading) return <LoadingState />;
  if (error || !donation) return <ErrorState error={error} onRetry={refetch} />;

  const startTesting = async () => {
    setStarting(true);
    try {
      setData(await donationsApi.startTesting(donation.id));
      setNotice({ tone: 'success', text: 'Units sent to testing.' });
    } catch (err) {
      setNotice({ tone: 'error', text: toApiClientError(err).message });
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <Link
        to="/admin/donations"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" aria-hidden /> Donations
      </Link>
      <PageHeader
        title={`Donation from ${donation.donor.name}`}
        description={`${formatDateTime(donation.collectedAt)} · ${donation.bloodBank.name}`}
        actions={
          <>
            {donation.canStartTesting && (
              <Button
                icon={<FlaskConical className="size-4" aria-hidden />}
                onClick={startTesting}
                isLoading={starting}
              >
                Send to testing
              </Button>
            )}
            {donation.canRecordResult && (
              <Button onClick={() => setResultOpen(true)}>Record test result</Button>
            )}
          </>
        }
      />
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader title="Donation" />
          <DetailList
            items={[
              {
                label: 'Donor',
                value: (
                  <Link
                    className="text-brand-700 hover:underline"
                    to={`/admin/donors/${donation.donor.id}`}
                  >
                    {donation.donor.name}
                  </Link>
                ),
              },
              {
                label: 'Type',
                value: donation.donationType === 'WHOLE_BLOOD' ? 'Whole blood' : 'Apheresis',
              },
              { label: 'Volume', value: `${donation.volumeMl} ml` },
              { label: 'Recorded by', value: donation.recordedBy?.name ?? '—' },
              {
                label: 'Testing',
                value: (
                  <Badge tone={TESTING_TONE[donation.testingStatus]}>
                    {TESTING_LABEL[donation.testingStatus]}
                  </Badge>
                ),
              },
              ...(donation.testedAt
                ? [
                    {
                      label: 'Tested',
                      value: `${formatDateTime(donation.testedAt)} by ${donation.testedBy?.name ?? '—'}`,
                    },
                  ]
                : []),
              ...(donation.testedBloodGroup
                ? [{ label: 'Tested group', value: donation.testedBloodGroup }]
                : []),
              ...(donation.testNote ? [{ label: 'Test note', value: donation.testNote }] : []),
              ...(donation.notes ? [{ label: 'Notes', value: donation.notes }] : []),
            ]}
          />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Units" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Unit
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Component
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Group
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {donation.units.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-3">
                      <Link
                        className="font-mono text-xs font-medium text-slate-900 hover:text-brand-700 hover:underline"
                        to={`/admin/inventory/units/${u.id}`}
                      >
                        {u.unitCode}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {COMPONENT_LABELS[u.componentType]}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-md bg-brand-50 px-2 py-0.5 font-bold text-brand-800">
                        {u.bloodGroup}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge kind="unit" value={u.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <EntityHistory
        entityType="Donation"
        entityId={donation.id}
        refreshKey={`${donation.testingStatus}-${donation.units.map((u) => u.status).join()}`}
      />
      <MedicalDisclaimer />
      {resultOpen && (
        <TestResultDialog
          donation={donation}
          onClose={() => setResultOpen(false)}
          onDone={(updated) => {
            setData(updated);
            setNotice({
              tone: 'success',
              text: `Result recorded: ${updated.testingStatus === 'PASSED' ? 'units released to inventory' : 'units discarded'}.`,
            });
          }}
        />
      )}
    </>
  );
}
