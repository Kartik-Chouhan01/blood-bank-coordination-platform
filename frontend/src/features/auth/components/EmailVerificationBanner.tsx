import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { toApiClientError } from '@/services/apiError';
import { authApi } from '../api';

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string>();

  if (!user || user.emailVerified) return null;

  const resend = async () => {
    setState('sending');
    try {
      await authApi.resendVerification();
      setState('sent');
    } catch (err) {
      setError(toApiClientError(err).message);
      setState('error');
    }
  };

  return (
    <Alert
      tone="warning"
      title="Please confirm your email address"
      action={
        state !== 'sent' && (
          <Button variant="secondary" size="sm" onClick={resend} isLoading={state === 'sending'}>
            Resend link
          </Button>
        )
      }
    >
      {state === 'sent'
        ? `A new link was sent to ${user.email}.`
        : state === 'error'
          ? error
          : `We sent a confirmation link to ${user.email}. Some notifications need a confirmed address.`}
    </Alert>
  );
}
