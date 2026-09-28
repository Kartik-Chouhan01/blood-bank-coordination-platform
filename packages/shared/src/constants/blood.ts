export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

/**
 * Component type matters for compatibility: red-cell and plasma rules are inverted,
 * so compatibility is always evaluated per component (see backend domain/compatibility).
 */
export const COMPONENT_TYPES = ['WHOLE_BLOOD', 'PRBC', 'PLASMA', 'PLATELETS', 'CRYO'] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const COMPONENT_LABELS: Record<ComponentType, string> = {
  WHOLE_BLOOD: 'Whole blood',
  PRBC: 'Packed red blood cells',
  PLASMA: 'Plasma',
  PLATELETS: 'Platelets',
  CRYO: 'Cryoprecipitate',
};

export const isBloodGroup = (value: unknown): value is BloodGroup =>
  typeof value === 'string' && (BLOOD_GROUPS as readonly string[]).includes(value);
