import { useState } from 'react';
import { Plus, Send } from 'lucide-react';
import { useApiQuery } from '@/hooks/useApiQuery';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { cn } from '@/utils/cn';
import { requestsApi } from '../api';
import { RequestsTable } from '../components/RequestsTable';

type Tab = 'open' | 'closed';

export function HospitalRequestsPage() {
  const [tab, setTab] = useState<Tab>('open');
  const [page, setPage] = useState(1);
  const query = {
    page,
    limit: 20,
    state: tab,
    sort: tab === 'open' ? 'priority' : 'newest',
  } as const;
  const { data, error, isLoading, refetch } = useApiQuery(() => requestsApi.mine(query), [query]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Blood requests"
        description="Track every request from review to receipt."
        actions={
          <ButtonLink to="/hospital/requests/new" icon={<Plus className="size-4" aria-hidden />}>
            New request
          </ButtonLink>
        }
      />
      <Card>
        <div
          role="tablist"
          aria-label="Request list"
          className="flex gap-1 border-b border-slate-100 px-4 pt-3"
        >
          {(['open', 'closed'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => switchTab(t)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
                tab === t
                  ? 'border-brand-600 text-brand-800'
                  : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              {t === 'open' ? 'Active' : 'History'}
            </button>
          ))}
        </div>
        {isLoading && <LoadingState />}
        {error && <ErrorState error={error} onRetry={refetch} />}
        {data && data.items.length === 0 && (
          <EmptyState
            icon={<Send className="size-6" aria-hidden />}
            title={tab === 'open' ? 'No active requests' : 'No past requests'}
            action={
              tab === 'open' && (
                <ButtonLink to="/hospital/requests/new" variant="secondary">
                  Raise a request
                </ButtonLink>
              )
            }
          />
        )}
        {data && data.items.length > 0 && (
          <>
            <RequestsTable requests={data.items} basePath="/hospital/requests" />
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
