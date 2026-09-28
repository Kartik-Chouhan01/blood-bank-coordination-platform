import { useState } from 'react';
import { Link } from 'react-router';
import { Search } from 'lucide-react';
import {
  AVAILABILITY_STATUSES,
  BLOOD_GROUPS,
  VERIFICATION_STATUSES,
  type AvailabilityStatus,
  type BloodGroup,
  type ListDonorsQuery,
  type VerificationStatus,
} from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/fields';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { BloodGroupPill } from '@/components/domain/BloodGroupPill';
import { StatusBadge } from '@/components/domain/StatusBadge';
import {
  AVAILABILITY_PRESENTATION,
  VERIFICATION_PRESENTATION,
} from '@/constants/statusPresentation';
import { formatDate } from '@/utils/format';
import { donorStaffApi } from '@/features/donor/api';

interface Filters {
  bloodGroup: BloodGroup | '';
  availability: AvailabilityStatus | '';
  verificationStatus: VerificationStatus | '';
  city: string;
  search: string;
}

const EMPTY_FILTERS: Filters = {
  bloodGroup: '',
  availability: '',
  verificationStatus: '',
  city: '',
  search: '',
};

export function DonorsPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(filters.search.trim());
  const city = useDebouncedValue(filters.city.trim());

  const query: Partial<ListDonorsQuery> = {
    page,
    limit: 20,
    ...(filters.bloodGroup && { bloodGroup: filters.bloodGroup }),
    ...(filters.availability && { availability: filters.availability }),
    ...(filters.verificationStatus && { verificationStatus: filters.verificationStatus }),
    ...(city && { city }),
    ...(search && { search }),
  };
  const { data, error, isLoading, refetch } = useApiQuery(() => donorStaffApi.list(query), [query]);

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <>
      <PageHeader
        title="Donors"
        description="Contact details are hidden here; they are shared only when a donor agrees to help with a request."
      />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Search by name"
              aria-label="Search donors by name"
              className="pl-9"
              value={filters.search}
              onChange={(e) => update('search', e.target.value)}
            />
          </div>
          <Select
            aria-label="Blood group"
            value={filters.bloodGroup}
            onChange={(e) => update('bloodGroup', e.target.value as BloodGroup | '')}
          >
            <option value="">All groups</option>
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Availability"
            value={filters.availability}
            onChange={(e) => update('availability', e.target.value as AvailabilityStatus | '')}
          >
            <option value="">Any availability</option>
            {AVAILABILITY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {AVAILABILITY_PRESENTATION[s].label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Verification"
            value={filters.verificationStatus}
            onChange={(e) =>
              update('verificationStatus', e.target.value as VerificationStatus | '')
            }
          >
            <option value="">Any verification</option>
            {VERIFICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {VERIFICATION_PRESENTATION[s].label}
              </option>
            ))}
          </Select>
          <Input
            placeholder="City"
            aria-label="City"
            value={filters.city}
            onChange={(e) => update('city', e.target.value)}
          />
        </div>

        {isLoading && <LoadingState label="Loading donors…" />}
        {error && <ErrorState error={error} onRetry={refetch} />}
        {data && data.items.length === 0 && (
          <EmptyState
            title="No donors match"
            description={
              hasFilters ? 'Try removing a filter.' : 'Donors appear here once they register.'
            }
          />
        )}
        {data && data.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Donor
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Blood group
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Area
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Availability
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Verification
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Last donation
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <Link
                          to={`/admin/donors/${d.id}`}
                          className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                        >
                          {d.name}
                        </Link>
                        <p className="text-xs text-slate-500">Age {d.age}</p>
                      </td>
                      <td className="px-5 py-3">
                        <BloodGroupPill
                          bloodGroup={d.bloodGroup}
                          confirmed={d.bloodGroupConfirmed}
                        />
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {d.area}, {d.city}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge kind="availability" value={d.effectiveAvailability} />
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge kind="verification" value={d.verificationStatus} />
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {formatDate(d.lastDonationAt, 'Never')}
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
