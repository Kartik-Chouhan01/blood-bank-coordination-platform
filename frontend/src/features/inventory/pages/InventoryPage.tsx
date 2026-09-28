import { useState } from 'react';
import { Link } from 'react-router';
import { Plus, Search } from 'lucide-react';
import {
  BLOOD_GROUPS,
  COMPONENT_LABELS,
  COMPONENT_TYPES,
  EXPIRABLE_UNIT_STATUSES,
  UNIT_STATUSES,
  type BloodGroup,
  type ComponentType,
  type ListBloodUnitsQuery,
  type UnitStatus,
} from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useAuth, usePermission } from '@/hooks/useAuth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/fields';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { UNIT_STATUS_PRESENTATION } from '@/constants/statusPresentation';
import { cn } from '@/utils/cn';
import { unitsApi } from '../api';
import { BankScopeSelect } from '../components/BankScopeSelect';
import { ExpiryBadge } from '../components/ExpiryBadge';
import { StockGrid } from '../components/StockGrid';

const IN_INVENTORY = new Set<string>(EXPIRABLE_UNIT_STATUSES);

function Tile({
  label,
  value,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: number;
  tone?: 'warning' | 'critical';
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={onClick ? active : undefined}
      className={cn(
        'rounded-xl bg-white p-4 text-left shadow-sm ring-1 transition-shadow enabled:hover:shadow-md',
        active ? 'ring-2 ring-brand-500' : 'ring-slate-200',
      )}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums',
          tone === 'critical' && value
            ? 'text-red-700'
            : tone === 'warning' && value
              ? 'text-amber-700'
              : 'text-slate-900',
        )}
      >
        {value}
      </p>
    </button>
  );
}

export function InventoryPage() {
  const { user } = useAuth();
  const canManage = usePermission('inventory:manage');
  const ownBank = user?.profile?.kind === 'STAFF' ? user.profile.bloodBankId : '';
  const [bankId, setBankId] = useState(ownBank);
  const [page, setPage] = useState(1);
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | ''>('');
  const [componentType, setComponentType] = useState<ComponentType | ''>('');
  const [status, setStatus] = useState<UnitStatus | ''>('AVAILABLE');
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const unitCode = useDebouncedValue(codeInput.trim());

  const summary = useApiQuery(() => unitsApi.summary(bankId || undefined), [bankId]);
  const warningDays = summary.data?.expiryWarningDays ?? 3;

  const query: Partial<ListBloodUnitsQuery> = {
    page,
    limit: 20,
    sort: 'expiry',
    ...(bankId && { bloodBankId: bankId }),
    ...(bloodGroup && { bloodGroup }),
    ...(componentType && { componentType }),
    ...(status && { status }),
    ...(expiringOnly && { expiringWithinDays: warningDays }),
    ...(unitCode && { unitCode }),
  };
  const units = useApiQuery(() => unitsApi.list(query), [query]);

  const reset =
    <T,>(setter: (v: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };
  const byStatus = summary.data?.byStatus ?? {};

  return (
    <>
      <PageHeader
        title="Blood inventory"
        description="Usable stock excludes anything past its expiry date, even before it is marked expired."
        actions={
          <>
            <BankScopeSelect value={bankId} onChange={reset(setBankId)} />
            {canManage && (
              <ButtonLink to="/admin/donations/new" icon={<Plus className="size-4" aria-hidden />}>
                Record donation
              </ButtonLink>
            )}
          </>
        }
      />

      {summary.error && <ErrorState error={summary.error} onRetry={summary.refetch} />}
      {summary.data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Tile
              label="Available"
              value={byStatus.AVAILABLE ?? 0}
              active={status === 'AVAILABLE' && !expiringOnly}
              onClick={() => {
                reset(setStatus)('AVAILABLE');
                setExpiringOnly(false);
              }}
            />
            <Tile
              label={`Expiring within ${warningDays} days`}
              value={summary.data.expiringSoon}
              tone="warning"
              active={expiringOnly}
              onClick={() => {
                reset(setStatus)('AVAILABLE');
                setExpiringOnly(true);
              }}
            />
            <Tile
              label="Under testing"
              value={(byStatus.COLLECTED ?? 0) + (byStatus.UNDER_TESTING ?? 0)}
              active={status === 'UNDER_TESTING'}
              onClick={() => {
                reset(setStatus)('UNDER_TESTING');
                setExpiringOnly(false);
              }}
            />
            <Tile
              label="Reserved"
              value={byStatus.RESERVED ?? 0}
              active={status === 'RESERVED'}
              onClick={() => {
                reset(setStatus)('RESERVED');
                setExpiringOnly(false);
              }}
            />
            <Tile
              label="Expired — awaiting disposal"
              value={(byStatus.EXPIRED ?? 0) + summary.data.expiredAwaitingSweep}
              tone="critical"
              active={status === 'EXPIRED'}
              onClick={() => {
                reset(setStatus)('EXPIRED');
                setExpiringOnly(false);
              }}
            />
          </div>
          <Card>
            <CardHeader
              title="Usable stock"
              description="Available, in-date units by blood group and component."
            />
            <StockGrid summary={summary.data} />
          </Card>
        </>
      )}
      {summary.isLoading && <LoadingState label="Loading stock…" />}

      <Card>
        <CardHeader title="Units" description="Sorted by expiry — earliest first." />
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Unit code"
              aria-label="Search by unit code"
              className="pl-9"
              value={codeInput}
              onChange={(e) => reset(setCodeInput)(e.target.value)}
            />
          </div>
          <Select
            aria-label="Blood group"
            value={bloodGroup}
            onChange={(e) => reset(setBloodGroup)(e.target.value as BloodGroup | '')}
          >
            <option value="">All groups</option>
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Component"
            value={componentType}
            onChange={(e) => reset(setComponentType)(e.target.value as ComponentType | '')}
          >
            <option value="">All components</option>
            {COMPONENT_TYPES.map((c) => (
              <option key={c} value={c}>
                {COMPONENT_LABELS[c]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) => {
              reset(setStatus)(e.target.value as UnitStatus | '');
              setExpiringOnly(false);
            }}
          >
            <option value="">Any status</option>
            {UNIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {UNIT_STATUS_PRESENTATION[s].label}
              </option>
            ))}
          </Select>
        </div>
        {units.isLoading && <LoadingState label="Loading units…" />}
        {units.error && <ErrorState error={units.error} onRetry={units.refetch} />}
        {units.data && units.data.items.length === 0 && (
          <EmptyState title="No units match these filters" />
        )}
        {units.data && units.data.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Unit
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Group
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Component
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Expiry
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Location
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {units.data.items.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <Link
                          to={`/admin/inventory/units/${u.id}`}
                          className="font-mono text-xs font-medium text-slate-900 hover:text-brand-700 hover:underline"
                        >
                          {u.unitCode}
                        </Link>
                        {!bankId && <p className="text-xs text-slate-500">{u.bloodBank.code}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded-md bg-brand-50 px-2 py-0.5 font-bold text-brand-800">
                          {u.bloodGroup}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {COMPONENT_LABELS[u.componentType]}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge kind="unit" value={u.status} />
                      </td>
                      <td className="px-5 py-3">
                        <ExpiryBadge
                          expiryDate={u.expiryDate}
                          daysToExpiry={u.daysToExpiry}
                          expiredByDate={u.expiredByDate}
                          inInventory={IN_INVENTORY.has(u.status)}
                          warningDays={warningDays}
                        />
                      </td>
                      <td className="px-5 py-3 text-slate-600">{u.storageLocation ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={units.data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
