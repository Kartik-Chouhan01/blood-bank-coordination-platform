import type { SettingKey } from '../constants/settings.js';

export interface SettingView {
  key: SettingKey;
  value: number | boolean;
  /** What the value would be without an administrator override (from the server environment). */
  defaultValue: number | boolean;
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
}
