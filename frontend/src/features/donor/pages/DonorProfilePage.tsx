import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LocateFixed, MapPinOff } from 'lucide-react';
import { BLOOD_GROUPS, coarsenCoordinate, shortTextSchema, type DonorSelfView } from '@bbms/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectField, TextField } from '@/components/ui/fields';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { BloodGroupPill } from '@/components/domain/BloodGroupPill';
import { AccountDetailsForm } from '@/features/account/components/AccountDetailsForm';
import { toApiClientError } from '@/services/apiError';
import { applyServerErrors } from '@/utils/formErrors';
import { donorSelfApi } from '../api';
import { useDonorProfile } from '../useDonorProfile';

type Notice = { tone: 'success' | 'error'; text: string } | undefined;

const locationSchema = z.object({
  city: shortTextSchema('City', 80),
  area: shortTextSchema('Area', 80),
});

function AreaForm({
  donor,
  onSaved,
}: {
  donor: DonorSelfView;
  onSaved: (d: DonorSelfView) => void;
}) {
  const [notice, setNotice] = useState<Notice>();
  const form = useForm({
    resolver: zodResolver(locationSchema),
    defaultValues: { city: donor.location.city, area: donor.location.area },
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  const onSubmit = async (values: z.infer<typeof locationSchema>) => {
    setNotice(undefined);
    try {
      const updated = await donorSelfApi.update(values);
      onSaved(updated);
      form.reset({ city: updated.location.city, area: updated.location.area });
      setNotice({ tone: 'success', text: 'Area updated.' });
    } catch (err) {
      const message = applyServerErrors(err, form.setError, ['city', 'area']);
      if (message) setNotice({ tone: 'error', text: message });
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4 p-5">
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="City"
          required
          registration={form.register('city')}
          error={errors.city?.message}
        />
        <TextField
          label="Area / locality"
          required
          registration={form.register('area')}
          error={errors.area?.message}
          hint="Shown to staff instead of your address."
        />
      </div>
      <Button type="submit" disabled={!isDirty} isLoading={isSubmitting}>
        Save area
      </Button>
    </form>
  );
}

function ApproximateLocation({
  donor,
  onSaved,
}: {
  donor: DonorSelfView;
  onSaved: (d: DonorSelfView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const save = async (approximateLocation: { latitude: number; longitude: number } | null) => {
    try {
      onSaved(await donorSelfApi.update({ approximateLocation }));
      setNotice({
        tone: 'success',
        text: approximateLocation ? 'Approximate location saved.' : 'Location removed.',
      });
    } catch (err) {
      setNotice({ tone: 'error', text: toApiClientError(err).message });
    } finally {
      setBusy(false);
    }
  };

  const useCurrentLocation = () => {
    setBusy(true);
    setNotice(undefined);
    navigator.geolocation.getCurrentPosition(
      // Rounded in the browser too, so precise coordinates never leave the device.
      (position) =>
        void save({
          latitude: coarsenCoordinate(position.coords.latitude),
          longitude: coarsenCoordinate(position.coords.longitude),
        }),
      () => {
        setBusy(false);
        setNotice({ tone: 'error', text: 'Location access was denied or unavailable.' });
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  };

  return (
    <div className="space-y-4 p-5 text-sm text-slate-700">
      <p>
        Nearby matching works best with an approximate location. It is rounded to about 1 km before
        it leaves your device, and is never shown to hospitals or other donors.
      </p>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <p className="font-medium text-slate-900">
        Status:{' '}
        {donor.location.hasApproximateLocation ? 'Approximate location saved' : 'Not shared'}
      </p>
      <div className="flex flex-wrap gap-2">
        {supported && (
          <Button
            onClick={useCurrentLocation}
            isLoading={busy}
            icon={<LocateFixed className="size-4" aria-hidden />}
          >
            {donor.location.hasApproximateLocation
              ? 'Update from my location'
              : 'Use my current location'}
          </Button>
        )}
        {donor.location.hasApproximateLocation && (
          <Button
            variant="secondary"
            onClick={() => void save(null)}
            icon={<MapPinOff className="size-4" aria-hidden />}
          >
            Remove location
          </Button>
        )}
      </div>
    </div>
  );
}

const bloodGroupSchema = z.object({ bloodGroup: z.enum(BLOOD_GROUPS) });

function BloodGroupSection({
  donor,
  onSaved,
}: {
  donor: DonorSelfView;
  onSaved: (d: DonorSelfView) => void;
}) {
  const [notice, setNotice] = useState<Notice>();
  const form = useForm({
    resolver: zodResolver(bloodGroupSchema),
    defaultValues: { bloodGroup: donor.bloodGroup },
  });

  if (donor.bloodGroupConfirmed) {
    return (
      <div className="space-y-3 p-5 text-sm text-slate-700">
        <BloodGroupPill bloodGroup={donor.bloodGroup} confirmed size="lg" />
        <p>Confirmed by blood-bank staff. If this looks wrong, contact your blood bank.</p>
      </div>
    );
  }

  const onSubmit = async (values: z.infer<typeof bloodGroupSchema>) => {
    try {
      onSaved(await donorSelfApi.update(values));
      form.reset(values);
      setNotice({ tone: 'success', text: 'Blood group updated.' });
    } catch (err) {
      setNotice({ tone: 'error', text: toApiClientError(err).message });
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-5">
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <div className="max-w-48">
        <SelectField
          label="Blood group"
          options={BLOOD_GROUPS.map((group) => ({ value: group, label: group }))}
          registration={form.register('bloodGroup')}
          hint="Self-declared. Staff confirm it at your first donation, after which it is locked."
        />
      </div>
      <Button
        type="submit"
        disabled={!form.formState.isDirty}
        isLoading={form.formState.isSubmitting}
      >
        Save blood group
      </Button>
    </form>
  );
}

export function DonorProfilePage() {
  const { data: donor, error, isLoading, refetch, setData } = useDonorProfile();
  if (isLoading) return <LoadingState />;
  if (error || !donor) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="My profile"
        description="Keep your details current so blood banks can reach you."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Personal details" />
          <AccountDetailsForm />
        </Card>
        <Card>
          <CardHeader title="Blood group" />
          <BloodGroupSection donor={donor} onSaved={setData} />
        </Card>
        <Card>
          <CardHeader title="General area" />
          <AreaForm donor={donor} onSaved={setData} />
        </Card>
        <Card>
          <CardHeader title="Approximate location" />
          <ApproximateLocation donor={donor} onSaved={setData} />
        </Card>
      </div>
    </>
  );
}
