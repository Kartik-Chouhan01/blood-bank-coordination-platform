import { Droplets } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { DetailList, PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { formatDate } from '@/utils/format';
import { useDonorProfile } from '../useDonorProfile';

export function DonorDonationsPage() {
  const { data: donor, error, isLoading, refetch } = useDonorProfile();
  if (isLoading) return <LoadingState />;
  if (error || !donor) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader title="Donation history" description="Donations recorded by blood-bank staff." />
      <Card>
        <CardHeader title="Summary" />
        <DetailList
          items={[
            { label: 'Donations recorded', value: donor.donationCount },
            { label: 'Last donation', value: formatDate(donor.lastDonationAt, 'None yet') },
            {
              label: 'System may contact you again from',
              value: formatDate(donor.earliestContactDate, 'Any time'),
            },
          ]}
        />
      </Card>
      <Card>
        <CardHeader title="Donations" />
        <EmptyState
          icon={<Droplets className="size-6" aria-hidden />}
          title="No donations recorded yet"
          description="When blood-bank staff record a donation from you, it will appear here with its date and location."
        />
      </Card>
    </>
  );
}
