import {
  BLOOD_GROUPS,
  COMPONENT_LABELS,
  COMPONENT_TYPES,
  type InventorySummary,
} from '@bbms/shared';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/utils/cn';

/** Usable stock (available and in date) by blood group × component. */
export function StockGrid({ summary }: { summary: InventorySummary }) {
  const count = (group: string, component: string) =>
    summary.available.find((row) => row.bloodGroup === group && row.componentType === component)
      ?.units ?? 0;
  const totalFor = (group: string) => COMPONENT_TYPES.reduce((sum, c) => sum + count(group, c), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-center text-sm">
        <caption className="sr-only">Available units by blood group and component</caption>
        <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th scope="col" className="px-4 py-3 text-left font-medium">
              Group
            </th>
            {COMPONENT_TYPES.map((c) => (
              <th key={c} scope="col" className="px-4 py-3 font-medium" title={COMPONENT_LABELS[c]}>
                {c === 'WHOLE_BLOOD' ? 'Whole' : c}
              </th>
            ))}
            <th scope="col" className="px-4 py-3 font-medium">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {BLOOD_GROUPS.map((group) => {
            const total = totalFor(group);
            return (
              <tr key={group}>
                <th scope="row" className="px-4 py-2.5 text-left">
                  <span className="rounded-md bg-brand-50 px-2 py-0.5 font-bold text-brand-800">
                    {group}
                  </span>
                </th>
                {COMPONENT_TYPES.map((c) => {
                  const n = count(group, c);
                  return (
                    <td
                      key={c}
                      className={cn(
                        'px-4 py-2.5 tabular-nums',
                        n === 0 ? 'text-slate-300' : 'font-medium text-slate-900',
                      )}
                    >
                      {n}
                    </td>
                  );
                })}
                <td
                  className={cn(
                    'px-4 py-2.5 font-semibold tabular-nums',
                    total === 0 ? 'text-red-700' : 'text-slate-900',
                  )}
                >
                  {total === 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <TriangleAlert className="size-3.5" aria-hidden />0
                      <span className="sr-only">(no usable stock)</span>
                    </span>
                  ) : (
                    total
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
