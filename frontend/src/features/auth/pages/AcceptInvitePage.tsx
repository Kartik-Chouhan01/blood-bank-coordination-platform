import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { PASSWORD_RULES_TEXT } from '@bbms/shared';
import { useAuth } from '@/hooks/useAuth';
import { homePathFor } from '@/constants/navigation';
import { AuthCard } from '@/layouts/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PasswordField } from '@/components/ui/fields';
import { applyServerErrors } from '@/utils/formErrors';
import { authApi } from '../api';
import { readHashToken, stripHashFromUrl } from '../hashToken';
import { resetPasswordFormSchema } from '../schemas';

type Values = z.output<typeof resetPasswordFormSchema>;

export function AcceptInvitePage() {
  const { applySession } = useAuth();
  const navigate = useNavigate();
  const [token] = useState(readHashToken);
  const [formError, setFormError] = useState<string>();
  const form = useForm({ resolver: zodResolver(resetPasswordFormSchema) });
  const { errors, isSubmitting } = form.formState;

  useEffect(stripHashFromUrl, []);

  const onSubmit = async (values: Values) => {
    setFormError(undefined);
    try {
      const session = await authApi.acceptInvite({ token: token!, password: values.password });
      applySession(session);
      navigate(homePathFor(session.user.role), { replace: true });
    } catch (err) {
      setFormError(applyServerErrors(err, form.setError, ['password']));
    }
  };

  if (!token) {
    return (
      <AuthCard title="Accept invitation">
        <Alert tone="error">
          This invitation link is incomplete. Ask your administrator to resend it, or use “Forgot
          password” on the sign-in page to get a new invitation.
        </Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Welcome aboard"
      description="Choose a password to activate your staff account."
    >
      {formError && (
        <Alert tone="error" className="mb-5">
          {formError}
        </Alert>
      )}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <PasswordField
          label="Password"
          autoComplete="new-password"
          required
          registration={form.register('password')}
          error={errors.password?.message}
          hint={PASSWORD_RULES_TEXT}
        />
        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          required
          registration={form.register('confirmPassword')}
          error={errors.confirmPassword?.message}
        />
        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          Activate account
        </Button>
      </form>
    </AuthCard>
  );
}
