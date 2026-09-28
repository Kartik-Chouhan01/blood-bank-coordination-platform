import type { ReactNode } from 'react';
import { CircleAlert, Inbox, LoaderCircle, WifiOff } from 'lucide-react';
import type { ApiClientError } from '@/services/apiError';
import { Button } from './Button';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"
    >
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-500">
        {icon ?? <Inbox className="size-6" aria-hidden />}
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  error?: ApiClientError | Error;
  title?: string;
  onRetry?: () => void;
}

export function ErrorState({ error, title = 'Something went wrong', onRetry }: ErrorStateProps) {
  const isNetwork = error && 'isNetworkError' in error && error.isNetworkError;
  const requestId = error && 'requestId' in error ? error.requestId : undefined;

  return (
    <div role="alert" className="flex flex-col items-center py-12 text-center">
      <div className="mb-3 rounded-full bg-red-50 p-3 text-red-700">
        {isNetwork ? (
          <WifiOff className="size-6" aria-hidden />
        ) : (
          <CircleAlert className="size-6" aria-hidden />
        )}
      </div>
      <h3 className="text-sm font-semibold text-slate-900">
        {isNetwork ? 'Connection problem' : title}
      </h3>
      {error?.message && <p className="mt-1 max-w-sm text-sm text-slate-600">{error.message}</p>}
      {requestId && <p className="mt-2 text-xs text-slate-400">Reference: {requestId}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
