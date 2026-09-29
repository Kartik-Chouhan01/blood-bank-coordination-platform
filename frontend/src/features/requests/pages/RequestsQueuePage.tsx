import { useState } from 'react';
import {
  BLOOD_GROUPS,
  REQUEST_STATUSES,
  URGENCY_LEVELS,
  type BloodGroup,
  type ListRequestsQuery,
  type RequestStatus,
  type Urgency,
} from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/fields';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { REQUEST_STATUS_PRESENTATION, URGENCY_PRESENTATION } from '@/constants/statusPresentation';
import { cn } from '@/utils/cn';
import { requestsApi } from '../api';
import { RequestsTable } from '../components/RequestsTable';

type Preset = 'open' | 'pending' | 'emergency' | 'overdue' | 'all';

function Tile({
  label,
  value,
  active,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  tone?: 'critical' | 'warning';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-xl bg-white p-4 text-left shadow-sm ring-1 hover:shadow-md',
        active ? 'ring-2 ring-brand-500' : 'ring-slate-200',
      )}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums',
          value && tone === 'critical'
            ? 'text-red-700'
            : value && tone === 'warning'
              ? 'text-amber-700'
              : 'text-slate-900',
        )}
      >
        {value}
      </p>
    </button>
  );
}

export function RequestsQueuePage() {
  const [preset, setPreset] = useState<Preset>('open');
  const [status, setStatus] = useState<RequestStatus | ''>('');
  const [urgency, setUrgency] = useState<Urgency | ''>('');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | ''>('');
  const [page, setPage] = useState(1);
  const stats = useApiQuery(requestsApi.stats);

  const query: Partial<ListRequestsQuery> = {
    page,
    limit: 20,
    sort: 'priority',
    ...(preset === 'open' && { state: 'open' }),
    ...(preset === 'pending' && { status: 'PENDING' }),
    ...(preset === 'emergency' && { state: 'open', urgency: 'EMERGENCY' }),
    ...(preset === 'overdue' && { overdue: 'true' }),
    ...(preset === 'all' && { sort: 'newest' }),
    ...(status && { status }),
    ...(urgency && { urgency }),
    ...(bloodGroup && { bloodGroup }),
  };
  const { data, error, isLoading, refetch } = useApiQuery(() => requestsApi.list(query), [query]);

  const choose = (next: Preset) => {
    setPreset(next);
    setStatus('');
    setUrgency('');
    setPage(1);
  };
  const s = stats.data;

  return (
    <>
      <PageHeader
        title="Blood requests"
        description="Emergency first, then earliest required-by. Urgency is as declared by the hospital."
      />
      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile
            label="Open"
            value={s.open}
            active={preset === 'open'}
            onClick={() => choose('open')}
          />
          <Tile
            label="Awaiting review"
            value={s.pendingReview}
            tone="warning"
            active={preset === 'pending'}
            onClick={() => choose('pending')}
          />
          <Tile
            label="Open emergencies"
            value={s.openEmergency}
            tone="critical"
            active={preset === 'emergency'}
            onClick={() => choose('emergency')}
          />
          <Tile
            label="Overdue"
            value={s.overdue}
            tone="critical"
            active={preset === 'overdue'}
            onClick={() => choose('overdue')}
          />
        </div>
      )}
      <Card>
        <div className="grid items-center gap-3 border-b border-slate-100 p-4 md:grid-cols-4">
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as RequestStatus | '');
              setPreset('all');
              setPage(1);
            }}
          >
            <option value="">Any status</option>
            {REQUEST_STATUSES.map((x) => (
              <option key={x} value={x}>
                {REQUEST_STATUS_PRESENTATION[x].label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Urgency"
            value={urgency}
            onChange={(e) => {
              setUrgency(e.target.value as Urgency | '');
              setPage(1);
            }}
          >
            <option value="">Any urgency</option>
            {URGENCY_LEVELS.map((x) => (
              <option key={x} value={x}>
                {URGENCY_PRESENTATION[x].label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Blood group"
            value={bloodGroup}
            onChange={(e) => {
              setBloodGroup(e.target.value as BloodGroup | '');
              setPage(1);
            }}
          >
            <option value="">All groups</option>
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={() => {
              choose('all');
              setBloodGroup('');
            }}
            className={cn(
              'h-10 rounded-lg px-3 text-sm font-medium',
              preset === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            All requests
          </button>
        </div>
        {isLoading && <LoadingState label="Loading requests…" />}
        {error && <ErrorState error={error} onRetry={refetch} />}
        {data && data.items.length === 0 && (
          <EmptyState title="No requests here" description="Nothing matches this view right now." />
        )}
        {data && data.items.length > 0 && (
          <>
            <RequestsTable requests={data.items} basePath="/admin/requests" showHospital />
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
