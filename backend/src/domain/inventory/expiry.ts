import type { ComponentType } from '@bbms/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeExpiryDate(
  collectedAt: Date,
  component: ComponentType,
  shelfLifeDays: Record<ComponentType, number>,
): Date {
  return new Date(collectedAt.getTime() + shelfLifeDays[component] * DAY_MS);
}

/** Whole days until expiry, rounded down; negative once expired. */
export function daysToExpiry(expiryDate: Date, now = new Date()): number {
  return Math.floor((expiryDate.getTime() - now.getTime()) / DAY_MS);
}

export function isExpiredByDate(expiryDate: Date, now = new Date()): boolean {
  return expiryDate.getTime() <= now.getTime();
}
