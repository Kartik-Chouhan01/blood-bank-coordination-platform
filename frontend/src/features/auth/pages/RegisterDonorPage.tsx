import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { BLOOD_GROUPS, PASSWORD_RULES_TEXT } from '@bbms/shared';
import { useAuth } from '@/hooks/useAuth';
import { AuthCard } from '@/layouts/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PasswordField, SelectField, TextField } from '@/components/ui/fields';
import { applyServerErrors } from '@/utils/formErrors';
import { ConsentField } from '../components/ConsentField';
import { registerDonorFormSchema, withoutConfirmation } from '../schemas';

type FormValues = z.output<typeof registerDonorFormSchema>;
const FIELDS = [
  'name',
  'email',
  'phone',
  'password',
  'bloodGroup',
  'dateOfBirth',
  'city',
  'area',
  'consent',
];
const BLOOD_GROUP_OPTIONS = BLOOD_GROUPS.map((group) => ({ value: group, label: group }));

export function RegisterDonorPage() {
  const { registerDonor } = useAuth();
  const [formError, setFormError] = useState<string>();
  const form = useForm({ resolver: zodResolver(registerDonorFormSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = async (values: FormValues) => {
    setFormError(undefined);
    try {
      await registerDonor(withoutConfirmation(values));
    } catch (err) {
      setFormError(applyServerErrors(err, form.setError, FIELDS));
    }
  };

  return (
    <AuthCard
      title="Register as a donor"
      description="Your phone, email and exact address are never shown publicly."
    >
      {formError && (
        <Alert tone="error" className="mb-5">
          {formError}
        </Alert>
      )}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <TextField
          label="Full name"
          autoComplete="name"
          required
          registration={form.register('name')}
          error={errors.name?.message}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Email"
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
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Blood group"
            required
            placeholder="Select…"
            options={BLOOD_GROUP_OPTIONS}
            registration={form.register('bloodGroup')}
            error={errors.bloodGroup?.message}
            hint="Self-declared until confirmed by blood-bank staff."
          />
          <TextField
            label="Date of birth"
            type="date"
            autoComplete="bday"
            required
            registration={form.register('dateOfBirth')}
            error={errors.dateOfBirth?.message}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="City"
            autoComplete="address-level2"
            required
            registration={form.register('city')}
            error={errors.city?.message}
          />
          <TextField
            label="Area / locality"
            required
            registration={form.register('area')}
            error={errors.area?.message}
            hint="General area only — not your street address."
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
        <ConsentField registration={form.register('consent')} error={errors.consent?.message} />
        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          Create donor account
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
