import { Link } from 'react-router';
import { CircleCheck, Circle, ArrowRight } from 'lucide-react';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Alert } from '@/components/ui/Alert';
import { donorOutreachApi } from '@/features/matching/api';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardHeader } from '@/components/ui/Card';
import { DetailList, PageHeader } from '@/components/ui/PageHeader';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { BloodGroupPill } from '@/components/domain/BloodGroupPill';
import { MedicalDisclaimer } from '@/components/domain/MedicalDisclaimer';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { formatDate } from '@/utils/format';
import { AvailabilityCard } from '../components/AvailabilityCard';
import { donorCompletionSteps } from '../profileCompletion';
import { useDonorProfile } from '../useDonorProfile';

/** Prompts the donor when a request for help is waiting for their answer. */
function PendingHelpRequests() {
  const { data } = useApiQuery(() => donorOutreachApi.mine());
  const waiting = data?.filter((item) => item.canRespond && item.status === 'NOTIFIED').length ?? 0;
  if (!waiting) return null;
  return (
    <Alert tone="warning" title="A blood bank asked for your help">
      {waiting === 1
        ? 'A nearby request needs your blood group.'
        : `${waiting} nearby requests need your blood group.`}{' '}
      <Link to="/donor/requests" className="font-medium underline">
        Review and reply
      </Link>
    </Alert>
  );
}

export function DonorOverviewPage() {
  const { user } = useAuth();
  const { data: donor, error, isLoading, refetch, setData } = useDonorProfile();

  if (isLoading) return <LoadingState />;
  if (error || !donor || !user) return <ErrorState error={error} onRetry={refetch} />;

  const steps = donorCompletionSteps(user, donor);
  const completed = steps.filter((step) => step.done).length;
  const percent = Math.round((completed / steps.length) * 100);

  return (
    <>
      <PageHeader
        title={`Hello, ${user.name.split(' ')[0]}`}
        description="Thank you for being willing to help. Here's your donor summary."
      />
      <PendingHelpRequests />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Donor summary" />
          <div className="flex items-center gap-3 px-5 pt-4">
            <BloodGroupPill
              bloodGroup={donor.bloodGroup}
              confirmed={donor.bloodGroupConfirmed}
              size="lg"
            />
          </div>
          <DetailList
            items={[
              { label: 'Area', value: `${donor.location.area}, ${donor.location.city}` },
              { label: 'Donations recorded', value: donor.donationCount },
              { label: 'Last donation', value: formatDate(donor.lastDonationAt, 'None yet') },
              {
                label: 'Verification',
                value: <StatusBadge kind="verification" value={donor.verificationStatus} />,
              },
            ]}
          />
          {donor.earliestContactDate && (
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              The system will not contact you about donating before{' '}
              <strong>{formatDate(donor.earliestContactDate)}</strong> ({donor.contactIntervalDays}{' '}
              days after your last recorded donation). Staff decide whether you can donate.
            </p>
          )}
        </Card>

        <div className="lg:col-span-2">
          <AvailabilityCard donor={donor} onChange={setData} />
        </div>

        <Card className="lg:col-span-3">
          <CardHeader
            title="Profile completion"
            description={`${completed} of ${steps.length} steps complete`}
            actions={<span className="text-sm font-semibold text-slate-900">{percent}%</span>}
          />
          <div className="px-5 pt-4">
            <div
              className="h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Profile completion"
            >
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${percent}%` }} />
            </div>
          </div>
          <ul className="divide-y divide-slate-100 px-5 py-2">
            {steps.map((step) => (
              <li
                key={step.label}
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
              >
                <span className="flex items-center gap-2.5">
                  {step.done ? (
                    <CircleCheck className="size-4 text-emerald-600" aria-label="Done" />
                  ) : (
                    <Circle className="size-4 text-slate-300" aria-label="Not done" />
                  )}
                  <span className={step.done ? 'text-slate-500' : 'text-slate-800'}>
                    {step.label}
                  </span>
                </span>
                {!step.done &&
                  (step.to ? (
                    <Link
                      to={step.to}
                      className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
                    >
                      Do this <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-400">Done by staff</span>
                  ))}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <MedicalDisclaimer />
    </>
  );
}
