import { Link } from 'react-router';
import { COMPONENT_LABELS, OPEN_REQUEST_STATUSES, type BloodRequestSummary } from '@bbms/shared';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { cn } from '@/utils/cn';
import { RequiredBy } from './RequiredBy';

const OPEN = new Set<string>(OPEN_REQUEST_STATUSES);

interface RequestsTableProps {
  requests: BloodRequestSummary[];
  /** Base path for detail links, e.g. /admin/requests or /hospital/requests. */
  basePath: string;
  showHospital?: boolean;
}

export function RequestsTable({ requests, basePath, showHospital = false }: RequestsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th scope="col" className="px-5 py-3 font-medium">
              Request
            </th>
            {showHospital && (
              <th scope="col" className="px-5 py-3 font-medium">
                Hospital
              </th>
            )}
            <th scope="col" className="px-5 py-3 font-medium">
              Blood
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              Units
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              Urgency
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              Required by
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {requests.map((r) => {
            const open = OPEN.has(r.status);
            return (
              <tr
                key={r.id}
                className={cn(
                  'hover:bg-slate-50',
                  open && r.urgency === 'EMERGENCY' && 'bg-red-50/60 hover:bg-red-50',
                )}
              >
                <td
                  className={cn(
                    'border-l-4 px-5 py-3',
                    open && r.urgency === 'EMERGENCY' ? 'border-l-red-600' : 'border-l-transparent',
                  )}
                >
                  <Link
                    to={`${basePath}/${r.id}`}
                    className="font-mono text-xs font-medium text-slate-900 hover:text-brand-700 hover:underline"
                  >
                    {r.requestNumber}
                  </Link>
                </td>
                {showHospital && (
                  <td className="px-5 py-3 text-slate-700">
                    {r.hospital.name}
                    <p className="text-xs text-slate-500">{r.hospital.city}</p>
                  </td>
                )}
                <td className="px-5 py-3">
                  <span className="rounded-md bg-brand-50 px-2 py-0.5 font-bold text-brand-800">
                    {r.bloodGroup}
                  </span>
                  <p className="mt-1 text-xs text-slate-500">{COMPONENT_LABELS[r.componentType]}</p>
                </td>
                <td className="px-5 py-3 text-slate-700 tabular-nums">
                  {r.unitsAllocated > 0
                    ? `${r.unitsAllocated}/${r.unitsRequested}`
                    : r.unitsRequested}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge kind="urgency" value={r.urgency} />
                </td>
                <td className="px-5 py-3">
                  <RequiredBy iso={r.requiredBy} overdue={r.overdue} open={open} />
                </td>
                <td className="px-5 py-3">
                  <StatusBadge kind="request" value={r.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
