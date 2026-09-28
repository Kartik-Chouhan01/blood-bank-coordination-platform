import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, ShieldCheck, ShieldX } from 'lucide-react';
import { useApiQuery } from '@/hooks/useApiQuery';
import { usePermission } from '@/hooks/useAuth';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { DetailList, PageHeader } from '@/components/ui/PageHeader';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { toApiClientError } from '@/services/apiError';
import { formatDate, formatDateTime } from '@/utils/format';
import { EntityHistory } from '@/features/audit/components/EntityHistory';
import { hospitalsApi } from '@/features/organisations/api';

type Decision = 'VERIFIED' | 'REJECTED' | 'SUSPENDED';

const DIALOG: Record<Decision, { title: string; confirm: string; tone: 'primary' | 'danger' }> = {
  VERIFIED: { title: 'Verify hospital', confirm: 'Verify', tone: 'primary' },
  REJECTED: { title: 'Reject registration', confirm: 'Reject', tone: 'danger' },
  SUSPENDED: { title: 'Suspend hospital', confirm: 'Suspend', tone: 'danger' },
};

export function HospitalDetailPage() {
  const { id = '' } = useParams();
  const canVerify = usePermission('hospitals:verify');
  const {
    data: hospital,
    error,
    isLoading,
    refetch,
    setData,
  } = useApiQuery(() => hospitalsApi.get(id), [id]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string }>();

  if (isLoading) return <LoadingState />;
  if (error || !hospital) return <ErrorState error={error} onRetry={refetch} />;

  const apply = async (reason?: string) => {
    if (!decision) return;
    setSaving(true);
    try {
      setData(
        await hospitalsApi.setVerification(hospital.id, {
          status: decision,
          ...(reason && { reason }),
        }),
      );
      setNotice({
        tone: 'success',
        text: 'Decision recorded and the hospital has been notified by email.',
      });
    } catch (err) {
      setNotice({ tone: 'error', text: toApiClientError(err).message });
    } finally {
      setSaving(false);
      setDecision(null);
    }
  };

  const status = hospital.verificationStatus;
  return (
    <>
      <Link
        to="/admin/hospitals"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" aria-hidden /> All hospitals
      </Link>
      <PageHeader
        title={hospital.name}
        description={`Registered ${formatDate(hospital.registeredAt)}`}
        actions={
          canVerify && (
            <>
              {status !== 'VERIFIED' && (
                <Button
                  icon={<ShieldCheck className="size-4" aria-hidden />}
                  onClick={() => setDecision('VERIFIED')}
                >
                  Verify
                </Button>
              )}
              {status === 'PENDING' && (
                <Button
                  variant="secondary"
                  icon={<ShieldX className="size-4" aria-hidden />}
                  onClick={() => setDecision('REJECTED')}
                >
                  Reject
                </Button>
              )}
              {status === 'VERIFIED' && (
                <Button
                  variant="secondary"
                  icon={<ShieldX className="size-4" aria-hidden />}
                  onClick={() => setDecision('SUSPENDED')}
                >
                  Suspend
                </Button>
              )}
            </>
          )
        }
      />
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {hospital.resubmittedAt && status === 'PENDING' && (
        <Alert tone="info">
          Resubmitted with corrected details on {formatDateTime(hospital.resubmittedAt)}.
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Registration" />
          <DetailList
            items={[
              { label: 'Registration number', value: hospital.registrationNumber },
              { label: 'Verification', value: <StatusBadge kind="verification" value={status} /> },
              ...(hospital.statusReason ? [{ label: 'Reason', value: hospital.statusReason }] : []),
              { label: 'Verified on', value: formatDate(hospital.verifiedAt, 'Not verified') },
              {
                label: 'Operating status',
                value: (
                  <Badge tone={hospital.operatingStatus === 'OPERATIONAL' ? 'success' : 'muted'}>
                    {hospital.operatingStatus === 'OPERATIONAL' ? 'Operational' : 'Closed'}
                  </Badge>
                ),
              },
              {
                label: 'Address',
                value: `${hospital.address.line1}, ${hospital.address.city}, ${hospital.address.state} ${hospital.address.postalCode}`,
              },
            ]}
          />
        </Card>
        <Card className="h-fit">
          <CardHeader title="Contact" />
          <DetailList
            items={[
              { label: 'Name', value: hospital.contact.name },
              {
                label: 'Email',
                value: (
                  <a
                    className="text-brand-700 hover:underline"
                    href={`mailto:${hospital.contact.email}`}
                  >
                    {hospital.contact.email}
                  </a>
                ),
              },
              {
                label: 'Phone',
                value: (
                  <a
                    className="text-brand-700 hover:underline"
                    href={`tel:${hospital.contact.phone}`}
                  >
                    {hospital.contact.phone}
                  </a>
                ),
              },
            ]}
          />
        </Card>
      </div>
      <EntityHistory
        entityType="Hospital"
        entityId={hospital.id}
        refreshKey={`${status}-${hospital.resubmittedAt}`}
      />

      {decision && (
        <ConfirmationDialog
          open
          title={DIALOG[decision].title}
          description={
            decision === 'VERIFIED'
              ? `Confirm you have checked ${hospital.name}'s registration (${hospital.registrationNumber}). The hospital will be able to raise blood requests.`
              : `The hospital will be told the reason by email${decision === 'REJECTED' ? ' and can correct its details to resubmit' : ''}.`
          }
          confirmLabel={DIALOG[decision].confirm}
          tone={DIALOG[decision].tone}
          requireReason={decision !== 'VERIFIED'}
          isLoading={saving}
          onConfirm={apply}
          onCancel={() => setDecision(null)}
        />
      )}
    </>
  );
}
