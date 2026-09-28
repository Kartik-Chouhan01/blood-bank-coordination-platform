import { Types, type QueryFilter } from 'mongoose';
import {
  ERROR_CODES,
  type DonationDetail,
  type DonorDonationView,
  type ListDonationsQuery,
  type RecordDonationInput,
  type RecordTestResultInput,
} from '@bbms/shared';
import { env } from '../../config/env.js';
import { computeExpiryDate } from '../../domain/inventory/expiry.js';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import { withTransaction } from '../../utils/mongoose.js';
import { buildPaginationMeta, pageToSkip } from '../../utils/pagination.js';
import { recordAudit } from '../audit/audit.service.js';
import { BloodBankModel } from '../bloodBanks/bloodBank.model.js';
import { DonorProfileModel } from '../donors/donorProfile.model.js';
import { BloodUnitModel } from './bloodUnit.model.js';
import { nextSequence } from './counter.model.js';
import { DonationModel, type Donation } from './donation.model.js';
import { loadLookups, toDonationSummary, toUnitSummary } from './inventory.presenter.js';
import { assertCanManageBank, canManageBank, transitionUnit } from './unitTransitions.js';

const DAY_MS = 86_400_000;

async function resolveBankForWrite(actor: Actor, requested: string | undefined) {
  let bankId: Types.ObjectId;
  if (actor.role === 'ADMIN') {
    if (!requested) {
      throw AppError.validation([{ field: 'body.bloodBankId', message: 'Choose the blood bank' }]);
    }
    bankId = new Types.ObjectId(requested);
  } else {
    if (!actor.bloodBankId) throw AppError.forbidden('Your account is not linked to a blood bank.');
    if (requested && !actor.bloodBankId.equals(requested)) {
      throw AppError.forbidden('You can only record donations for your own blood bank.');
    }
    bankId = actor.bloodBankId;
  }
  const bank = await BloodBankModel.findById(bankId).lean();
  if (!bank)
    throw AppError.validation([{ field: 'body.bloodBankId', message: 'Blood bank not found' }]);
  if (!bank.isActive) throw AppError.conflict('This blood bank is inactive.', ERROR_CODES.CONFLICT);
  return bank;
}

/** e.g. PUN-CENTRAL-260929-0007 — readable, unique, sortable within a bank and day. */
async function allocateUnitCodes(
  bankCode: string,
  collectedAt: Date,
  count: number,
): Promise<string[]> {
  const day = collectedAt.toISOString().slice(2, 10).replaceAll('-', '');
  const first = await nextSequence(`unit:${bankCode}:${day}`, count);
  return Array.from(
    { length: count },
    (_, i) => `${bankCode}-${day}-${String(first + i).padStart(4, '0')}`,
  );
}

// ─── Recording ───────────────────────────────────────────────────────────────

export async function recordDonation(actor: Actor, input: RecordDonationInput) {
  const recordedBy = actor.userId;
  if (!recordedBy)
    throw AppError.forbidden('Donations must be recorded by a signed-in staff member.');
  const bank = await resolveBankForWrite(actor, input.bloodBankId);
  const donor = await DonorProfileModel.findById(input.donorId).lean();
  if (!donor) throw AppError.validation([{ field: 'body.donorId', message: 'Donor not found' }]);
  if (donor.verificationStatus === 'REJECTED' || donor.verificationStatus === 'SUSPENDED') {
    throw AppError.conflict(
      `This donor's profile is ${donor.verificationStatus.toLowerCase()}; donations cannot be recorded.`,
      ERROR_CODES.CONFLICT,
    );
  }

  const collectedAt = new Date(input.collectedAt);
  // Codes are reserved before the transaction so the shared counter is not a write-conflict hot spot.
  const codes = await allocateUnitCodes(bank.code, collectedAt, input.components.length);
  const donationId = new Types.ObjectId();
  const now = new Date();

  await withTransaction(async (session) => {
    await DonationModel.create(
      [
        {
          _id: donationId,
          donorId: donor._id,
          bloodBankId: bank._id,
          collectedAt,
          collectedBy: recordedBy,
          donationType: input.donationType,
          volumeMl: input.volumeMl,
          notes: input.notes ?? null,
        },
      ],
      { session },
    );
    await BloodUnitModel.insertMany(
      input.components.map((componentType, i) => ({
        unitCode: codes[i],
        donationId,
        donorId: donor._id,
        bloodBankId: bank._id,
        // Declared group until the laboratory result is recorded.
        bloodGroup: donor.bloodGroup,
        componentType,
        volumeMl: componentType === 'WHOLE_BLOOD' ? input.volumeMl : null,
        collectedAt,
        expiryDate: computeExpiryDate(collectedAt, componentType, env.SHELF_LIFE_DAYS),
        storageLocation: input.storageLocation ?? null,
        status: 'COLLECTED',
        statusHistory: [
          { from: null, to: 'COLLECTED', at: now, by: actor.userId, reason: null, override: false },
        ],
      })),
      { session },
    );
    await DonorProfileModel.updateOne(
      { _id: donor._id },
      { $inc: { donationCount: 1 }, $max: { lastDonationAt: collectedAt } },
      { session },
    );
    await recordAudit(
      actor,
      {
        action: 'DONATION_RECORDED',
        entityType: 'Donation',
        entityId: donationId,
        after: {
          donorId: donor._id.toString(),
          bloodBankId: bank._id.toString(),
          components: input.components,
          unitCodes: codes,
        },
      },
      session,
    );
  });

  return getDonation(actor, donationId.toString());
}

