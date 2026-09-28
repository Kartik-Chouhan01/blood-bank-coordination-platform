import { useState } from 'react';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { TESTING_STATUSES, type ListDonationsQuery, type TestingStatus } from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useAuth, usePermission } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/fields';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { formatDateTime } from '@/utils/format';
import { donationsApi } from '../api';
import { BankScopeSelect } from '../components/BankScopeSelect';

const LABEL: Record<TestingStatus, string> = {
  PENDING: 'Awaiting result',
  PASSED: 'Passed',
  FAILED: 'Failed',
};
const TONE = { PENDING: 'warning', PASSED: 'success', FAILED: 'critical' } as const;

export function DonationsPage() {
  const { user } = useAuth();
  const canManage = usePermission('inventory:manage');
  const [bankId, setBankId] = useState(
    user?.profile?.kind === 'STAFF' ? user.profile.bloodBankId : '',
  );
  const [testingStatus, setTestingStatus] = useState<TestingStatus | ''>('');
  const [page, setPage] = useState(1);

  const query: Partial<ListDonationsQuery> = {
    page,
    limit: 20,
    ...(bankId && { bloodBankId: bankId }),
    ...(testingStatus && { testingStatus }),
  };
  const { data, error, isLoading, refetch } = useApiQuery(() => donationsApi.list(query), [query]);

  return (
    <>
      <PageHeader
        title="Donations"
        description="Collections and their testing progress."
        actions={
          <>
            <BankScopeSelect
              value={bankId}
              onChange={(v) => {
                setBankId(v);
                setPage(1);
              }}
            />
            <Select
              aria-label="Testing status"
              value={testingStatus}
              onChange={(e) => {
                setTestingStatus(e.target.value as TestingStatus | '');
                setPage(1);
              }}
              className="sm:w-48"
            >
              <option value="">Any testing status</option>
              {TESTING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LABEL[s]}
                </option>
              ))}
            </Select>
            {canManage && (
              <ButtonLink to="/admin/donations/new" icon={<Plus className="size-4" aria-hidden />}>
                Record donation
              </ButtonLink>
            )}
          </>
        }
      />
      <Card>
        {isLoading && <LoadingState />}
        {error && <ErrorState error={error} onRetry={refetch} />}
        {data && data.items.length === 0 && <EmptyState title="No donations recorded" />}
        {data && data.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Collected
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Donor
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Blood bank
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Units
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Testing
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <Link
                          className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                          to={`/admin/donations/${d.id}`}
                        >
                          {formatDateTime(d.collectedAt)}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{d.donor.name}</td>
                      <td className="px-5 py-3 text-slate-700">{d.bloodBank.code}</td>
                      <td className="px-5 py-3 text-slate-700">{d.unitCount}</td>
                      <td className="px-5 py-3">
                        <Badge tone={TONE[d.testingStatus]}>{LABEL[d.testingStatus]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
