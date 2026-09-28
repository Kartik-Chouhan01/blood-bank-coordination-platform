import { useId, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { DonorStaffSummary } from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Input } from '@/components/ui/FormField';
import { BloodGroupPill } from '@/components/domain/BloodGroupPill';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { donorStaffApi } from '@/features/donor/api';
import { formatDate } from '@/utils/format';

interface DonorPickerProps {
  value: DonorStaffSummary | null;
  onChange: (donor: DonorStaffSummary | null) => void;
  error?: string | undefined;
}

/** Search-as-you-type donor selection (staff view: no contact details). */
export function DonorPicker({ value, onChange, error }: DonorPickerProps) {
  const [term, setTerm] = useState('');
  const search = useDebouncedValue(term.trim());
  const inputId = useId();
  const results = useApiQuery(
    () => (search.length >= 2 ? donorStaffApi.list({ search, limit: 8 }) : Promise.resolve(null)),
    [search],
  );

  if (value) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <div>
          <p className="font-medium text-slate-900">{value.name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-slate-600">
            <BloodGroupPill bloodGroup={value.bloodGroup} confirmed={value.bloodGroupConfirmed} />
            <span>
              Age {value.age} · {value.area}, {value.city}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Last recorded donation: {formatDate(value.lastDonationAt, 'none')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-200"
          aria-label="Change donor"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
        Donor
        <span className="ml-0.5 text-brand-700" aria-hidden>
          *
        </span>
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <Input
          id={inputId}
          type="search"
          placeholder="Type at least 2 letters of the donor's name"
          className="pl-9"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          invalid={!!error}
        />
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
      {results.data && (
        <ul
          className="divide-y divide-slate-100 rounded-lg border border-slate-200"
          aria-label="Matching donors"
        >
          {results.data.items.length === 0 && (
            <li className="p-3 text-sm text-slate-500">No donors found.</li>
          )}
          {results.data.items.map((donor) => {
            const blocked =
              donor.verificationStatus === 'REJECTED' || donor.verificationStatus === 'SUSPENDED';
            return (
              <li key={donor.id}>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => onChange(donor)}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>
                    <span className="font-medium text-slate-900">{donor.name}</span>
                    <span className="block text-xs text-slate-500">
                      {donor.area}, {donor.city} · age {donor.age}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <BloodGroupPill bloodGroup={donor.bloodGroup} />
                    {blocked && (
                      <StatusBadge kind="verification" value={donor.verificationStatus} />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
