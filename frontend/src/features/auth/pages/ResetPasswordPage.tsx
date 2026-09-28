import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { PASSWORD_RULES_TEXT } from '@bbms/shared';
import { AuthCard } from '@/layouts/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { PasswordField } from '@/components/ui/fields';
import { applyServerErrors } from '@/utils/formErrors';
import { authApi } from '../api';
import { readHashToken, stripHashFromUrl } from '../hashToken';
import { resetPasswordFormSchema } from '../schemas';

type FormValues = z.output<typeof resetPasswordFormSchema>;

export function ResetPasswordPage() {
  const [token] = useState(readHashToken);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string>();
  const form = useForm({ resolver: zodResolver(resetPasswordFormSchema) });
  const { errors, isSubmitting } = form.formState;

  useEffect(stripHashFromUrl, []);

  const onSubmit = async (values: FormValues) => {
    setFormError(undefined);
    try {
      await authApi.resetPassword({ token: token!, password: values.password });
      setDone(true);
    } catch (err) {
      setFormError(applyServerErrors(err, form.setError, ['password']));
    }
  };

  if (!token) {
    return (
      <AuthCard title="Reset your password">
        <Alert tone="error">This reset link is incomplete. Request a new one.</Alert>
        <ButtonLink to="/forgot-password" variant="secondary" className="mt-5">
          Request a new link
        </ButtonLink>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Password updated">
        <Alert tone="success">
          Your password has been changed and you were signed out of all devices.
        </Alert>
        <ButtonLink to="/login" className="mt-5">
          Sign in
        </ButtonLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      {formError && (
        <Alert tone="error" className="mb-5">
          {formError}{' '}
          <Link to="/forgot-password" className="font-medium underline">
            Request a new link
          </Link>
        </Alert>
      )}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <PasswordField
          label="New password"
          autoComplete="new-password"
          required
          registration={form.register('password')}
          error={errors.password?.message}
          hint={PASSWORD_RULES_TEXT}
        />
        <PasswordField
          label="Confirm new password"
          autoComplete="new-password"
          required
          registration={form.register('confirmPassword')}
          error={errors.confirmPassword?.message}
        />
        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
