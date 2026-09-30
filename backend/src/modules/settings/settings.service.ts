import { Schema, model, type Types } from 'mongoose';
import {
  SETTING_DEFINITIONS,
  SETTING_KEYS,
  type SettingKey,
  type SettingView,
  type SystemSettings,
  type UpdateSettingsInput,
} from '@bbms/shared';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import { baseSchemaOptions, withTransaction } from '../../utils/mongoose.js';
import { recordAudit } from '../audit/audit.service.js';
import { UserModel } from '../users/user.model.js';

interface SystemSetting {
  _id: Types.ObjectId;
  key: SettingKey;
  value: number | boolean;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const systemSettingSchema = new Schema<SystemSetting>(
  {
    key: { type: String, enum: SETTING_KEYS, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  baseSchemaOptions<SystemSetting>(),
);
systemSettingSchema.index({ key: 1 }, { unique: true });
export const SystemSettingModel = model<SystemSetting>('SystemSetting', systemSettingSchema);

/** Defaults come from the environment, so existing deployments keep their configured behaviour. */
export function defaultSettings(): SystemSettings {
  return {
    donorContactIntervalDays: env.DONOR_CONTACT_INTERVAL_DAYS,
    donorSearchRadiusKm: env.DONOR_SEARCH_RADIUS_KM,
    emergencyDonorSearchRadiusKm: env.DONOR_SEARCH_RADIUS_EMERGENCY_KM,
    outreachDonorsPerUnit: env.OUTREACH_DONORS_PER_UNIT,
    outreachMaxDonors: env.OUTREACH_MAX_DONORS,
    allowCompatibleSubstitutes: true,
    conserveUniversalDonors: true,
    reservationHoldHours: env.RESERVATION_HOLD_HOURS,
    requestExpiryGraceHours: env.REQUEST_EXPIRY_GRACE_HOURS,
    expiryWarningDays: env.EXPIRY_WARNING_DAYS,
    publicStockLowBelow: env.PUBLIC_STOCK_LOW_BELOW,
    publicStockGoodFrom: env.PUBLIC_STOCK_GOOD_FROM,
  };
}

/** A stored value is used only if it still fits its definition (definitions may tighten later). */
function isValid(key: SettingKey, value: unknown): value is number | boolean {
  const def = SETTING_DEFINITIONS[key];
  if (def.type === 'boolean') return typeof value === 'boolean';
  return Number.isInteger(value) && (value as number) >= def.min && (value as number) <= def.max;
}

let snapshot: SystemSettings = defaultSettings();

/**
 * Current settings, synchronously. Kept fresh by `refreshSettings` (at startup, every minute and
 * right after an administrator changes something), so reads never hit the database.
 */
export const settings = (): Readonly<SystemSettings> => snapshot;

export async function refreshSettings() {
  const stored = await SystemSettingModel.find().lean();
  const next = defaultSettings() as Record<SettingKey, number | boolean>;
  for (const doc of stored) {
    if (isValid(doc.key, doc.value)) next[doc.key] = doc.value;
    else logger.warn({ key: doc.key }, 'Ignoring invalid stored setting; using the default');
  }
  snapshot = next as SystemSettings;
  return snapshot;
}

/** Tests: forget administrator overrides between cases. */
export function resetSettingsCache() {
  snapshot = defaultSettings();
}

export async function listSettings(): Promise<SettingView[]> {
  const current = await refreshSettings();
  const defaults = defaultSettings();
  const stored = new Map(
    (await SystemSettingModel.find().lean()).map((doc) => [doc.key, doc] as const),
  );
  const users = await UserModel.find({
    _id: { $in: [...stored.values()].map((d) => d.updatedBy).filter(Boolean) },
  })
    .select('name')
    .lean();
  const names = new Map(users.map((u) => [u._id.toString(), u.name]));
  return SETTING_KEYS.map((key) => {
    const doc = stored.get(key);
    return {
      key,
      value: current[key],
      defaultValue: defaults[key],
      updatedAt: doc?.updatedAt.toISOString() ?? null,
      updatedBy: doc?.updatedBy
        ? { id: doc.updatedBy.toString(), name: names.get(doc.updatedBy.toString()) ?? 'Unknown' }
        : null,
    };
  });
}

export async function updateSettings(actor: Actor, input: UpdateSettingsInput) {
  const current = await refreshSettings();
  const changes = Object.entries(input.changes).filter(
    ([key, value]) => value !== undefined && current[key as SettingKey] !== value,
  ) as [SettingKey, number | boolean][];
  if (!changes.length) return listSettings();

  const proposed = { ...current, ...Object.fromEntries(changes) } as SystemSettings;
  if (proposed.publicStockGoodFrom <= proposed.publicStockLowBelow) {
    throw AppError.validation([
      {
        field: 'body.changes.publicStockGoodFrom',
        message: 'The "Good" threshold must be above the "Low" threshold',
      },
    ]);
  }

  await withTransaction(async (session) => {
    for (const [key, value] of changes) {
      const doc = await SystemSettingModel.findOneAndUpdate(
        { key },
        { $set: { value, updatedBy: actor.userId } },
        { upsert: true, returnDocument: 'after', session },
      ).lean();
      await recordAudit(
        actor,
        {
          action: 'SETTINGS_UPDATED',
          entityType: 'SystemSetting',
          entityId: doc!._id,
          before: { [key]: current[key] },
          after: { [key]: value },
          reason: input.reason,
        },
        session,
      );
    }
  });
  return listSettings();
}