// ─── Testing ─────────────────────────────────────────────────────────────────

async function loadDonationForWrite(actor: Actor, id: string) {
  const donation = await DonationModel.findById(id).lean();
  if (!donation) throw AppError.notFound('Donation');
  assertCanManageBank(actor, donation.bloodBankId);
  return donation;
}

export async function startTesting(actor: Actor, id: string) {
  const donation = await loadDonationForWrite(actor, id);
  await withTransaction(async (session) => {
    const units = await BloodUnitModel.find({ donationId: donation._id, status: 'COLLECTED' })
      .session(session)
      .lean();
    if (!units.length) {
      throw AppError.conflict(
        'No collected units are waiting to be tested.',
        ERROR_CODES.INVALID_STATE_TRANSITION,
      );
    }
    for (const unit of units) {
      await transitionUnit({ unit, to: 'UNDER_TESTING', by: 'STAFF', actor, session });
    }
    await recordAudit(
      actor,
      {
        action: 'DONATION_TESTING_STARTED',
        entityType: 'Donation',
        entityId: donation._id,
        after: { units: units.length },
      },
      session,
    );
  });
  return getDonation(actor, id);
}

/**
 * Applies a laboratory result to every unit of the donation currently under testing.
 * PASSED releases them to inventory with the tested blood group (which also confirms the donor's
 * group); FAILED discards them. The donor never sees test results through the platform.
 */
