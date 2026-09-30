import { useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  Boxes,
  ChartLine,
  Siren,
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
import { ErrorState } from '@/components/ui/States';
import { ChartCard } from '@/components/charts/ChartCard';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { StatTile } from '@/components/charts/StatTile';
import { BankScopeSelect } from '@/features/inventory/components/BankScopeSelect';
import { dashboardApi } from '../api';

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
  const canReadAnalytics = usePermission('analytics:read');
  const [bankId, setBankId] = useState<string>();
  const overview = useApiQuery(
    () => (canReadInventory ? dashboardApi.overview(bankId) : Promise.resolve(null)),
    [canReadInventory, bankId],
  );
  if (!user) return null;
  const o = overview.data;
  const pendingCount = o?.verification.hospitalsPending ?? 0;
  const emergencies = o?.requests.openByUrgency.EMERGENCY ?? 0;

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName(user.name)}`}
        description={`${ROLE_LABELS[user.role]} console`}
      />
      {overview.error && <ErrorState error={overview.error} onRetry={overview.refetch} />}
      {o && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label="Open requests"
              value={o.requests.open}
              hint={`${o.requests.pendingReview} awaiting review · ${o.requests.overdue} overdue`}
              status={
                emergencies > 0 ? (
                  <Badge tone="critical" icon={<Siren className="size-3.5" aria-hidden />}>
                    {emergencies} emergency
                  </Badge>
                ) : undefined
              }
            />
            <StatTile
              label="Reserved, awaiting issue"
              value={o.awaitingIssue}
              hint={o.bloodBank ? `At ${o.bloodBank.name}` : 'All blood banks'}
            />
            <StatTile
              label="Expiring soon"
              value={o.expiringSoon}
              hint={`Usable units expiring within ${o.expiryWarningDays} days`}
            />
            <StatTile
              label="Donors ready to help"
              value={o.outreach.interested}
              hint={`${o.outreach.awaitingReply} contacted, awaiting a reply`}
            />
          </div>
          <ChartCard
            title="Usable stock by blood group"
            description={
              <span className="inline-flex flex-wrap items-center gap-2">
                Available, tested and in date, all components.
                <BankScopeSelect
                  value={bankId ?? o.bloodBank?.id ?? ''}
                  onChange={(id) => setBankId(id)}
                />
              </span>
            }
            table={{
              columns: ['Blood group', 'Units'],
              rows: o.stockByGroup.map((g) => [g.bloodGroup, g.units]),
            }}
          >
            <ColumnChart
              categories={o.stockByGroup.map((g) => g.bloodGroup)}
              series={[{ label: 'Units', values: o.stockByGroup.map((g) => g.units), slot: 0 }]}
              summary={`Usable units per blood group at ${o.bloodBank?.name ?? 'all blood banks'}`}
              labelValues
            />
          </ChartCard>
        </>
      )}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {canReadRequests && (
          <ConsoleCard
            to="/admin/requests"
            icon={Send}
            title="Blood requests"
            body="Review, allocate units and contact potential donors."
            cta="Open request queue"
          />
        )}
        {canReadInventory && (
          <ConsoleCard
            to="/admin/inventory"
            icon={Boxes}
            title="Blood inventory"
            body="Track testing, expiry and disposal for every unit."
            cta="Open inventory"
          />
        )}
        {canReadAnalytics && (
          <ConsoleCard
            to="/admin/analytics"
            icon={ChartLine}
            title="Analytics"
            body="Demand, fulfilment times, issues and expiry wastage over time."
            cta="Open analytics"
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
