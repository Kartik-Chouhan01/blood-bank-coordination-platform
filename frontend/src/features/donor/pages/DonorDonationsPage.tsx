import { Droplets } from 'lucide-react';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Card, CardHeader } from '@/components/ui/Card';
import { DetailList, PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { formatDate } from '@/utils/format';
import { donationsApi } from '@/features/inventory/api';
import { useDonorProfile } from '../useDonorProfile';

export function DonorDonationsPage() {
  const profile = useDonorProfile();
  const donations = useApiQuery(donationsApi.mine);

  if (profile.isLoading || donations.isLoading) return <LoadingState />;
  if (profile.error || !profile.data)
    return <ErrorState error={profile.error} onRetry={profile.refetch} />;
  const donor = profile.data;

  return (
    <>
      <PageHeader
        title="Donation history"
        description="Donations recorded by blood-bank staff. Thank you for every one."
      />
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
        {donations.error && <ErrorState error={donations.error} onRetry={donations.refetch} />}
        {donations.data && donations.data.length === 0 && (
          <EmptyState
            icon={<Droplets className="size-6" aria-hidden />}
            title="No donations recorded yet"
            description="When blood-bank staff record a donation from you, it will appear here."
          />
        )}
        {donations.data && donations.data.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {donations.data.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
              >
                <span className="flex items-center gap-3">
                  <Droplets className="size-4 text-brand-600" aria-hidden />
                  <span>
                    <span className="font-medium text-slate-900">{formatDate(d.collectedAt)}</span>
                    <span className="block text-slate-500">
                      {d.bloodBankName}
                      {d.city && `, ${d.city}`}
                    </span>
                  </span>
                </span>
                <span className="text-slate-600">
                  {d.donationType === 'WHOLE_BLOOD' ? 'Whole blood' : 'Apheresis'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
