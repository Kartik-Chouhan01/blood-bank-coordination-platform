import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { personNameSchema, phoneSchema, type AuthUser } from '@bbms/shared';
import { useAuth } from '@/hooks/useAuth';
import { apiPatch } from '@/services/httpClient';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/fields';
import { applyServerErrors } from '@/utils/formErrors';

const schema = z.object({ name: personNameSchema, phone: phoneSchema });
type Values = z.infer<typeof schema>;

/** Name and phone for any role. Email changes are not self-service (they identify the account). */
export function AccountDetailsForm() {
  const { user, refreshUser } = useAuth();
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string>();
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: user?.name ?? '', phone: user?.phone ?? '' },
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  const onSubmit = async (values: Values) => {
    setSaved(false);
    setFormError(undefined);
    try {
      const updated = await apiPatch<AuthUser>('/users/me', values);
      await refreshUser();
      form.reset({ name: updated.name, phone: updated.phone });
      setSaved(true);
    } catch (err) {
      setFormError(applyServerErrors(err, form.setError, ['name', 'phone']));
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4 p-5">
      {saved && <Alert tone="success">Your details were saved.</Alert>}
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField
        label="Full name"
        autoComplete="name"
        required
        registration={form.register('name')}
        error={errors.name?.message}
      />
      <TextField
        label="Phone"
        type="tel"
        autoComplete="tel"
        required
        registration={form.register('phone')}
        error={errors.phone?.message}
        hint="Only blood-bank staff can see this, and only when coordinating a donation you agreed to."
      />
      <Button type="submit" disabled={!isDirty} isLoading={isSubmitting}>
        Save details
      </Button>
    </form>
  );
}
