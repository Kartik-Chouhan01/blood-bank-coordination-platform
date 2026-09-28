import { useState } from 'react';
import { Link } from 'react-router';
import { Search } from 'lucide-react';
import {
  VERIFICATION_STATUSES,
  type ListHospitalsQuery,
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
import { StatusBadge } from '@/components/domain/StatusBadge';
import { VERIFICATION_PRESENTATION } from '@/constants/statusPresentation';
import { formatDate } from '@/utils/format';
import { hospitalsApi } from '@/features/organisations/api';

export function HospitalsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<VerificationStatus | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [cityInput, setCityInput] = useState('');
  const search = useDebouncedValue(searchInput.trim());
  const city = useDebouncedValue(cityInput.trim());

  const query: Partial<ListHospitalsQuery> = {
    page,
    limit: 20,
    ...(status && { verificationStatus: status }),
    ...(search && { search }),
    ...(city && { city }),
  };
  const { data, error, isLoading, refetch } = useApiQuery(() => hospitalsApi.list(query), [query]);
  const reset =
    <T,>(setter: (v: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  return (
    <>
      <PageHeader
        title="Hospitals"
        description="Hospitals awaiting verification are listed first."
      />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[2fr_1fr_1fr]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Search name or registration number"
              aria-label="Search hospitals"
              className="pl-9"
              value={searchInput}
              onChange={(e) => reset(setSearchInput)(e.target.value)}
            />
          </div>
          <Select
            aria-label="Verification status"
            value={status}
            onChange={(e) => reset(setStatus)(e.target.value as VerificationStatus | '')}
          >
            <option value="">Any status</option>
            {VERIFICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {VERIFICATION_PRESENTATION[s].label}
              </option>
            ))}
          </Select>
          <Input
            placeholder="City"
            aria-label="City"
            value={cityInput}
            onChange={(e) => reset(setCityInput)(e.target.value)}
          />
        </div>
        {isLoading && <LoadingState label="Loading hospitals…" />}
        {error && <ErrorState error={error} onRetry={refetch} />}
        {data && data.items.length === 0 && <EmptyState title="No hospitals found" />}
        {data && data.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Hospital
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Location
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Contact
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Verification
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Registered
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <Link
                          to={`/admin/hospitals/${h.id}`}
                          className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                        >
                          {h.name}
                        </Link>
                        <p className="text-xs text-slate-500">{h.registrationNumber}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {h.city}, {h.state}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {h.contact.name}
                        <p className="text-xs text-slate-500">{h.contact.email}</p>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge kind="verification" value={h.verificationStatus} />
                      </td>
                      <td className="px-5 py-3 text-slate-600">{formatDate(h.registeredAt)}</td>
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
