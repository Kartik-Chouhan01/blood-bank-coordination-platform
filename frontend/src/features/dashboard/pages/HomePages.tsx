import { Link } from 'react-router';
import { ArrowRight, Users } from 'lucide-react';
import { ROLE_LABELS } from '@bbms/shared';
import { useAuth } from '@/hooks/useAuth';
import { usePermission } from '@/hooks/useAuth';
import { Alert } from '@/components/ui/Alert';
import { Card, CardHeader } from '@/components/ui/Card';
import { DetailList, PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { MedicalDisclaimer } from '@/components/domain/MedicalDisclaimer';

const firstName = (name: string) => name.split(' ')[0];

export function DonorHomePage() {
  const { user } = useAuth();
  const profile = user?.profile?.kind === 'DONOR' ? user.profile : null;
  if (!user || !profile) return null;

  return (
    <>
      <PageHeader
        title={`Hello, ${firstName(user.name)}`}
        description="Thank you for being willing to help. Here's your donor summary."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Donor profile" />
          <DetailList
            items={[
              {
                label: 'Blood group',
                value: (
                  <span className="rounded-md bg-brand-50 px-2 py-0.5 font-bold text-brand-800">
                    {profile.bloodGroup}
                  </span>
                ),
              },
              { label: 'Area', value: `${profile.area}, ${profile.city}` },
              {
                label: 'Profile verification',
                value: <StatusBadge kind="verification" value={profile.verificationStatus} />,
              },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="What happens next" />
          <ol className="list-decimal space-y-2 px-9 py-4 text-sm text-slate-700">
            <li>Confirm your email address so we can reach you.</li>
            <li>Blood-bank staff confirm your blood group at your first donation.</li>
            <li>
              When a nearby request matches your group, you'll be notified and can choose to
              respond.
            </li>
          </ol>
        </Card>
      </div>
      <MedicalDisclaimer />
    </>
  );
}

export function HospitalHomePage() {
  const { user } = useAuth();
  const profile = user?.profile?.kind === 'HOSPITAL' ? user.profile : null;
  if (!user || !profile) return null;
  const verified = profile.verificationStatus === 'VERIFIED';

  return (
    <>
      <PageHeader title={profile.hospitalName} description={`Signed in as ${user.name}`} />
      {!verified && (
        <Alert
          tone={profile.verificationStatus === 'REJECTED' ? 'error' : 'warning'}
          title="Verification required"
        >
          {profile.verificationStatus === 'PENDING'
            ? 'An administrator is reviewing your hospital registration. You can raise blood requests once it is verified.'
            : 'Your hospital is not currently verified. Please contact support.'}
        </Alert>
      )}
      <Card>
        <CardHeader title="Hospital" />
        <DetailList
          items={[
            { label: 'Name', value: profile.hospitalName },
            {
              label: 'Verification',
              value: <StatusBadge kind="verification" value={profile.verificationStatus} />,
            },
          ]}
        />
      </Card>
    </>
  );
}

export function AdminHomePage() {
  const { user } = useAuth();
  const canManageUsers = usePermission('users:read');
  if (!user) return null;

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName(user.name)}`}
        description={`${ROLE_LABELS[user.role]} console`}
      />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {canManageUsers && (
          <Link to="/admin/users" className="group">
            <Card className="p-5 transition-shadow group-hover:shadow-md">
              <Users className="size-6 text-brand-700" aria-hidden />
              <h2 className="mt-3 font-semibold text-slate-900">Users</h2>
              <p className="mt-1 text-sm text-slate-600">
                Search accounts, suspend or reactivate access.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
                Manage users <ArrowRight className="size-4" aria-hidden />
              </span>
            </Card>
          </Link>
        )}
      </div>
    </>
  );
}
