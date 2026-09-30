import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShieldAlert } from 'lucide-react';
import {
  BLOOD_GROUPS,
  COMPONENT_LABELS,
  COMPONENT_TYPES,
  MAX_UNITS_PER_REQUEST,
  REQUEST_REASON_CATEGORIES,
  REQUEST_REASON_LABELS,
  createRequestSchema,
  type BloodRequestDetail,
  type CreateRequestInput,
} from '@bbms/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/fields';
import { applyServerErrors } from '@/utils/formErrors';
import { localDateTimeFromNow, toLocalDateTimeInput } from '@/utils/format';
import { cn } from '@/utils/cn';

// The browser gives a local date-time; the API wants an ISO timestamp.
const formSchema = createRequestSchema.omit({ requiredBy: true }).extend({
  requiredByLocal: z
    .string()
    .min(1, 'Choose when the blood is needed')
    .refine((value) => new Date(value).getTime() > Date.now(), 'Choose a time in the future'),
});
type FormInput = z.input<typeof formSchema>;
type FormValues = z.output<typeof formSchema>;

const FIELDS = [
  'bloodGroup',
  'componentType',
  'unitsRequested',
  'urgency',
  'reasonCategory',
  'hospitalReference',
  'notes',
];

const URGENCY_OPTIONS = [
  { value: 'ROUTINE', label: 'Routine', hint: 'Planned need' },
  { value: 'URGENT', label: 'Urgent', hint: 'Needed soon; prioritised for review' },
  { value: 'EMERGENCY', label: 'Emergency', hint: 'Approved automatically and handled first' },
] as const;

interface RequestFormProps {
  existing?: BloodRequestDetail;
  submitLabel: string;
  onSubmit: (input: CreateRequestInput) => Promise<void>;
  onCancel?: () => void;
}

/** Used to raise a request and to edit a pending one (urgency changes go through escalation). */
export function RequestForm({ existing, submitLabel, onSubmit, onCancel }: RequestFormProps) {
  const [formError, setFormError] = useState<string>();
  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: existing
      ? {
          bloodGroup: existing.bloodGroup,
          componentType: existing.componentType,
          unitsRequested: existing.unitsRequested,
          urgency: existing.urgency,
          reasonCategory: existing.reasonCategory,
          hospitalReference: existing.hospitalReference ?? '',
          notes: existing.notes ?? '',
          requiredByLocal: toLocalDateTimeInput(existing.requiredBy),
        }
      : { urgency: 'ROUTINE', unitsRequested: 1, requiredByLocal: localDateTimeFromNow(24) },
  });
  const { errors, isSubmitting } = form.formState;
  const urgency = useWatch({ control: form.control, name: 'urgency' });

  const submit = async ({ requiredByLocal, hospitalReference, notes, ...values }: FormValues) => {
    setFormError(undefined);
    try {
      await onSubmit({
        ...values,
        requiredBy: new Date(requiredByLocal).toISOString(),
        ...(hospitalReference && { hospitalReference }),
        ...(notes && { notes }),
      });
    } catch (err) {
      const message = applyServerErrors(err, form.setError, FIELDS);
      if (message) setFormError(message);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-5">
      {formError && <Alert tone="error">{formError}</Alert>}

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Blood group"
          required
          placeholder="Select…"
          options={BLOOD_GROUPS.map((g) => ({ value: g, label: g }))}
          registration={form.register('bloodGroup')}
          error={errors.bloodGroup?.message}
        />
        <SelectField
          label="Component"
          required
          placeholder="Select…"
          options={COMPONENT_TYPES.map((c) => ({ value: c, label: COMPONENT_LABELS[c] }))}
          registration={form.register('componentType')}
          error={errors.componentType?.message}
        />
        <TextField
          label="Units"
          type="number"
          min={1}
          max={MAX_UNITS_PER_REQUEST}
          required
          registration={form.register('unitsRequested', { valueAsNumber: true })}
          error={errors.unitsRequested?.message}
        />
      </div>

      {!existing && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Urgency</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {URGENCY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  'flex cursor-pointer gap-2.5 rounded-lg border p-3 text-sm',
                  urgency === option.value
                    ? option.value === 'EMERGENCY'
                      ? 'border-red-400 bg-red-50'
                      : 'border-brand-300 bg-brand-50/50'
                    : 'border-slate-200 hover:bg-slate-50',
                )}
              >
                <input
                  type="radio"
                  value={option.value}
                  className="mt-0.5 accent-brand-600"
                  {...form.register('urgency')}
                />
                <span>
                  <span className="block font-medium text-slate-900">{option.label}</span>
                  <span className="block text-xs text-slate-600">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {urgency === 'EMERGENCY' && (
            <Alert tone="warning" className="mt-3">
              Use Emergency only for genuine emergencies. The request is approved immediately,
              blood-bank staff are alerted, and it goes to the top of their queue.
            </Alert>
          )}
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Required by"
          type="datetime-local"
          required
          registration={form.register('requiredByLocal')}
          error={errors.requiredByLocal?.message}
        />
        <SelectField
          label="Reason"
          required
          placeholder="Select…"
          options={REQUEST_REASON_CATEGORIES.map((r) => ({
            value: r,
            label: REQUEST_REASON_LABELS[r],
          }))}
          registration={form.register('reasonCategory')}
          error={errors.reasonCategory?.message}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Your reference (optional)"
          registration={form.register('hospitalReference')}
          error={errors.hospitalReference?.message}
          hint="e.g. internal order number. Letters, digits and / _ . - only."
        />
        <TextField
          label="Notes for the blood bank (optional)"
          registration={form.register('notes')}
          error={errors.notes?.message}
        />
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        Do not enter patient names, record numbers or other identifying details anywhere in this
        request.
      </p>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant={urgency === 'EMERGENCY' && !existing ? 'danger' : 'primary'}
          isLoading={isSubmitting}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
