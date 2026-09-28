import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, BadgeCheck, ShieldCheck, ShieldX } from 'lucide-react';
import { BLOOD_GROUPS, type BloodGroup, type DonorStaffDetail } from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { usePermission } from '@/hooks/useAuth';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { Modal } from '@/components/ui/Modal';
import { DetailList, PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/fields';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { BloodGroupPill } from '@/components/domain/BloodGroupPill';
import { MedicalDisclaimer } from '@/components/domain/MedicalDisclaimer';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { toApiClientError } from '@/services/apiError';
import { formatDate, formatDateTime } from '@/utils/format';
import { donorStaffApi } from '@/features/donor/api';
import { EntityHistory } from '@/features/audit/components/EntityHistory';

type Notice = { tone: 'success' | 'error'; text: string } | undefined;
type VerificationAction = 'VERIFIED' | 'REJECTED' | 'SUSPENDED';

function ConfirmBloodGroupDialog({
  donor,
  open,
  onClose,
  onDone,
}: {
  donor: DonorStaffDetail;
  open: boolean;
  onClose: () => void;
  onDone: (d: DonorStaffDetail) => void;
}) {
  const [group, setGroup] = useState<BloodGroup>(donor.bloodGroup);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const selectId = useId();
  const noteId = useId();
  const differs = group !== donor.bloodGroup;
  const noteValid = !differs || note.trim().length >= 5;

  const submit = async () => {
    setSaving(true);
    setError(undefined);
    try {
      onDone(
        await donorStaffApi.confirmBloodGroup(donor.id, {
          bloodGroup: group,
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
      open={open}
      onClose={onClose}
      title="Confirm blood group"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={saving} disabled={!noteValid}>
            Confirm {group}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p>
          Record the blood group established by laboratory testing. The donor will no longer be able
          to change it.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="max-w-40 space-y-1.5">
          <label htmlFor={selectId} className="block text-sm font-medium text-slate-700">
            Tested blood group
          </label>
          <Select
            id={selectId}
            value={group}
            onChange={(e) => setGroup(e.target.value as BloodGroup)}
          >
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </div>
        {differs && (
          <div className="space-y-1.5">
            <Alert tone="warning">
              This differs from the donor&apos;s declared group ({donor.bloodGroup}).
            </Alert>
            <label htmlFor={noteId} className="block text-sm font-medium text-slate-700">
              Reason for correction{' '}
              <span className="text-slate-400">(recorded in the audit log)</span>
            </label>
            <textarea
              id={noteId}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

export function DonorDetailPage() {
  const { id = '' } = useParams();
  const canVerify = usePermission('donors:verify');
  const {
    data: donor,
    error,
    isLoading,
    refetch,
    setData,
  } = useApiQuery(() => donorStaffApi.get(id), [id]);
  const [pending, setPending] = useState<VerificationAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [groupDialog, setGroupDialog] = useState(false);
  const [notice, setNotice] = useState<Notice>();

  if (isLoading) return <LoadingState />;
  if (error || !donor) return <ErrorState error={error} onRetry={refetch} />;

  const applyVerification = async (reason?: string) => {
    if (!pending) return;
    setSaving(true);
    try {
      setData(
        await donorStaffApi.setVerification(donor.id, {
          status: pending,
          ...(reason && { reason }),
        }),
      );
      setNotice({ tone: 'success', text: 'Verification status updated.' });
    } catch (err) {
      setNotice({ tone: 'error', text: toApiClientError(err).message });
    } finally {
      setSaving(false);
      setPending(null);
    }
  };

  return (
    <>
      <Link
        to="/admin/donors"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" aria-hidden /> All donors
      </Link>
      <PageHeader
        title={donor.name}
        description={`Registered ${formatDate(donor.registeredAt)}`}
        actions={
          canVerify && (
            <>
              {donor.verificationStatus !== 'VERIFIED' && (
                <Button
                  icon={<ShieldCheck className="size-4" aria-hidden />}
                  onClick={() => setPending('VERIFIED')}
                >
                  Verify
                </Button>
              )}
              {donor.verificationStatus !== 'REJECTED' && (
                <Button
                  variant="secondary"
                  icon={<ShieldX className="size-4" aria-hidden />}
                  onClick={() =>
                    setPending(donor.verificationStatus === 'VERIFIED' ? 'SUSPENDED' : 'REJECTED')
                  }
                >
                  {donor.verificationStatus === 'VERIFIED' ? 'Suspend' : 'Reject'}
                </Button>
              )}
            </>
          )
        }
      />
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {donor.accountStatus !== 'ACTIVE' && (
        <Alert tone="warning">
          This donor&apos;s account is {donor.accountStatus.toLowerCase()} and cannot sign in.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Donor"
            actions={
              canVerify && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<BadgeCheck className="size-4" aria-hidden />}
                  onClick={() => setGroupDialog(true)}
                >
                  {donor.bloodGroupConfirmed ? 'Correct blood group' : 'Confirm blood group'}
                </Button>
              )
            }
          />
          <DetailList
            items={[
              {
                label: 'Blood group',
                value: (
                  <BloodGroupPill
                    bloodGroup={donor.bloodGroup}
                    confirmed={donor.bloodGroupConfirmed}
                  />
                ),
              },
              { label: 'Age', value: donor.age },
              { label: 'Area', value: `${donor.area}, ${donor.city}` },
              {
                label: 'Verification',
                value: <StatusBadge kind="verification" value={donor.verificationStatus} />,
              },
              {
                label: 'Availability',
                value: <StatusBadge kind="availability" value={donor.effectiveAvailability} />,
              },
              { label: 'Donations recorded', value: donor.donationCount },
              { label: 'Last donation', value: formatDate(donor.lastDonationAt, 'Never') },
              {
                label: 'Contact interval ends',
                value: formatDate(donor.earliestContactDate, 'No restriction'),
              },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Availability history" description="Most recent first" />
          <ul className="divide-y divide-slate-100">
            {donor.availabilityHistory.map((entry, index) => (
              <li
                key={`${entry.changedAt}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
              >
                <span className="flex items-center gap-2">
                  <StatusBadge kind="availability" value={entry.status} />
                  {entry.availableAgainAt && (
                    <span className="text-slate-500">
                      until {formatDate(entry.availableAgainAt)}
                    </span>
                  )}
                </span>
                <time dateTime={entry.changedAt} className="text-slate-500">
                  {formatDateTime(entry.changedAt)}
                </time>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <EntityHistory
        entityType="DonorProfile"
        entityId={donor.id}
        refreshKey={`${donor.verificationStatus}-${donor.bloodGroup}-${donor.bloodGroupConfirmed}`}
      />
      <MedicalDisclaimer />

      <ConfirmationDialog
        open={!!pending}
        title={
          pending === 'VERIFIED'
            ? 'Verify donor'
            : pending === 'SUSPENDED'
              ? 'Suspend donor verification'
              : 'Reject donor'
        }
        description={
          pending === 'VERIFIED'
            ? `Confirm that ${donor.name}'s identity and registration details have been checked.`
            : `${donor.name} will not be considered for donor matching.`
        }
        confirmLabel={
          pending === 'VERIFIED' ? 'Verify' : pending === 'SUSPENDED' ? 'Suspend' : 'Reject'
        }
        tone={pending === 'VERIFIED' ? 'primary' : 'danger'}
        requireReason={pending !== 'VERIFIED'}
        isLoading={saving}
        onConfirm={applyVerification}
        onCancel={() => setPending(null)}
      />
      {groupDialog && (
        <ConfirmBloodGroupDialog
          donor={donor}
          open={groupDialog}
          onClose={() => setGroupDialog(false)}
          onDone={(updated) => {
            setData(updated);
            setNotice({ tone: 'success', text: `Blood group confirmed as ${updated.bloodGroup}.` });
          }}
        />
      )}
    </>
  );
}
