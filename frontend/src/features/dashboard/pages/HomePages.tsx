import { Link } from 'react-router';
import {
  ArrowRight,
  Boxes,
  Building2,
  HeartHandshake,
  Hospital,
  ScrollText,
  Send,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { ROLE_LABELS } from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useAuth, usePermission } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { hospitalsApi } from '@/features/organisations/api';
import { unitsApi } from '@/features/inventory/api';
import { requestsApi } from '@/features/requests/api';

const firstName = (name: string) => name.split(' ')[0];

function ConsoleCard({
  to,
  icon: Icon,
  title,
  body,
  cta,
  badge,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  body: string;
  cta: string;
  badge?: string | undefined;
}) {
  return (
    <Link to={to} className="group">
      <Card className="h-full p-5 transition-shadow group-hover:shadow-md">
        <div className="flex items-start justify-between">
          <Icon className="size-6 text-brand-700" aria-hidden />
          {badge && <Badge tone="warning">{badge}</Badge>}
        </div>
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
  const canReadHospitals = usePermission('hospitals:read');
  const canReadBanks = usePermission('bloodBanks:read');
  const canReadAudit = usePermission('audit:read');
  const canReadInventory = usePermission('inventory:read');
  const canReadRequests = usePermission('requests:read');
  const requestStats = useApiQuery(
    () => (canReadRequests ? requestsApi.stats() : Promise.resolve(null)),
    [canReadRequests],
  );
  const ownBank = user?.profile?.kind === 'STAFF' ? user.profile.bloodBankId : undefined;
  const stock = useApiQuery(
    () => (canReadInventory ? unitsApi.summary(ownBank) : Promise.resolve(null)),
    [canReadInventory, ownBank],
  );
  const pending = useApiQuery(
    () =>
      canReadHospitals
        ? hospitalsApi.list({ verificationStatus: 'PENDING', limit: 1 }).then((p) => p.meta.total)
        : Promise.resolve(0),
    [canReadHospitals],
  );
  if (!user) return null;
  const pendingCount = pending.data ?? 0;
  const expiringSoon = stock.data?.expiringSoon ?? 0;
  const availableUnits = stock.data?.byStatus.AVAILABLE ?? 0;

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName(user.name)}`}
        description={`${ROLE_LABELS[user.role]} console`}
      />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {canReadRequests && (
          <ConsoleCard
            to="/admin/requests"
            icon={Send}
            title="Blood requests"
            body={`${requestStats.data?.open ?? 0} open, ${requestStats.data?.pendingReview ?? 0} awaiting review.`}
            cta="Open request queue"
            badge={
              requestStats.data?.openEmergency
                ? `${requestStats.data.openEmergency} emergency`
                : undefined
            }
          />
        )}
        {canReadInventory && (
          <ConsoleCard
            to="/admin/inventory"
            icon={Boxes}
            title="Blood inventory"
            body={`${availableUnits} units available${ownBank ? ' at your blood bank' : ''}. Track testing, expiry and disposal.`}
            cta="Open inventory"
            badge={expiringSoon ? `${expiringSoon} expiring soon` : undefined}
          />
        )}
        {canReadDonors && (
          <ConsoleCard
            to="/admin/donors"
            icon={HeartHandshake}
            title="Donors"
            body="Filter by group, area and availability; verify donors and confirm blood groups."
            cta="View donors"
          />
        )}
        {canReadHospitals && (
          <ConsoleCard
            to="/admin/hospitals"
            icon={Hospital}
            title="Hospitals"
            body="Review registrations and verify hospitals before they can request blood."
            cta="View hospitals"
            badge={pendingCount ? `${pendingCount} awaiting review` : undefined}
          />
        )}
        {canReadBanks && (
          <ConsoleCard
            to="/admin/blood-banks"
            icon={Building2}
            title="Blood banks"
            body="Participating blood banks and their staff."
            cta="View blood banks"
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
        {canReadAudit && (
          <ConsoleCard
            to="/admin/audit-logs"
            icon={ScrollText}
            title="Audit log"
            body="Who did what, when and why, across the whole platform."
            cta="Open audit log"
          />
        )}
      </div>
    </>
  );
}
