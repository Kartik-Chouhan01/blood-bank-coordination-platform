/**
 * Administrator-editable policies. Clinical rules (compatibility tables) are deliberately NOT here:
 * they live in tested code. Settings are policies only — intervals, limits and on/off switches.
 * Defaults come from the server environment, so an existing deployment keeps its behaviour.
 */
interface IntegerSetting {
  type: 'integer';
  min: number;
  max: number;
  unit: string;
}
interface BooleanSetting {
  type: 'boolean';
}
type SettingDefinition = (IntegerSetting | BooleanSetting) & {
  category: 'Donors' | 'Allocation' | 'Requests' | 'Inventory' | 'Public';
  label: string;
  description: string;
};

export const SETTING_DEFINITIONS = {
  donorContactIntervalDays: {
    type: 'integer',
    min: 1,
    max: 365,
    unit: 'days',
    category: 'Donors',
    label: 'Contact interval after a donation',
    description:
      'Days after a recorded donation before the system may contact a donor again. An administrative policy, not a medical rule.',
  },
  donorSearchRadiusKm: {
    type: 'integer',
    min: 1,
    max: 500,
    unit: 'km',
    category: 'Donors',
    label: 'Donor search radius',
    description:
      'How far from the hospital potential donors are searched for routine and urgent requests.',
  },
  emergencyDonorSearchRadiusKm: {
    type: 'integer',
    min: 1,
    max: 500,
    unit: 'km',
    category: 'Donors',
    label: 'Donor search radius (emergencies)',
    description: 'Wider radius used for emergency requests.',
  },
  outreachDonorsPerUnit: {
    type: 'integer',
    min: 1,
    max: 10,
    unit: 'donors per unit',
    category: 'Donors',
    label: 'Donors suggested per missing unit',
    description: 'Not everyone responds, so more donors than units are suggested.',
  },
  outreachMaxDonors: {
    type: 'integer',
    min: 1,
    max: 50,
    unit: 'donors',
    category: 'Donors',
    label: 'Maximum donors contacted per request',
    description: 'Upper limit on how many donors can be contacted about one request.',
  },
  allowCompatibleSubstitutes: {
    type: 'boolean',
    category: 'Allocation',
    label: 'Offer compatible substitute groups',
    description:
      'When off, only units and donors of exactly the requested blood group are offered. Compatibility itself is never editable.',
  },
  conserveUniversalDonors: {
    type: 'boolean',
    category: 'Allocation',
    label: 'Conserve universal donor units',
    description:
      'When on, O− red cells and AB plasma are not pre-selected while other suitable units exist. Staff can still choose them.',
  },
  reservationHoldHours: {
    type: 'integer',
    min: 1,
    max: 168,
    unit: 'hours',
    category: 'Allocation',
    label: 'Reservation hold',
    description:
      'Reserved units not issued within this time are released back to stock automatically.',
  },
  requestExpiryGraceHours: {
    type: 'integer',
    min: 0,
    max: 168,
    unit: 'hours',
    category: 'Requests',
    label: 'Grace period after required-by',
    description:
      'Open requests stay actionable (flagged overdue) this long past their required-by time before they expire.',
  },
  expiryWarningDays: {
    type: 'integer',
    min: 1,
    max: 60,
    unit: 'days',
    category: 'Inventory',
    label: 'Expiring-soon warning',
    description: 'Units expiring within this many days are flagged as expiring soon.',
  },
  publicStockLowBelow: {
    type: 'integer',
    min: 1,
    max: 1000,
    unit: 'units',
    category: 'Public',
    label: 'Public level "Low" below',
    description:
      'Fewer usable red-cell units of a group than this shows the group as Low publicly.',
  },
  publicStockGoodFrom: {
    type: 'integer',
    min: 2,
    max: 5000,
    unit: 'units',
    category: 'Public',
    label: 'Public level "Good" from',
    description:
      'This many units or more shows the group as Good. Must be above the Low threshold.',
  },
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];

type ValueOf<D> = D extends { type: 'boolean' } ? boolean : number;
export type SystemSettings = { [K in SettingKey]: ValueOf<(typeof SETTING_DEFINITIONS)[K]> };
