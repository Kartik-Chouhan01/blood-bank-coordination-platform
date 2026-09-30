import { Types, type QueryFilter } from 'mongoose';
import {
  coarsenCoordinate,
  ERROR_CODES,
  type ConfirmBloodGroupInput,
  type ListDonorsQuery,
  type NotificationPreferences,
  type UpdateAvailabilityInput,
  type UpdateDonorProfileInput,
  type UpdateDonorVerificationInput,
} from '@bbms/shared';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import { withTransaction } from '../../utils/mongoose.js';
import { buildPaginationMeta, escapeRegex, pageToSkip } from '../../utils/pagination.js';
import { effectiveAvailabilityFilter } from '../../domain/donors/availability.js';
import { recordAudit } from '../audit/audit.service.js';
import { UserModel } from '../users/user.model.js';
import {
  AVAILABILITY_HISTORY_LIMIT,
  DonorProfileModel,
  cityKeyOf,
  type DonorProfile,
} from './donorProfile.model.js';
import { toDonorSelfView, toDonorStaffDetail, toDonorStaffSummary } from './donor.presenter.js';

/** Search results are capped so a vague name search cannot trigger a huge `$in` list. */
const MAX_NAME_MATCHES = 500;

async function findOwnProfile(actor: Actor): Promise<DonorProfile> {
  const donor = await DonorProfileModel.findOne({ userId: actor.userId }).lean();
  // Every DONOR account gets a profile at registration; a missing one is a data problem.
  if (!donor) throw AppError.notFound('Donor profile');
  return donor;
}

// ─── Donor self-service ──────────────────────────────────────────────────────

export async function getOwnProfile(actor: Actor) {
  return toDonorSelfView(await findOwnProfile(actor));
}

export async function updateOwnProfile(actor: Actor, input: UpdateDonorProfileInput) {
  const current = await findOwnProfile(actor);

  if (input.bloodGroup && input.bloodGroup !== current.bloodGroup && current.bloodGroupConfirmed) {
    throw AppError.conflict(
      'Your blood group has been confirmed by blood-bank staff. Contact them if it needs correcting.',
      ERROR_CODES.CONFLICT,
    );
  }

  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};
  if (input.city !== undefined) {
    set['location.city'] = input.city;
    set['location.cityKey'] = cityKeyOf(input.city);
  }
  if (input.area !== undefined) set['location.area'] = input.area;
  if (input.bloodGroup !== undefined) set.bloodGroup = input.bloodGroup;
  if (input.approximateLocation === null) unset['location.point'] = '';
  else if (input.approximateLocation) {
    // Precision is reduced before storage; the precise value never touches the database.
    set['location.point'] = {
      type: 'Point',
      coordinates: [
        coarsenCoordinate(input.approximateLocation.longitude),
        coarsenCoordinate(input.approximateLocation.latitude),
      ],
    };
  }

  const updated = await withTransaction(async (session) => {
    const donor = await DonorProfileModel.findOneAndUpdate(
      { _id: current._id },
      {
        ...(Object.keys(set).length && { $set: set }),
        ...(Object.keys(unset).length && { $unset: unset }),
      },
      { session, returnDocument: 'after' },
    ).lean();
    await recordAudit(
      actor,
      {
        action: 'DONOR_PROFILE_UPDATED',
        entityType: 'DonorProfile',
        entityId: current._id,
        // Coordinates are never written to the audit trail — only whether they changed.
        before: {
          city: current.location.city,
          area: current.location.area,
          bloodGroup: current.bloodGroup,
          hasApproximateLocation: !!current.location.point?.coordinates?.length,
        },
        after: {
          city: donor!.location.city,
          area: donor!.location.area,
          bloodGroup: donor!.bloodGroup,
          hasApproximateLocation: !!donor!.location.point?.coordinates?.length,
        },
      },
      session,
    );
    return donor!;
  });
  return toDonorSelfView(updated);
}

/** Availability is the donor's consent to be contacted, so every change is also audited. */
export async function updateOwnAvailability(actor: Actor, input: UpdateAvailabilityInput) {
  const availableAgainAt = input.availableAgainAt ? new Date(input.availableAgainAt) : null;
  const donor = await withTransaction(async (session) => {
    const before = await DonorProfileModel.findOne({ userId: actor.userId })
      .select('availabilityStatus')
      .session(session)
      .lean();
    if (!before) throw AppError.notFound('Donor profile');
    const updated = await DonorProfileModel.findOneAndUpdate(
      { _id: before._id },
      {
        $set: { availabilityStatus: input.status, availableAgainAt },
        $push: {
          availabilityHistory: {
            $each: [{ status: input.status, changedAt: new Date(), availableAgainAt }],
            $slice: -AVAILABILITY_HISTORY_LIMIT,
          },
        },
      },
      { returnDocument: 'after', session },
    ).lean();
    await recordAudit(
      actor,
      {
        action: 'DONOR_AVAILABILITY_CHANGED',
        entityType: 'DonorProfile',
        entityId: before._id,
        before: { availabilityStatus: before.availabilityStatus },
        after: {
          availabilityStatus: input.status,
          availableAgainAt: availableAgainAt?.toISOString() ?? null,
        },
      },
      session,
    );
    return updated!;
  });
  return toDonorSelfView(donor);
}

