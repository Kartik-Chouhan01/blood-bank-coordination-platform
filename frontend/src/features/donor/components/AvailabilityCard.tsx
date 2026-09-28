import { useId, useState } from 'react';
import {
  MAX_TEMPORARY_UNAVAILABILITY_DAYS,
  type AvailabilityStatus,
  type DonorSelfView,
} from '@bbms/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/FormField';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { toApiClientError } from '@/services/apiError';
import { formatDate, isoDateFromToday } from '@/utils/format';
import { cn } from '@/utils/cn';
import { donorSelfApi } from '../api';

const OPTIONS: { value: AvailabilityStatus; label: string; description: string }[] = [
  {
    value: 'AVAILABLE',
    label: 'Available',
    description: 'You may be contacted about matching needs.',
  },
  {
    value: 'TEMPORARILY_UNAVAILABLE',
    label: 'Away until a date',
    description: 'Travelling, unwell or busy — you become available again automatically.',
  },
  {
    value: 'UNAVAILABLE',
    label: 'Unavailable',
    description: 'Not contacted until you change this.',
  },
  {
    value: 'DO_NOT_CONTACT',
    label: 'Do not contact',
    description: 'You will never be contacted about donation requests.',
  },
];

interface AvailabilityCardProps {
  donor: DonorSelfView;
  onChange: (donor: DonorSelfView) => void;
}

export function AvailabilityCard({ donor, onChange }: AvailabilityCardProps) {
  const [status, setStatus] = useState<AvailabilityStatus>(donor.effectiveAvailability);
  const [returnDate, setReturnDate] = useState(
    donor.availableAgainAt?.slice(0, 10) ?? isoDateFromToday(14),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string }>();
  const groupName = useId();
  const dateId = useId();

  const dirty =
    status !== donor.effectiveAvailability ||
    (status === 'TEMPORARILY_UNAVAILABLE' && returnDate !== donor.availableAgainAt?.slice(0, 10));

  const save = async () => {
    setSaving(true);
    setMessage(undefined);
    try {
      const updated = await donorSelfApi.setAvailability({
        status,
        ...(status === 'TEMPORARILY_UNAVAILABLE' && { availableAgainAt: returnDate }),
      });
      onChange(updated);
      setMessage({ tone: 'success', text: 'Availability updated.' });
    } catch (err) {
      const error = toApiClientError(err);
      setMessage({ tone: 'error', text: error.fieldErrors().availableAgainAt ?? error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Availability"
        description={
          donor.effectiveAvailability === 'TEMPORARILY_UNAVAILABLE'
            ? `Away until ${formatDate(donor.availableAgainAt)}`
            : 'Tell blood banks whether you can be contacted.'
        }
        actions={<StatusBadge kind="availability" value={donor.effectiveAvailability} />}
      />
      <fieldset className="space-y-2 p-5">
        <legend className="sr-only">Your availability</legend>
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer gap-3 rounded-lg border p-3 text-sm',
              status === option.value
                ? 'border-brand-300 bg-brand-50/50'
                : 'border-slate-200 hover:bg-slate-50',
            )}
          >
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={status === option.value}
              onChange={() => setStatus(option.value)}
              className="mt-0.5 accent-brand-600"
            />
            <span>
              <span className="block font-medium text-slate-900">{option.label}</span>
              <span className="block text-slate-600">{option.description}</span>
            </span>
          </label>
        ))}

        {status === 'TEMPORARILY_UNAVAILABLE' && (
          <div className="space-y-1.5 pt-2">
            <label htmlFor={dateId} className="block text-sm font-medium text-slate-700">
              Available again on
            </label>
            <Input
              id={dateId}
              type="date"
              value={returnDate}
              min={isoDateFromToday(1)}
              max={isoDateFromToday(MAX_TEMPORARY_UNAVAILABILITY_DAYS)}
              onChange={(e) => setReturnDate(e.target.value)}
              className="max-w-48"
            />
          </div>
        )}

        {message && (
          <Alert tone={message.tone} className="mt-3">
            {message.text}
          </Alert>
        )}

        <div className="pt-3">
          <Button onClick={save} disabled={!dirty} isLoading={saving}>
            Save availability
          </Button>
        </div>
      </fieldset>
    </Card>
  );
}
