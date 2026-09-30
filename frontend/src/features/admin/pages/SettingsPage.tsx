import { useId, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import {
  SETTING_DEFINITIONS,
  type SettingKey,
  type SettingView,
  type UpdateSettingsInput,
} from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { toApiClientError } from '@/services/apiError';
import { formatDateTime } from '@/utils/format';
import { settingsApi } from '../api';

/** Number fields keep exactly what was typed (so they can be cleared and retyped). */
type Draft = Partial<Record<SettingKey, string | boolean>>;

const CATEGORIES = ['Allocation', 'Donors', 'Requests', 'Inventory', 'Public'] as const;

const show = (key: SettingKey, value: number | boolean) => {
  const def = SETTING_DEFINITIONS[key];
  return def.type === 'boolean' ? (value ? 'On' : 'Off') : `${value} ${def.unit}`;
};

function SettingRow({
  setting,
  draft,
  onChange,
}: {
  setting: SettingView;
  draft: string | boolean | undefined;
  onChange: (value: string | boolean | undefined) => void;
}) {
  const def = SETTING_DEFINITIONS[setting.key];
  const id = useId();
  const value = draft ?? setting.value;
  const changed = draft !== undefined;
  return (
    <li className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-start">
      <div>
        <label
          htmlFor={id}
          className="flex flex-wrap items-center gap-2 font-medium text-slate-900"
        >
          {def.label}
          {changed && <Badge tone="warning">Unsaved</Badge>}
          {!changed && setting.value !== setting.defaultValue && (
            <Badge tone="info">Changed from default</Badge>
          )}
        </label>
        <p className="mt-0.5 text-sm text-slate-600">{def.description}</p>
        <p className="mt-1 text-xs text-slate-500">
          Default {show(setting.key, setting.defaultValue)}
          {setting.updatedBy &&
            ` · last changed by ${setting.updatedBy.name}, ${formatDateTime(setting.updatedAt)}`}
        </p>
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        {def.type === 'boolean' ? (
          <button
            id={id}
            type="button"
            role="switch"
            aria-checked={Boolean(value)}
            onClick={() => onChange(!value === setting.value ? undefined : !value)}
            className={`relative h-6 w-11 rounded-full transition-colors ${value ? 'bg-brand-600' : 'bg-slate-300'}`}
          >
            <span
              aria-hidden
              className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${value ? 'left-5.5' : 'left-0.5'}`}
            />
            <span className="sr-only">{value ? 'On' : 'Off'}</span>
          </button>
        ) : (
          <>
            <input
              id={id}
              type="number"
              inputMode="numeric"
              min={def.min}
              max={def.max}
              step={1}
              value={String(value)}
              onChange={(e) =>
                onChange(e.target.value === String(setting.value) ? undefined : e.target.value)
              }
              className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-right text-sm tabular-nums focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
            />
            <span className="w-24 text-sm text-slate-500">{def.unit}</span>
          </>
        )}
      </div>
    </li>
  );
}

/** Administrator policies. Clinical compatibility rules are not here on purpose. */
export function SettingsPage() {
  const { data, error, isLoading, refetch, setData } = useApiQuery(settingsApi.list);
  const [draft, setDraft] = useState<Draft>({});
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string }>();

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  const parsed = (Object.entries(draft) as [SettingKey, string | boolean | undefined][])
    .filter(([, raw]) => raw !== undefined)
    .map(([key, raw]) => {
      const def = SETTING_DEFINITIONS[key];
      if (def.type === 'boolean') return { key, value: raw as boolean, valid: true };
      const n = /^\d+$/.test(String(raw)) ? Number(raw) : NaN;
      return { key, value: n, valid: Number.isInteger(n) && n >= def.min && n <= def.max };
    });
  const invalid = parsed.filter((p) => !p.valid).map((p) => p.key);
  const changes = Object.fromEntries(
    parsed.filter((p) => p.valid).map((p) => [p.key, p.value]),
  ) as UpdateSettingsInput['changes'];
  const changedKeys = Object.keys(changes) as SettingKey[];

  const save = async (reason: string) => {
    setSaving(true);
    try {
      setData(await settingsApi.update({ changes, reason }));
      setDraft({});
      setNotice({ tone: 'success', text: 'Settings saved. They apply immediately.' });
    } catch (err) {
      setNotice({ tone: 'error', text: toApiClientError(err).message });
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <PageHeader
        title="System settings"
        description="Policies for matching, contact and expiry. Blood-group compatibility rules are fixed in tested code and cannot be edited here."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RotateCcw className="size-4" aria-hidden />}
              disabled={!parsed.length}
              onClick={() => setDraft({})}
            >
              Discard
            </Button>
            <Button
              icon={<Save className="size-4" aria-hidden />}
              disabled={!changedKeys.length || invalid.length > 0}
              onClick={() => setConfirming(true)}
            >
              Save{' '}
              {parsed.length
                ? `${parsed.length} change${parsed.length === 1 ? '' : 's'}`
                : 'changes'}
            </Button>
          </>
        }
      />
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {invalid.length > 0 && (
        <Alert tone="warning">
          {invalid.map((key) => {
            const def = SETTING_DEFINITIONS[key];
            return def.type === 'integer'
              ? `${def.label} must be a whole number from ${def.min} to ${def.max}. `
              : '';
          })}
        </Alert>
      )}
      {CATEGORIES.map((category) => {
        const rows = data.filter((s) => SETTING_DEFINITIONS[s.key].category === category);
        return (
          <Card key={category}>
            <CardHeader title={category} />
            <ul className="divide-y divide-slate-100">
              {rows.map((setting) => (
                <SettingRow
                  key={setting.key}
                  setting={setting}
                  draft={draft[setting.key]}
                  onChange={(value) => setDraft((d) => ({ ...d, [setting.key]: value }))}
                />
              ))}
            </ul>
          </Card>
        );
      })}
      <ConfirmationDialog
        open={confirming}
        title="Save settings"
        description={
          <ul className="list-disc space-y-1 pl-5">
            {changedKeys.map((key) => (
              <li key={key}>
                {SETTING_DEFINITIONS[key].label}:{' '}
                {show(key, data.find((s) => s.key === key)!.value)} →{' '}
                <strong>{show(key, changes[key]!)}</strong>
              </li>
            ))}
          </ul>
        }
        confirmLabel="Save"
        requireReason
        isLoading={saving}
        onConfirm={(reason) => void save(reason!)}
        onCancel={() => setConfirming(false)}
      />
      {data.some((s) => s.updatedAt) && (
        <p className="text-xs text-slate-500">
          Every change is recorded with its reason in the audit log (record type “SystemSetting”).
        </p>
      )}
    </>
  );
}
