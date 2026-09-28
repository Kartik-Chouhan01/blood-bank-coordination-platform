import { useEffect, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { homePathFor } from '@/constants/navigation';
import { AuthCard } from '@/layouts/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { ButtonLink } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/States';
import { toApiClientError } from '@/services/apiError';
import { authApi } from '../api';
import { readHashToken, stripHashFromUrl } from '../hashToken';

// Tokens are single-use: share one request per token even if the effect runs twice (StrictMode).
const verifications = new Map<string, Promise<null>>();

type State = { status: 'verifying' } | { status: 'done' } | { status: 'error'; message: string };

export function VerifyEmailPage() {
  const { status: authStatus, user, refreshUser } = useAuth();
  const [token] = useState(readHashToken);
  const [state, setState] = useState<State>(
    token
      ? { status: 'verifying' }
      : { status: 'error', message: 'This verification link is incomplete.' },
  );

  useEffect(() => {
    stripHashFromUrl();
    if (!token) return;
    if (!verifications.has(token)) verifications.set(token, authApi.verifyEmail(token));
    verifications
      .get(token)!
      .then(() => setState({ status: 'done' }))
      .catch((err: unknown) =>
        setState({ status: 'error', message: toApiClientError(err).message }),
      );
  }, [token]);

  useEffect(() => {
    if (state.status === 'done' && authStatus === 'authenticated')
      void refreshUser().catch(() => undefined);
    // Refresh the signed-in user's "verified" flag once, after success.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, authStatus]);

  const next = user
    ? { to: homePathFor(user.role), label: 'Go to my dashboard' }
    : { to: '/login', label: 'Sign in' };

  return (
    <AuthCard title="Email verification">
      {state.status === 'verifying' && <LoadingState label="Confirming your email address…" />}
      {state.status === 'done' && (
        <div className="space-y-5 text-center">
          <CircleCheck className="mx-auto size-12 text-emerald-600" aria-hidden />
          <p className="text-slate-700">Your email address is confirmed. Thank you!</p>
          <ButtonLink to={next.to}>{next.label}</ButtonLink>
        </div>
      )}
      {state.status === 'error' && (
        <div className="space-y-5">
          <Alert tone="error" title="We couldn't verify your email">
            {state.message} You can request a new link from your dashboard after signing in.
          </Alert>
          <ButtonLink to={next.to} variant="secondary">
            {next.label}
          </ButtonLink>
        </div>
      )}
    </AuthCard>
  );
}
