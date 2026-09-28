import { Link } from 'react-router';
import { ArrowRight, HeartHandshake, Users, type LucideIcon } from 'lucide-react';
import { ROLE_LABELS } from '@bbms/shared';
import { useAuth } from '@/hooks/useAuth';
import { usePermission } from '@/hooks/useAuth';
import { Alert } from '@/components/ui/Alert';
import { Card, CardHeader } from '@/components/ui/Card';
import { DetailList, PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/domain/StatusBadge';

const firstName = (name: string) => name.split(' ')[0];

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

function ConsoleCard({
  to,
  icon: Icon,
  title,
  body,
  cta,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <Link to={to} className="group">
      <Card className="h-full p-5 transition-shadow group-hover:shadow-md">
        <Icon className="size-6 text-brand-700" aria-hidden />
        <h2 className="mt-3 font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{body}</p>
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
          {cta} <ArrowRight className="size-4" aria-hidden />
        </span>
      </Card>
    </Link>
  );
}

export function AdminHomePage() {
  const { user } = useAuth();
  const canReadDonors = usePermission('donors:read');
  const canManageUsers = usePermission('users:read');
  if (!user) return null;

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName(user.name)}`}
        description={`${ROLE_LABELS[user.role]} console`}
      />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {canReadDonors && (
          <ConsoleCard
            to="/admin/donors"
            icon={HeartHandshake}
            title="Donors"
            body="Filter by group, area and availability; verify donors and confirm blood groups."
            cta="View donors"
          />
        )}
        {canManageUsers && (
          <ConsoleCard
            to="/admin/users"
            icon={Users}
            title="Users"
            body="Search accounts, suspend or reactivate access."
            cta="Manage users"
          />
        )}
      </div>
    </>
  );
}
