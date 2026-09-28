import type { Types } from 'mongoose';
import type { BloodUnitSummary, DonationSummary, UnitStatusChange } from '@bbms/shared';
import { daysToExpiry, isExpiredByDate } from '../../domain/inventory/expiry.js';
import { BloodBankModel } from '../bloodBanks/bloodBank.model.js';
import { DonorProfileModel } from '../donors/donorProfile.model.js';
import { UserModel } from '../users/user.model.js';
import type { BloodUnit, UnitHistoryEntry } from './bloodUnit.model.js';
import type { Donation } from './donation.model.js';

const EXPIRABLE = new Set(['COLLECTED', 'UNDER_TESTING', 'AVAILABLE', 'RESERVED']);

type BankRef = { id: string; name: string; code: string };
type NameRef = { id: string; name: string };

/** Resolves display names for banks, users and donors in a handful of queries. */
export async function loadLookups(ids: {
  banks?: Types.ObjectId[];
  users?: (Types.ObjectId | null)[];
  donors?: Types.ObjectId[];
}) {
  const [banks, users, donors] = await Promise.all([
    ids.banks?.length
      ? BloodBankModel.find({ _id: { $in: ids.banks } })
          .select('name code')
          .lean()
      : [],
    ids.users?.length
      ? UserModel.find({ _id: { $in: ids.users.filter(Boolean) } })
          .select('name')
          .lean()
      : [],
    ids.donors?.length
      ? DonorProfileModel.find({ _id: { $in: ids.donors } })
          .select('userId')
          .lean()
      : [],
  ]);
  const donorUsers = donors.length
    ? await UserModel.find({ _id: { $in: donors.map((d) => d.userId) } })
        .select('name')
        .lean()
    : [];
  const donorUserNames = new Map(donorUsers.map((u) => [u._id.toString(), u.name]));

  const bankMap = new Map<string, BankRef>(
    banks.map((b) => [b._id.toString(), { id: b._id.toString(), name: b.name, code: b.code }]),
  );
  const userMap = new Map<string, NameRef>(
    users.map((u) => [u._id.toString(), { id: u._id.toString(), name: u.name }]),
  );
  const donorMap = new Map<string, NameRef>(
    donors.map((d) => [
      d._id.toString(),
      { id: d._id.toString(), name: donorUserNames.get(d.userId.toString()) ?? 'Unknown donor' },
    ]),
  );
  return {
    bank: (id: Types.ObjectId) =>
      bankMap.get(id.toString()) ?? { id: id.toString(), name: 'Unknown blood bank', code: '—' },
    user: (id: Types.ObjectId | null) => (id ? (userMap.get(id.toString()) ?? null) : null),
    donor: (id: Types.ObjectId) =>
      donorMap.get(id.toString()) ?? { id: id.toString(), name: 'Unknown donor' },
  };
}

export type Lookups = Awaited<ReturnType<typeof loadLookups>>;

export function toUnitSummary(
  unit: BloodUnit,
  lookups: Lookups,
  now = new Date(),
): BloodUnitSummary {
  return {
    id: unit._id.toString(),
    unitCode: unit.unitCode,
    bloodGroup: unit.bloodGroup,
    componentType: unit.componentType,
    volumeMl: unit.volumeMl,
    status: unit.status,
    testingStatus: unit.testingStatus,
    collectedAt: unit.collectedAt.toISOString(),
    expiryDate: unit.expiryDate.toISOString(),
    expiredByDate: EXPIRABLE.has(unit.status) && isExpiredByDate(unit.expiryDate, now),
    daysToExpiry: daysToExpiry(unit.expiryDate, now),
    storageLocation: unit.storageLocation,
    bloodBank: lookups.bank(unit.bloodBankId),
  };
}

export function toHistory(history: UnitHistoryEntry[], lookups: Lookups): UnitStatusChange[] {
  return history.map((entry) => ({
    from: entry.from,
    to: entry.to,
    at: entry.at.toISOString(),
    by: lookups.user(entry.by),
    reason: entry.reason,
    override: entry.override,
  }));
}

export function toDonationSummary(
  donation: Donation,
  unitCount: number,
  lookups: Lookups,
): DonationSummary {
  return {
    id: donation._id.toString(),
    donor: lookups.donor(donation.donorId),
    bloodBank: lookups.bank(donation.bloodBankId),
    collectedAt: donation.collectedAt.toISOString(),
    donationType: donation.donationType,
    volumeMl: donation.volumeMl,
    testingStatus: donation.testingStatus,
    unitCount,
    recordedBy: lookups.user(donation.collectedBy),
  };
}
