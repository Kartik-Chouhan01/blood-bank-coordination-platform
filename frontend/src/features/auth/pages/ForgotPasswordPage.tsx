import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@bbms/shared';
import { AuthCard } from '@/layouts/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/fields';
import { applyServerErrors } from '@/utils/formErrors';
import { authApi } from '../api';

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const form = useForm({ resolver: zodResolver(forgotPasswordSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = async (values: ForgotPasswordInput) => {
    setFormError(undefined);
    try {
      await authApi.forgotPassword(values);
      setSentTo(values.email);
    } catch (err) {
      setFormError(applyServerErrors(err, form.setError, ['email']));
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your account email and we'll send you a reset link."
    >
      {sentTo ? (
        <Alert tone="success" title="Check your inbox">
          If an account exists for {sentTo}, a reset link is on its way. It expires in 30 minutes.
        </Alert>
      ) : (
        <>
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
            <Button type="submit" className="w-full" isLoading={isSubmitting}>
              Send reset link
            </Button>
          </form>
        </>
      )}
      <p className="mt-6 text-center text-sm text-slate-600">
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
