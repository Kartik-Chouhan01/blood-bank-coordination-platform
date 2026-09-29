import { Link } from 'react-router';
import { ArrowRight, Plus } from 'lucide-react';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/hooks/useAuth';
import { Alert } from '@/components/ui/Alert';
import { Card, CardHeader } from '@/components/ui/Card';
import { DetailList, PageHeader } from '@/components/ui/PageHeader';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { MedicalDisclaimer } from '@/components/domain/MedicalDisclaimer';
import { formatDate } from '@/utils/format';
import { hospitalSelfApi } from '@/features/organisations/api';
import { requestsApi } from '@/features/requests/api';
import { ButtonLink } from '@/components/ui/Button';
import type { HospitalSelfView } from '@bbms/shared';

function VerificationNotice({ hospital }: { hospital: HospitalSelfView }) {
  const editLink = (
    <Link to="/hospital/profile" className="inline-flex items-center gap-1 font-medium underline">
      Review hospital details <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
  switch (hospital.verificationStatus) {
    case 'PENDING':
      return (
        <Alert tone="warning" title="Awaiting verification">
          An administrator is reviewing your registration. You&apos;ll be able to raise blood
          requests once it is verified, and we&apos;ll email you when that happens. {editLink}
        </Alert>
      );
    case 'REJECTED':
      return (
        <Alert tone="error" title="Verification unsuccessful">
          <p>Reason: {hospital.statusReason}</p>
          <p className="mt-1">
            Correcting your hospital name or registration number resubmits it for review. {editLink}
          </p>
        </Alert>
      );
    case 'SUSPENDED':
      return (
        <Alert tone="error" title="Hospital suspended">
          Reason: {hospital.statusReason}. Please contact the blood bank administrator.
        </Alert>
      );
    default:
      return null;
  }
}

function RequestsCard({ verified }: { verified: boolean }) {
  const stats = useApiQuery(
    () => (verified ? requestsApi.myStats() : Promise.resolve(null)),
    [verified],
  );
  return (
    <Card>
      <CardHeader
        title="Blood requests"
        actions={
          verified && (
            <ButtonLink
              to="/hospital/requests/new"
              size="sm"
              icon={<Plus className="size-4" aria-hidden />}
            >
              New request
            </ButtonLink>
          )
        }
      />
      {!verified ? (
        <p className="px-5 py-4 text-sm text-slate-600">
          Blood requests become available once your hospital is verified.
        </p>
      ) : (
        <>
          <DetailList
            items={[
              { label: 'Active requests', value: stats.data?.open ?? '—' },
              { label: 'Awaiting review', value: stats.data?.pendingReview ?? '—' },
              { label: 'Active emergencies', value: stats.data?.openEmergency ?? '—' },
              { label: 'Overdue', value: stats.data?.overdue ?? '—' },
            ]}
          />
          <div className="border-t border-slate-100 px-5 py-3">
            <Link
              to="/hospital/requests"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
            >
              View all requests <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}

export function HospitalOverviewPage() {
  const { user } = useAuth();
  const { data: hospital, error, isLoading, refetch } = useApiQuery(hospitalSelfApi.get);
  if (isLoading) return <LoadingState />;
  if (error || !hospital) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader title={hospital.name} description={`Signed in as ${user?.name}`} />
      <VerificationNotice hospital={hospital} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Hospital" />
          <DetailList
            items={[
              { label: 'Registration number', value: hospital.registrationNumber },
              {
                label: 'Verification',
                value: <StatusBadge kind="verification" value={hospital.verificationStatus} />,
              },
              { label: 'Verified on', value: formatDate(hospital.verifiedAt, 'Not yet') },
              {
                label: 'Operating status',
                value: (
                  <Badge tone={hospital.operatingStatus === 'OPERATIONAL' ? 'success' : 'muted'}>
                    {hospital.operatingStatus === 'OPERATIONAL' ? 'Operational' : 'Closed'}
                  </Badge>
                ),
              },
              { label: 'City', value: `${hospital.address.city}, ${hospital.address.state}` },
            ]}
          />
        </Card>
        <RequestsCard verified={hospital.verificationStatus === 'VERIFIED'} />
      </div>
      <MedicalDisclaimer />
    </>
  );
}
