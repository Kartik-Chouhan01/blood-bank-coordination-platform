import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { hasPermission, type Permission } from '@bbms/shared';
import { ShieldX } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { homePathFor } from '@/constants/navigation';
import { LoadingState, EmptyState } from '@/components/ui/States';
import { ButtonLink } from '@/components/ui/Button';

function FullPageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingState label="Restoring your session…" />
    </div>
  );
}

export interface LoginRedirectState {
  from?: string;
  reason?: 'expired';
}

/** Signed-in users only; everyone else is sent to /login and returned afterwards. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status, sessionExpired } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoading />;
  if (status === 'anonymous') {
    const state: LoginRedirectState = {
      from: location.pathname + location.search,
      ...(sessionExpired && { reason: 'expired' }),
    };
    return <Navigate to="/login" replace state={state} />;
  }
  return children ?? <Outlet />;
}

/** Hides pages a role cannot use. The API independently rejects the underlying calls. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children?: ReactNode;
}) {
  const { user } = useAuth();
  if (!hasPermission(user?.role, permission)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <EmptyState
          icon={<ShieldX className="size-6" aria-hidden />}
          title="You don't have access to this page"
          description="Your account role does not include this area of the platform."
          action={user && <ButtonLink to={homePathFor(user.role)}>Go to my dashboard</ButtonLink>}
        />
      </div>
    );
  }
  return children ?? <Outlet />;
}

/**
 * Login/registration pages. Once a session exists (including right after signing in), this is
 * the single place that redirects: back to the page the user originally asked for, or home.
 */
export function GuestOnly({ children }: { children?: ReactNode }) {
  const { status, user } = useAuth();
  const redirect = (useLocation().state ?? {}) as LoginRedirectState;
  if (status === 'loading') return <FullPageLoading />;
  if (status === 'authenticated' && user) {
    return <Navigate to={redirect.from ?? homePathFor(user.role)} replace />;
  }
  return children ?? <Outlet />;
}
