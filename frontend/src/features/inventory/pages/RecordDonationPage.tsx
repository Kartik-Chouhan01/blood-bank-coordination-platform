import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  COMPONENT_LABELS,
  COMPONENT_TYPES,
  type ComponentType,
  type DonationType,
  type DonorStaffSummary,
} from '@bbms/shared';
import { useAuth } from '@/hooks/useAuth';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/fields';
import { toApiClientError } from '@/services/apiError';
import { donationsApi } from '../api';
import { BankScopeSelect } from '../components/BankScopeSelect';
import { DonorPicker } from '../components/DonorPicker';

const SEPARATED: ComponentType[] = COMPONENT_TYPES.filter((c) => c !== 'WHOLE_BLOOD');

/** Current local time formatted for <input type="datetime-local">. */
function localNow() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function RecordDonationPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';
  const [donor, setDonor] = useState<DonorStaffSummary | null>(null);
  const [bankId, setBankId] = useState('');
  const [collectedAt, setCollectedAt] = useState(localNow);
  const [donationType, setDonationType] = useState<DonationType>('WHOLE_BLOOD');
  const [volumeMl, setVolumeMl] = useState('450');
  const [mode, setMode] = useState<'whole' | 'separated'>('separated');
  const [components, setComponents] = useState<ComponentType[]>(['PRBC', 'PLASMA']);
  const [storageLocation, setStorageLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const ids = { at: useId(), type: useId(), volume: useId(), storage: useId(), notes: useId() };

  const toggle = (c: ComponentType) =>
    setComponents((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const clientErrors: Record<string, string> = {};
    if (!donor) clientErrors.donorId = 'Choose the donor';
    if (isAdmin && !bankId) clientErrors.bloodBankId = 'Choose the blood bank';
    if (mode === 'separated' && components.length === 0)
      clientErrors.components = 'Choose at least one component';
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length) return;

    setSaving(true);
    setFormError(undefined);
    try {
      const donation = await donationsApi.record({
        donorId: donor!.id,
        ...(isAdmin && { bloodBankId: bankId }),
        collectedAt: new Date(collectedAt).toISOString(),
        donationType,
        volumeMl: Number(volumeMl),
        components: mode === 'whole' ? ['WHOLE_BLOOD'] : components,
        ...(storageLocation.trim() && { storageLocation: storageLocation.trim() }),
        ...(notes.trim() && { notes: notes.trim() }),
      });
      navigate(`/admin/donations/${donation.id}`, { replace: true });
    } catch (err) {
      const apiError = toApiClientError(err);
      setErrors(apiError.fieldErrors());
      setFormError(apiError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Record donation"
        description="Creates the blood units for this collection. They start as collected, awaiting testing."
      />
      <Card className="max-w-3xl">
        <form onSubmit={submit} noValidate className="space-y-5 p-5">
          {formError && <Alert tone="error">{formError}</Alert>}
          <DonorPicker value={donor} onChange={setDonor} error={errors.donorId} />

          {isAdmin && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-slate-700">
                Blood bank
                <span className="ml-0.5 text-brand-700" aria-hidden>
                  *
                </span>
              </p>
              <BankScopeSelect value={bankId} onChange={setBankId} />
              {errors.bloodBankId && (
                <p role="alert" className="text-xs font-medium text-red-700">
                  {errors.bloodBankId}
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor={ids.at} className="block text-sm font-medium text-slate-700">
                Collected at
              </label>
              <Input
                id={ids.at}
                type="datetime-local"
                value={collectedAt}
                max={localNow()}
                onChange={(e) => setCollectedAt(e.target.value)}
                invalid={!!errors.collectedAt}
              />
              {errors.collectedAt && (
                <p role="alert" className="text-xs font-medium text-red-700">
                  {errors.collectedAt}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor={ids.type} className="block text-sm font-medium text-slate-700">
                Donation type
              </label>
              <Select
                id={ids.type}
                value={donationType}
                onChange={(e) => setDonationType(e.target.value as DonationType)}
              >
                <option value="WHOLE_BLOOD">Whole blood</option>
                <option value="APHERESIS">Apheresis</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={ids.volume} className="block text-sm font-medium text-slate-700">
                Volume collected (ml)
              </label>
              <Input
                id={ids.volume}
                type="number"
                min={50}
                max={1000}
                value={volumeMl}
                onChange={(e) => setVolumeMl(e.target.value)}
                invalid={!!errors.volumeMl}
              />
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-slate-700">Units produced</legend>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  className="accent-brand-600"
                  checked={mode === 'whole'}
                  onChange={() => setMode('whole')}
                />{' '}
                One whole-blood unit
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  className="accent-brand-600"
                  checked={mode === 'separated'}
                  onChange={() => setMode('separated')}
                />{' '}
                Separated components
              </label>
            </div>
            {mode === 'separated' && (
              <div className="grid gap-2 sm:grid-cols-2">
                {SEPARATED.map((c) => (
                  <label
                    key={c}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-brand-600"
                      checked={components.includes(c)}
                      onChange={() => toggle(c)}
                    />
                    {COMPONENT_LABELS[c]}
                  </label>
                ))}
              </div>
            )}
            {errors.components && (
              <p role="alert" className="text-xs font-medium text-red-700">
                {errors.components}
              </p>
            )}
            <p className="text-xs text-slate-500">
              Expiry dates are set per component from the blood bank&apos;s configured shelf lives.
            </p>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={ids.storage} className="block text-sm font-medium text-slate-700">
                Storage location
              </label>
              <Input
                id={ids.storage}
                placeholder="e.g. Fridge 2, shelf B"
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={ids.notes} className="block text-sm font-medium text-slate-700">
                Notes (administrative)
              </label>
              <Input id={ids.notes} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving}>
              Record donation
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
