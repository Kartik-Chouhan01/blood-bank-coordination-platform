import { useEffect, useState } from 'react';
import { BellOff, CheckCheck } from 'lucide-react';
import type { NotificationView } from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { toApiClientError } from '@/services/apiError';
import { cn } from '@/utils/cn';
import { announceNotificationsChanged, notificationsApi, onNotificationsChanged } from '../api';
import { NotificationItem } from '../components/NotificationItem';

type View = 'all' | 'unread';

export function NotificationsPage() {
  const [view, setView] = useState<View>('all');
  const [page, setPage] = useState(1);
  const { data, error, isLoading, refetch, setData } = useApiQuery(
    () => notificationsApi.list({ page, limit: 20, ...(view === 'unread' && { unread: 'true' }) }),
    [view, page],
  );
  const [failure, setFailure] = useState<string>();

  // Reflect reads made from the header bell.
  useEffect(() => onNotificationsChanged(refetch), [refetch]);

  const markRead = (n: NotificationView) => {
    if (n.readAt || !data) return;
    const readAt = new Date().toISOString();
    setData({ ...data, items: data.items.map((i) => (i.id === n.id ? { ...i, readAt } : i)) });
    notificationsApi
      .markRead(n.id)
      .then(announceNotificationsChanged)
      .catch(() => undefined);
  };

  const markAll = async () => {
    setFailure(undefined);
    try {
      await notificationsApi.markAllRead();
      announceNotificationsChanged();
    } catch (err) {
      setFailure(toApiClientError(err).message);
    }
  };

  const tab = (value: View, label: string) => (
    <button
      type="button"
      aria-pressed={view === value}
      onClick={() => {
        setView(value);
        setPage(1);
      }}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium',
        view === value
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-600 hover:text-slate-900',
      )}
    >
      {label}
    </button>
  );

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates about requests, units and donors that need your attention."
        actions={
          <Button
            variant="secondary"
            icon={<CheckCheck className="size-4" aria-hidden />}
            onClick={() => void markAll()}
          >
            Mark all as read
          </Button>
        }
      />
      {failure && <Alert tone="error">{failure}</Alert>}
      <div role="group" aria-label="Show" className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
        {tab('all', 'All')}
        {tab('unread', 'Unread')}
      </div>
      <Card>
        {isLoading ? (
          <LoadingState />
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={<BellOff className="size-6" aria-hidden />}
            title={view === 'unread' ? 'Nothing unread' : 'No notifications yet'}
            description="Updates about your requests and tasks will appear here."
          />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {data.items.map((n) => (
                <li key={n.id}>
                  <NotificationItem notification={n} onOpen={markRead} />
                </li>
              ))}
            </ul>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