export async function recordTestResult(actor: Actor, id: string, input: RecordTestResultInput) {
  const donation = await loadDonationForWrite(actor, id);

  await withTransaction(async (session) => {
    const units = await BloodUnitModel.find({ donationId: donation._id, status: 'UNDER_TESTING' })
      .session(session)
      .lean();
    if (!units.length) {
      throw AppError.conflict(
        'No units of this donation are under testing. Send them to testing first.',
        ERROR_CODES.INVALID_STATE_TRANSITION,
      );
    }

    if (input.result === 'PASSED') {
      const testedGroup = input.bloodGroup!;
      const donor = await DonorProfileModel.findById(donation.donorId).session(session).lean();
      if (donor?.bloodGroupConfirmed && donor.bloodGroup !== testedGroup) {
        // Units stay under testing: a mismatch with a previously confirmed group needs investigation.
        throw AppError.conflict(
          `Tested group ${testedGroup} differs from the donor's confirmed group ${donor.bloodGroup}. ` +
            'Investigate before releasing these units.',
          ERROR_CODES.CONFLICT,
        );
      }
      if (donor && !donor.bloodGroupConfirmed) {
        await DonorProfileModel.updateOne(
          { _id: donor._id },
          {
            $set: {
              bloodGroup: testedGroup,
              bloodGroupConfirmed: true,
              bloodGroupConfirmedBy: actor.userId,
              bloodGroupConfirmedAt: new Date(),
            },
          },
          { session },
        );
        await recordAudit(
          actor,
          {
            action: 'DONOR_BLOOD_GROUP_CONFIRMED',
            entityType: 'DonorProfile',
            entityId: donor._id,
            before: { bloodGroup: donor.bloodGroup, bloodGroupConfirmed: false },
            after: { bloodGroup: testedGroup, bloodGroupConfirmed: true },
            reason: 'Confirmed by laboratory testing of a donation',
          },
          session,
        );
      }
      for (const unit of units) {
        await transitionUnit({
          unit,
          to: 'AVAILABLE',
          by: 'TESTING',
          actor,
          set: { testingStatus: 'PASSED', bloodGroup: testedGroup },
          session,
        });
      }
    } else {
      for (const unit of units) {
        await transitionUnit({
          unit,
          to: 'DISCARDED',
          by: 'TESTING',
          actor,
          reason: `Failed testing: ${input.note}`,
          set: { testingStatus: 'FAILED' },
          session,
        });
      }
    }

    await DonationModel.updateOne(
      { _id: donation._id },
      {
        $set: {
          testingStatus: input.result,
          testedAt: new Date(),
          testedBy: actor.userId,
          testedBloodGroup: input.result === 'PASSED' ? input.bloodGroup : null,
          testNote: input.note ?? null,
        },
      },
      { session },
    );
    await recordAudit(
      actor,
      {
        action: 'DONATION_TEST_RESULT_RECORDED',
        entityType: 'Donation',
        entityId: donation._id,
        after: { result: input.result, bloodGroup: input.bloodGroup ?? null, units: units.length },
        reason: input.note ?? null,
      },
      session,
    );
  });
  return getDonation(actor, id);
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export async function listDonations(query: ListDonationsQuery) {
  const filter: QueryFilter<Donation> = {};
  if (query.bloodBankId) filter.bloodBankId = query.bloodBankId;
  if (query.donorId) filter.donorId = query.donorId;
  if (query.testingStatus) filter.testingStatus = query.testingStatus;
  if (query.from || query.to) {
    filter.collectedAt = {
      ...(query.from && { $gte: new Date(query.from) }),
      ...(query.to && { $lt: new Date(new Date(query.to).getTime() + DAY_MS) }),
    };
  }
  const [donations, total] = await Promise.all([
    DonationModel.find(filter)
      .sort({ collectedAt: -1 })
      .skip(pageToSkip(query))
      .limit(query.limit)
      .lean(),
    DonationModel.countDocuments(filter),
  ]);
  const counts = await BloodUnitModel.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { donationId: { $in: donations.map((d) => d._id) } } },
    { $group: { _id: '$donationId', n: { $sum: 1 } } },
  ]);
  const countById = new Map(counts.map((c) => [c._id.toString(), c.n]));
  const lookups = await loadLookups({
    banks: donations.map((d) => d.bloodBankId),
    users: donations.map((d) => d.collectedBy),
    donors: donations.map((d) => d.donorId),
  });
  return {
    items: donations.map((d) =>
      toDonationSummary(d, countById.get(d._id.toString()) ?? 0, lookups),
    ),
    meta: buildPaginationMeta(query, total),
  };
}

export async function getDonation(actor: Actor, id: string): Promise<DonationDetail> {
  const donation = await DonationModel.findById(id).lean();
  if (!donation) throw AppError.notFound('Donation');
  const units = await BloodUnitModel.find({ donationId: donation._id })
    .sort({ unitCode: 1 })
    .lean();
  const lookups = await loadLookups({
    banks: [donation.bloodBankId],
    users: [donation.collectedBy, donation.testedBy],
    donors: [donation.donorId],
  });
  const canManage = canManageBank(actor, donation.bloodBankId);
  return {
    ...toDonationSummary(donation, units.length, lookups),
    units: units.map((unit) => toUnitSummary(unit, lookups)),
    testedAt: donation.testedAt?.toISOString() ?? null,
    testedBy: lookups.user(donation.testedBy),
    testedBloodGroup: donation.testedBloodGroup,
    testNote: donation.testNote,
    notes: donation.notes,
    canStartTesting: canManage && units.some((u) => u.status === 'COLLECTED'),
    canRecordResult: canManage && units.some((u) => u.status === 'UNDER_TESTING'),
    canManage,
  };
}

/** A donor's own history: date, place and type only — never test results or unit details. */
export async function listOwnDonations(actor: Actor): Promise<DonorDonationView[]> {
  const donor = await DonorProfileModel.findOne({ userId: actor.userId }).select('_id').lean();
  if (!donor) throw AppError.notFound('Donor profile');
  const donations = await DonationModel.find({ donorId: donor._id })
    .sort({ collectedAt: -1 })
    .limit(100)
    .lean();
  const banks = await BloodBankModel.find({ _id: { $in: donations.map((d) => d.bloodBankId) } })
    .select('name address.city')
    .lean();
  const bankById = new Map(banks.map((b) => [b._id.toString(), b]));
  return donations.map((d) => {
    const bank = bankById.get(d.bloodBankId.toString());
    return {
      id: d._id.toString(),
      collectedAt: d.collectedAt.toISOString(),
      donationType: d.donationType,
      bloodBankName: bank?.name ?? 'Blood bank',
      city: bank?.address.city ?? '',
    };
  });
}