/** Contact preferences are consent: audited with the before/after choices (no personal data). */
export async function updateOwnNotificationPreferences(
  actor: Actor,
  input: NotificationPreferences,
) {
  const donor = await withTransaction(async (session) => {
    const before = await DonorProfileModel.findOne({ userId: actor.userId })
      .select('notificationPreferences')
      .session(session)
      .lean();
    if (!before) throw AppError.notFound('Donor profile');
    const updated = await DonorProfileModel.findOneAndUpdate(
      { _id: before._id },
      { $set: { notificationPreferences: input } },
      { returnDocument: 'after', runValidators: true, session },
    ).lean();
    await recordAudit(
      actor,
      {
        action: 'DONOR_CONTACT_PREFERENCES_CHANGED',
        entityType: 'DonorProfile',
        entityId: before._id,
        before: { ...before.notificationPreferences },
        after: { ...input },
      },
      session,
    );
    return updated!;
  });
  return toDonorSelfView(donor);
}

// ─── Staff ───────────────────────────────────────────────────────────────────

export async function listDonors(query: ListDonorsQuery) {
  const filter: QueryFilter<DonorProfile> = {};
  if (query.bloodGroup) filter.bloodGroup = query.bloodGroup;
  if (query.verificationStatus) filter.verificationStatus = query.verificationStatus;
  if (query.bloodGroupConfirmed) filter.bloodGroupConfirmed = query.bloodGroupConfirmed === 'true';
  if (query.city) filter['location.cityKey'] = cityKeyOf(query.city);
  if (query.availability) Object.assign(filter, effectiveAvailabilityFilter(query.availability));
  if (query.search) {
    const matches = await UserModel.find({
      role: 'DONOR',
      name: new RegExp(escapeRegex(query.search), 'i'),
    })
      .select('_id')
      .limit(MAX_NAME_MATCHES)
      .lean();
    filter.userId = { $in: matches.map((user) => user._id) };
  }

  const [donors, total] = await Promise.all([
    DonorProfileModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(pageToSkip(query))
      .limit(query.limit)
      .lean(),
    DonorProfileModel.countDocuments(filter),
  ]);
  const owners = await UserModel.find({ _id: { $in: donors.map((d) => d.userId) } })
    .select('name accountStatus')
    .lean();
  const ownerById = new Map(owners.map((owner) => [owner._id.toString(), owner]));

  return {
    items: donors.map((donor) =>
      toDonorStaffSummary(donor, ownerById.get(donor.userId.toString())),
    ),
    meta: buildPaginationMeta(query, total),
  };
}

async function findDonorForStaff(id: string) {
  const donor = await DonorProfileModel.findById(id).lean();
  if (!donor) throw AppError.notFound('Donor');
  const owner = await UserModel.findById(donor.userId).select('name accountStatus').lean();
  return { donor, owner: owner ?? undefined };
}

export async function getDonorForStaff(id: string) {
  const { donor, owner } = await findDonorForStaff(id);
  return toDonorStaffDetail(donor, owner);
}

export async function updateDonorVerification(
  actor: Actor,
  id: string,
  input: UpdateDonorVerificationInput,
) {
  const donorId = new Types.ObjectId(id);
  return withTransaction(async (session) => {
    const before = await DonorProfileModel.findById(donorId).session(session).lean();
    if (!before) throw AppError.notFound('Donor');

    const after = await DonorProfileModel.findOneAndUpdate(
      { _id: donorId },
      { $set: { verificationStatus: input.status } },
      { session, returnDocument: 'after' },
    ).lean();
    await recordAudit(
      actor,
      {
        action: 'DONOR_VERIFICATION_CHANGED',
        entityType: 'DonorProfile',
        entityId: donorId,
        before: { verificationStatus: before.verificationStatus },
        after: { verificationStatus: input.status },
        reason: input.reason ?? null,
      },
      session,
    );
    const owner = await UserModel.findById(after!.userId)
      .select('name accountStatus')
      .session(session)
      .lean();
    return toDonorStaffDetail(after!, owner ?? undefined);
  });
}

/**
 * Records a staff-confirmed blood group (typically from a lab result). Correcting a donor's
 * declared group requires a note explaining why.
 */
export async function confirmDonorBloodGroup(
  actor: Actor,
  id: string,
  input: ConfirmBloodGroupInput,
) {
  const donorId = new Types.ObjectId(id);
  return withTransaction(async (session) => {
    const before = await DonorProfileModel.findById(donorId).session(session).lean();
    if (!before) throw AppError.notFound('Donor');

    if (input.bloodGroup !== before.bloodGroup && !input.note) {
      throw AppError.validation([
        {
          field: 'body.note',
          message: 'Explain why the blood group differs from the declared one',
        },
      ]);
    }

    const after = await DonorProfileModel.findOneAndUpdate(
      { _id: donorId },
      {
        $set: {
          bloodGroup: input.bloodGroup,
          bloodGroupConfirmed: true,
          bloodGroupConfirmedBy: actor.userId,
          bloodGroupConfirmedAt: new Date(),
        },
      },
      { session, returnDocument: 'after' },
    ).lean();
    await recordAudit(
      actor,
      {
        action: 'DONOR_BLOOD_GROUP_CONFIRMED',
        entityType: 'DonorProfile',
        entityId: donorId,
        before: { bloodGroup: before.bloodGroup, bloodGroupConfirmed: before.bloodGroupConfirmed },
        after: { bloodGroup: input.bloodGroup, bloodGroupConfirmed: true },
        reason: input.note ?? null,
      },
      session,
    );
    const owner = await UserModel.findById(after!.userId)
      .select('name accountStatus')
      .session(session)
      .lean();
    return toDonorStaffDetail(after!, owner ?? undefined);
  });
}
