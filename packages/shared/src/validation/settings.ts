import { z } from 'zod';
import { SETTING_DEFINITIONS, SETTING_KEYS, type SettingKey } from '../constants/settings.js';

const valueSchema = (key: SettingKey) => {
  const def = SETTING_DEFINITIONS[key];
  return def.type === 'boolean'
    ? z.boolean()
    : z
        .number()
        .int('Whole numbers only')
        .min(def.min, `At least ${def.min}`)
        .max(def.max, `At most ${def.max}`);
};

const changesShape = Object.fromEntries(
  SETTING_KEYS.map((key) => [key, valueSchema(key).optional()]),
) as Record<SettingKey, z.ZodOptional<z.ZodBoolean | z.ZodNumber>>;

/** Every change needs a reason; it goes into the audit log. */
export const updateSettingsSchema = z.object({
  changes: z
    .object(changesShape)
    .strict()
    .refine((c) => Object.values(c).some((v) => v !== undefined), { message: 'Nothing to change' }),
  reason: z.string().trim().min(5, 'Give a reason of at least 5 characters').max(500),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** Deleting an account needs the current password and an explicit confirmation word. */
export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password').max(200),
  confirm: z.literal('DELETE', { error: 'Type DELETE to confirm' }),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
