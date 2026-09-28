import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  notificationPreferencesSchema,
  type DonorSelfView,
  type NotificationPreferences,
} from '@bbms/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { CheckboxField, TextField } from '@/components/ui/fields';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { applyServerErrors } from '@/utils/formErrors';
import { formatDate, formatDateTime } from '@/utils/format';
import { donorSelfApi } from '../api';
import { AvailabilityCard } from '../components/AvailabilityCard';
import { useDonorProfile } from '../useDonorProfile';

function NotificationPreferencesForm({
  donor,
  onSaved,
}: {
  donor: DonorSelfView;
  onSaved: (d: DonorSelfView) => void;
}) {
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string }>();
  const form = useForm({
    resolver: zodResolver(notificationPreferencesSchema),
    defaultValues: donor.notificationPreferences,
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const [inApp, email] = useWatch({ control: form.control, name: ['inApp', 'email'] });

  const onSubmit = async (input: NotificationPreferences) => {
    setNotice(undefined);
    try {
      const updated = await donorSelfApi.setNotificationPreferences(input);
      onSaved(updated);
      form.reset(updated.notificationPreferences);
      setNotice({ tone: 'success', text: 'Preferences saved.' });
    } catch (err) {
      const message = applyServerErrors(err, form.setError, ['maxContactsPerWeek']);
      if (message) setNotice({ tone: 'error', text: message });
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4 p-5">
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <CheckboxField registration={form.register('inApp')}>In-app notifications</CheckboxField>
      <CheckboxField registration={form.register('email')}>Email notifications</CheckboxField>
      <CheckboxField registration={form.register('emergencyOnly')}>
        Only contact me for <strong>emergency</strong> requests
      </CheckboxField>
      <div className="max-w-56">
        <TextField
          label="Maximum contacts per week"
          type="number"
          min={0}
          max={14}
          registration={form.register('maxContactsPerWeek', { valueAsNumber: true })}
          error={errors.maxContactsPerWeek?.message}
          hint="0 pauses donation requests without changing your availability."
        />
      </div>
      {!inApp && !email && (
        <Alert tone="warning">
          With both channels off, you will not hear about requests that match you.
        </Alert>
      )}
      <Button type="submit" disabled={!isDirty} isLoading={isSubmitting}>
        Save preferences
      </Button>
    </form>
  );
}

export function DonorSettingsPage() {
  const { data: donor, error, isLoading, refetch, setData } = useDonorProfile();
  if (isLoading) return <LoadingState />;
  if (error || !donor) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader title="Settings" description="Control when and how you are contacted." />
      <div className="grid gap-6 lg:grid-cols-2">
        <AvailabilityCard donor={donor} onChange={setData} />
        <Card>
          <CardHeader title="Notifications" />
          <NotificationPreferencesForm donor={donor} onSaved={setData} />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Availability history" description="Your most recent changes." />
          <ul className="divide-y divide-slate-100">
            {donor.availabilityHistory.map((entry, index) => (
              <li
                key={`${entry.changedAt}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
              >
                <span className="flex items-center gap-2">
                  <StatusBadge kind="availability" value={entry.status} />
                  {entry.availableAgainAt && (
                    <span className="text-slate-500">
                      until {formatDate(entry.availableAgainAt)}
                    </span>
                  )}
                </span>
                <time dateTime={entry.changedAt} className="text-slate-500">
                  {formatDateTime(entry.changedAt)}
                </time>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
