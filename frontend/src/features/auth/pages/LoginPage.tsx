import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@bbms/shared';
import { useAuth } from '@/hooks/useAuth';
import { AuthCard } from '@/layouts/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PasswordField, TextField } from '@/components/ui/fields';
import { applyServerErrors } from '@/utils/formErrors';
import type { LoginRedirectState } from '@/routes/guards';

export function LoginPage() {
  const { login } = useAuth();
  const redirect = (useLocation().state ?? {}) as LoginRedirectState;
  const [formError, setFormError] = useState<string>();

  const form = useForm({ resolver: zodResolver(loginSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = async (values: LoginInput) => {
    setFormError(undefined);
    try {
      // <GuestOnly> redirects once the session is established.
      await login(values);
    } catch (err) {
      setFormError(applyServerErrors(err, form.setError, ['email', 'password']));
    }
  };

  return (
    <AuthCard title="Sign in" description="Welcome back. Sign in to continue.">
      {redirect.reason === 'expired' && !formError && (
        <Alert tone="info" className="mb-5">
          Your session has ended. Please sign in again.
        </Alert>
      )}
      {formError && (
        <Alert tone="error" className="mb-5">
          {formError}
        </Alert>
      )}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          registration={form.register('email')}
          error={errors.email?.message}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          required
          registration={form.register('password')}
          error={errors.password?.message}
        />
        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        New here?{' '}
        <Link to="/register" className="font-medium text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}
