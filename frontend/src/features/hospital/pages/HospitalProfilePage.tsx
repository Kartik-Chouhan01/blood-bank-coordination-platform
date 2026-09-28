import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock } from 'lucide-react';
import {
  hospitalAddressSchema,
  registrationNumberSchema,
  shortTextSchema,
  type HospitalSelfView,
} from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectField, TextField } from '@/components/ui/fields';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { AccountDetailsForm } from '@/features/account/components/AccountDetailsForm';
import { applyServerErrors } from '@/utils/formErrors';
import { hospitalSelfApi } from '@/features/organisations/api';

const schema = z.object({
  name: shortTextSchema('Hospital name', 150),
  registrationNumber: registrationNumberSchema,
  address: hospitalAddressSchema,
  operatingStatus: z.enum(['OPERATIONAL', 'CLOSED']),
});
type Values = z.infer<typeof schema>;

const FIELDS = [
  'name',
  'registrationNumber',
  'address.line1',
  'address.city',
  'address.state',
  'address.postalCode',
  'operatingStatus',
];

function toValues(h: HospitalSelfView): Values {
  return {
    name: h.name,
    registrationNumber: h.registrationNumber,
    address: h.address,
    operatingStatus: h.operatingStatus,
  };
}

function HospitalDetailsForm({
  hospital,
  onSaved,
}: {
  hospital: HospitalSelfView;
  onSaved: (h: HospitalSelfView) => void;
}) {
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string }>();
  const form = useForm({ resolver: zodResolver(schema), defaultValues: toValues(hospital) });
  const { errors, isDirty, isSubmitting, dirtyFields } = form.formState;
  const locked = !hospital.canEditIdentity;

  const onSubmit = async (values: Values) => {
    setNotice(undefined);
    // Send only what changed, so locked identity fields are never resubmitted.
    const input = {
      ...(dirtyFields.name && { name: values.name }),
      ...(dirtyFields.registrationNumber && { registrationNumber: values.registrationNumber }),
      ...(dirtyFields.address && { address: values.address }),
      ...(dirtyFields.operatingStatus && { operatingStatus: values.operatingStatus }),
    };
    try {
      const updated = await hospitalSelfApi.update(input);
      onSaved(updated);
      form.reset(toValues(updated));
      setNotice(
        hospital.verificationStatus === 'REJECTED' && updated.verificationStatus === 'PENDING'
          ? { tone: 'info', text: 'Saved and resubmitted for verification.' }
          : { tone: 'success', text: 'Hospital details saved.' },
      );
    } catch (err) {
      const message = applyServerErrors(err, form.setError, FIELDS);
      if (message) setNotice({ tone: 'error', text: message });
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4 p-5">
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {locked && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Lock className="size-4" aria-hidden /> Name and registration number are locked after
          verification. Contact an administrator to change them.
        </p>
      )}
      {hospital.verificationStatus === 'REJECTED' && (
        <Alert tone="info">
          Correcting the name or registration number will resubmit your hospital for review.
        </Alert>
      )}
      <TextField
        label="Hospital name"
        required
        disabled={locked}
        registration={form.register('name')}
        error={errors.name?.message}
      />
      <TextField
        label="Registration / licence number"
        required
        disabled={locked}
        registration={form.register('registrationNumber')}
        error={errors.registrationNumber?.message}
      />
      <TextField
        label="Address"
        required
        registration={form.register('address.line1')}
        error={errors.address?.line1?.message}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="City"
          required
          registration={form.register('address.city')}
          error={errors.address?.city?.message}
        />
        <TextField
          label="State"
          required
          registration={form.register('address.state')}
          error={errors.address?.state?.message}
        />
        <TextField
          label="Postal code"
          required
          registration={form.register('address.postalCode')}
          error={errors.address?.postalCode?.message}
        />
      </div>
      <div className="max-w-56">
        <SelectField
          label="Operating status"
          options={[
            { value: 'OPERATIONAL', label: 'Operational' },
            { value: 'CLOSED', label: 'Closed' },
          ]}
          registration={form.register('operatingStatus')}
        />
      </div>
      <Button type="submit" disabled={!isDirty} isLoading={isSubmitting}>
        Save hospital details
      </Button>
    </form>
  );
}

export function HospitalProfilePage() {
  const { data: hospital, error, isLoading, refetch, setData } = useApiQuery(hospitalSelfApi.get);
  if (isLoading) return <LoadingState />;
  if (error || !hospital) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Hospital profile"
        description="Details administrators use to verify and contact your hospital."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Hospital details" />
          <HospitalDetailsForm hospital={hospital} onSaved={setData} />
        </Card>
        <Card className="h-fit">
          <CardHeader title="Contact person" description="Your own name and phone number." />
          <AccountDetailsForm />
        </Card>
      </div>
    </>
  );
}
