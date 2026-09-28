import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Construction, SearchX } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/States';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <EmptyState
        icon={<SearchX className="size-6" aria-hidden />}
        title="Page not found"
        description="The page you are looking for does not exist or has moved."
        action={<ButtonLink to="/">Back to home</ButtonLink>}
      />
    </div>
  );
}

/** Temporary target for routes whose feature is scheduled for a later phase. */
export function ComingSoonPage({ feature }: { feature: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <EmptyState
        icon={<Construction className="size-6" aria-hidden />}
        title={`${feature} is coming soon`}
        description="This part of the platform is under construction."
        action={
          <ButtonLink to="/" variant="secondary">
            Back to home
          </ButtonLink>
        }
      />
    </div>
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;

  return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <ErrorState
        title="This page failed to load"
        error={error instanceof Error ? error : undefined}
        onRetry={() => window.location.reload()}
      />
    </div>
  );
}
