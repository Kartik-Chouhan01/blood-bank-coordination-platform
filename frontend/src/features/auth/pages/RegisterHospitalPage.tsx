import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { PASSWORD_RULES_TEXT } from '@bbms/shared';
import { useAuth } from '@/hooks/useAuth';
import { AuthCard } from '@/layouts/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PasswordField, TextField } from '@/components/ui/fields';
import { applyServerErrors } from '@/utils/formErrors';
import { ConsentField } from '../components/ConsentField';
import { registerHospitalFormSchema, withoutConfirmation } from '../schemas';

type FormValues = z.output<typeof registerHospitalFormSchema>;
const FIELDS = [
  'name',
  'email',
  'phone',
  'password',
  'consent',
  'hospitalName',
  'registrationNumber',
  'address.line1',
  'address.city',
  'address.state',
  'address.postalCode',
];

function Fieldset({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 text-sm font-semibold text-slate-900">{legend}</legend>
      {children}
    </fieldset>
  );
}

export function RegisterHospitalPage() {
  const { registerHospital } = useAuth();
  const [formError, setFormError] = useState<string>();
  const form = useForm({ resolver: zodResolver(registerHospitalFormSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = async (values: FormValues) => {
    setFormError(undefined);
    try {
      await registerHospital(withoutConfirmation(values));
    } catch (err) {
      setFormError(applyServerErrors(err, form.setError, FIELDS));
    }
  };

  return (
    <AuthCard
      title="Register a hospital"
      description="An administrator verifies every hospital before it can raise blood requests."
    >
      {formError && (
        <Alert tone="error" className="mb-5">
          {formError}
        </Alert>
      )}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
        <Fieldset legend="Hospital">
          <TextField
            label="Hospital name"
            autoComplete="organization"
            required
            registration={form.register('hospitalName')}
            error={errors.hospitalName?.message}
          />
          <TextField
            label="Registration / licence number"
            required
            registration={form.register('registrationNumber')}
            error={errors.registrationNumber?.message}
            hint="Used by administrators to verify your hospital."
          />
          <TextField
            label="Address"
            autoComplete="street-address"
            required
            registration={form.register('address.line1')}
            error={errors.address?.line1?.message}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="City"
              autoComplete="address-level2"
              required
              registration={form.register('address.city')}
              error={errors.address?.city?.message}
            />
            <TextField
              label="State"
              autoComplete="address-level1"
              required
              registration={form.register('address.state')}
              error={errors.address?.state?.message}
            />
            <TextField
              label="Postal code"
              autoComplete="postal-code"
              required
              registration={form.register('address.postalCode')}
              error={errors.address?.postalCode?.message}
            />
          </div>
        </Fieldset>

        <Fieldset legend="Your contact details">
          <TextField
            label="Full name"
            autoComplete="name"
            required
            registration={form.register('name')}
            error={errors.name?.message}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Work email"
              type="email"
              autoComplete="email"
              required
              registration={form.register('email')}
              error={errors.email?.message}
            />
            <TextField
              label="Phone"
              type="tel"
              autoComplete="tel"
              required
              registration={form.register('phone')}
              error={errors.phone?.message}
            />
          </div>
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
        </Fieldset>

        <ConsentField registration={form.register('consent')} error={errors.consent?.message} />
        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          Register hospital
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Already registered?{' '}
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
