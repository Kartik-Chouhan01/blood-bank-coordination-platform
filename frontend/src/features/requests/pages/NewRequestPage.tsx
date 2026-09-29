import { useNavigate } from 'react-router';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Alert } from '@/components/ui/Alert';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { MedicalDisclaimer } from '@/components/domain/MedicalDisclaimer';
import { hospitalSelfApi } from '@/features/organisations/api';
import { requestsApi } from '../api';
import { RequestForm } from '../components/RequestForm';

export function NewRequestPage() {
  const navigate = useNavigate();
  const hospital = useApiQuery(hospitalSelfApi.get);

  if (hospital.isLoading) return <LoadingState />;
  if (hospital.error || !hospital.data)
    return <ErrorState error={hospital.error} onRetry={hospital.refetch} />;

  const blocked =
    hospital.data.verificationStatus !== 'VERIFIED'
      ? 'Your hospital must be verified by an administrator before it can raise blood requests.'
      : hospital.data.operatingStatus !== 'OPERATIONAL'
        ? 'Your hospital is marked as closed. Update its operating status to raise requests.'
        : null;

  return (
    <>
      <PageHeader title="New blood request" description={hospital.data.name} />
      {blocked ? (
        <Alert
          tone="warning"
          title="Requests are not available yet"
          action={
            <ButtonLink to="/hospital/profile" variant="secondary" size="sm">
              Hospital profile
            </ButtonLink>
          }
        >
          {blocked}
        </Alert>
      ) : (
        <Card className="max-w-3xl p-5">
          <RequestForm
            submitLabel="Raise request"
            onCancel={() => navigate('/hospital/requests')}
            onSubmit={async (input) => {
              const created = await requestsApi.create(input);
              navigate(`/hospital/requests/${created.id}`, {
                replace: true,
                state: { created: true },
              });
            }}
          />
        </Card>
      )}
      <MedicalDisclaimer />
    </>
  );
}
