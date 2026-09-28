import { useApiQuery } from '@/hooks/useApiQuery';
import { Select } from '@/components/ui/fields';
import { bloodBanksApi } from '@/features/organisations/api';

/** Chooses which blood bank's inventory to show ("" = all banks). */
export function BankScopeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { data } = useApiQuery(() => bloodBanksApi.list({ limit: 100 }));
  return (
    <Select
      aria-label="Blood bank"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="sm:w-64"
    >
      <option value="">All blood banks</option>
      {(data?.items ?? []).map((bank) => (
        <option key={bank.id} value={bank.id}>
          {bank.name} ({bank.code})
        </option>
      ))}
    </Select>
  );
}
