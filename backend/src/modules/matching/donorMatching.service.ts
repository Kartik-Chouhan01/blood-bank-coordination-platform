import type { QueryFilter, Types } from 'mongoose';
import {
  ERROR_CODES,
  POTENTIAL_DONOR_LABEL,
  type DonorCandidate,
  type DonorCandidates,
  type StartOutreachInput,
} from '@bbms/shared';
import { settings } from '../settings/settings.service.js';
import { logger } from '../../config/logger.js';
import { effectiveAvailabilityFilter } from '../../domain/donors/availability.js';
import { offeredDonorGroups } from '../../domain/matching/compatibility.js';
import { scoreDonor } from '../../domain/matching/ranking.js';
import { ALLOCATABLE_REQUEST_STATUSES } from '../../domain/requests/requestStateMachine.js';
import { AppError } from '../../utils/AppError.js';
import { SYSTEM_ACTOR, type Actor } from '../../utils/actor.js';
import { withTransaction } from '../../utils/mongoose.js';
import { recordAudit } from '../audit/audit.service.js';
import * as notify from '../notifications/notify.js';
import { DonorProfileModel, cityKeyOf, type DonorProfile } from '../donors/donorProfile.model.js';
import { HospitalModel } from '../hospitals/hospital.model.js';
import { BloodRequestModel, type BloodRequest } from '../requests/bloodRequest.model.js';
import { UserModel } from '../users/user.model.js';
import { countUsableStock } from './allocations.service.js';
import { DonorOutreachModel } from './donorOutreach.model.js';

const DAY_MS = 86_400_000;
/** Upper bound on donors examined per search; ranking happens in memory. */
const SEARCH_POOL = 500;
/** Candidates returned to staff for choosing. */
const DISPLAY_LIMIT = 100;

interface ScoredDonor extends DonorCandidate {
  _id: Types.ObjectId;
}

interface Search {
  request: BloodRequest;
  shortfall: number;
  radiusKm: number;
  searchedBy: 'DISTANCE' | 'CITY';
  /** Every donor passing the hard filters, best first. */
  ranked: ScoredDonor[];
}

async function loadAllocatableRequest(requestId: string | Types.ObjectId) {
  const request = await BloodRequestModel.findById(requestId).lean();
  if (!request) throw AppError.notFound('Request');
  if (!ALLOCATABLE_REQUEST_STATUSES.includes(request.status)) {
    throw AppError.conflict(
      'Potential donors can be contacted only for approved requests that still need units.',
      ERROR_CODES.INVALID_STATE_TRANSITION,
    );
  }
  const shortfall = request.unitsRequested - request.unitsAllocated;
  if (shortfall <= 0) {
    throw AppError.conflict('Every requested unit is already allocated.', ERROR_CODES.CONFLICT);
  }
  return { request, shortfall };
}

/** How many donors the system suggests contacting for a given number of missing units. */
export const suggestedOutreachCount = (missingUnits: number) =>
  Math.min(
    settings().outreachMaxDonors,
    Math.max(0, missingUnits) * settings().outreachDonorsPerUnit,
  );

/**
 * Applies every hard filter ("system criteria") and ranks the donors who pass. Filters: compatible
 * group, effectively available, verified, active account, contact interval elapsed by required-by,
 * preferences allow contact for this urgency, weekly contact cap not reached, not already contacted
 * for this request, and within the search radius (or the hospital's city when it has no location).
 */
async function searchDonors(request: BloodRequest, shortfall: number): Promise<Search> {
  const now = new Date();
  const hospital = await HospitalModel.findById(request.hospitalId).lean();
  if (!hospital) throw AppError.notFound('Hospital');

  const emergency = request.urgency === 'EMERGENCY';
  const radiusKm = emergency
    ? settings().emergencyDonorSearchRadiusKm
    : settings().donorSearchRadiusKm;
  const groups = offeredDonorGroups(
    request.bloodGroup,
    request.componentType,
    settings().allowCompatibleSubstitutes,
  );
  const lastAllowedDonation = new Date(
    request.requiredBy.getTime() - settings().donorContactIntervalDays * DAY_MS,
  );
  const alreadyContacted = await DonorOutreachModel.distinct('donorId', { requestId: request._id });

  const filter: QueryFilter<DonorProfile> = {
    _id: { $nin: alreadyContacted },
    bloodGroup: { $in: groups },
    verificationStatus: 'VERIFIED',
    'notificationPreferences.maxContactsPerWeek': { $gt: 0 },
    ...(!emergency && { 'notificationPreferences.emergencyOnly': false }),
    $and: [
      effectiveAvailabilityFilter('AVAILABLE', now) as QueryFilter<DonorProfile>,
      { $or: [{ lastDonationAt: null }, { lastDonationAt: { $lte: lastAllowedDonation } }] },
      {
        $or: [{ 'notificationPreferences.inApp': true }, { 'notificationPreferences.email': true }],
      },
    ],
  };

  const cityKey = cityKeyOf(hospital.address.city);
  const point = hospital.location?.coordinates?.length ? hospital.location : null;
  let found: (DonorProfile & { distanceM?: number })[];
  if (point) {
    const [near, sameCityNoLocation] = await Promise.all([
      DonorProfileModel.aggregate<DonorProfile & { distanceM: number }>([
        {
          $geoNear: {
            near: point,
            distanceField: 'distanceM',
            maxDistance: radiusKm * 1000,
            key: 'location.point',
            spherical: true,
            query: filter,
          },
        },
        { $limit: SEARCH_POOL },
      ]),
      // Donors who never shared an approximate location are still reachable within the same city.
      DonorProfileModel.find({
        ...filter,
        'location.cityKey': cityKey,
        'location.point.coordinates': { $exists: false },
      })
        .limit(SEARCH_POOL)
        .lean(),
    ]);
    found = [...near, ...sameCityNoLocation];
  } else {
    found = await DonorProfileModel.find({ ...filter, 'location.cityKey': cityKey })
      .limit(SEARCH_POOL)
      .lean();
  }
  if (!found.length) {
    return { request, shortfall, radiusKm, searchedBy: point ? 'DISTANCE' : 'CITY', ranked: [] };
  }

  const donorIds = found.map((d) => d._id);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const [activeUsers, recentContacts, history] = await Promise.all([
    UserModel.find({ _id: { $in: found.map((d) => d.userId) }, accountStatus: 'ACTIVE' })
      .select('_id')
      .lean(),
    DonorOutreachModel.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { donorId: { $in: donorIds }, notifiedAt: { $gte: weekAgo } } },
      { $group: { _id: '$donorId', n: { $sum: 1 } } },
    ]),
    DonorOutreachModel.aggregate<{ _id: Types.ObjectId; positive: number; answered: number }>([
      { $match: { donorId: { $in: donorIds }, status: { $ne: 'NOTIFIED' } } },
      {
        $group: {
          _id: '$donorId',
          answered: { $sum: 1 },
          positive: { $sum: { $cond: [{ $in: ['$status', ['INTERESTED', 'DONATED']] }, 1, 0] } },
        },
      },
    ]),
  ]);
  const active = new Set(activeUsers.map((u) => u._id.toString()));
  const contactsThisWeek = new Map(recentContacts.map((r) => [r._id.toString(), r.n]));
  const historyOf = new Map(history.map((h) => [h._id.toString(), h]));

  const ranked = found
    .filter(
      (d) =>
        active.has(d.userId.toString()) &&
        (contactsThisWeek.get(d._id.toString()) ?? 0) <
          d.notificationPreferences.maxContactsPerWeek,
    )
    .map((d): ScoredDonor => {
      const distanceKm = d.distanceM === undefined ? null : Math.round(d.distanceM / 1000);
      const contactAllowedSince = d.lastDonationAt
        ? d.lastDonationAt.getTime() + settings().donorContactIntervalDays * DAY_MS
        : d.createdAt.getTime();
      const past = historyOf.get(d._id.toString());
      return {
        _id: d._id,
        donorId: d._id.toString(),
        bloodGroup: d.bloodGroup,
        bloodGroupConfirmed: d.bloodGroupConfirmed,
        groupMatch: d.bloodGroup === request.bloodGroup ? 'EXACT' : 'COMPATIBLE',
        city: d.location.city,
        area: d.location.area,
        approxDistanceKm: distanceKm,
        availability: 'AVAILABLE',
        score: scoreDonor({
          exactGroup: d.bloodGroup === request.bloodGroup,
          bloodGroupConfirmed: d.bloodGroupConfirmed,
          distanceKm,
          radiusKm,
          daysSinceContactAllowed: (now.getTime() - contactAllowedSince) / DAY_MS,
          history: { positive: past?.positive ?? 0, answered: past?.answered ?? 0 },
        }),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.approxDistanceKm ?? Infinity) - (b.approxDistanceKm ?? Infinity) ||
        a.donorId.localeCompare(b.donorId),
    );

  return { request, shortfall, radiusKm, searchedBy: point ? 'DISTANCE' : 'CITY', ranked };
}

export async function findDonorCandidates(requestId: string): Promise<DonorCandidates> {
  const { request, shortfall } = await loadAllocatableRequest(requestId);
  const search = await searchDonors(request, shortfall);
  return {
    requestId,
    shortfall,
    suggestedCount: suggestedOutreachCount(shortfall),
    radiusKm: search.radiusKm,
    searchedBy: search.searchedBy,
    candidates: search.ranked
      .slice(0, DISPLAY_LIMIT)
      .map(({ _id: _omit, ...candidate }) => candidate),
    label: POTENTIAL_DONOR_LABEL,
  };
}

/** Records the outreach for the chosen donors. Returns how many were contacted. */
async function contactDonors(actor: Actor, search: Search, donorIds: string[]) {
  const { request } = search;
  const eligible = new Map(search.ranked.map((d) => [d.donorId, d]));
  const chosen = donorIds.map((id) => eligible.get(id));
  if (chosen.some((d) => !d)) {
    throw AppError.conflict(
      'Some selected donors no longer match the criteria or were already contacted. Search again.',
    );
  }
  const already = await DonorOutreachModel.countDocuments({ requestId: request._id });
  if (already + chosen.length > settings().outreachMaxDonors) {
    throw AppError.conflict(
      `At most ${settings().outreachMaxDonors} donors can be contacted per request (${already} already contacted).`,
    );
  }

  const now = new Date();
  let created: Types.ObjectId[] = [];
  try {
    await withTransaction(async (session) => {
      const docs = await DonorOutreachModel.insertMany(
        chosen.map((d) => ({
          requestId: request._id,
          donorId: d!._id,
          score: d!.score,
          approxDistanceKm: d!.approxDistanceKm,
          status: 'NOTIFIED',
          notifiedBy: actor.userId,
          notifiedAt: now,
        })),
        { session },
      );
      created = docs.map((d) => d._id);
      await BloodRequestModel.updateOne(
        { _id: request._id },
        { $set: { outreachStatus: 'ACTIVE' } },
        { session },
      );
      await recordAudit(
        actor,
        {
          action: 'DONOR_OUTREACH_STARTED',
          entityType: 'BloodRequest',
          entityId: request._id,
          after: { donorsContacted: chosen.length, totalContacted: already + chosen.length },
        },
        session,
      );
    });
  } catch (err) {
    if ((err as { code?: unknown }).code === 11000) {
      throw AppError.conflict('Some of these donors were just contacted by someone else.');
    }
    throw err;
  }
  await notify.donorsContacted(created);
  return chosen.length;
}

export async function startOutreach(actor: Actor, requestId: string, input: StartOutreachInput) {
  const { request, shortfall } = await loadAllocatableRequest(requestId);
  return contactDonors(actor, await searchDonors(request, shortfall), input.donorIds);
}

/**
 * Emergency requests contact potential donors automatically, but only when compatible stock cannot
 * cover them. Runs after the request is committed; a failure here never undoes the request.
 */
export async function autoOutreachIfShort(requestId: Types.ObjectId) {
  try {
    const request = await BloodRequestModel.findById(requestId).lean();
    if (
      !request ||
      request.urgency !== 'EMERGENCY' ||
      !ALLOCATABLE_REQUEST_STATUSES.includes(request.status)
    ) {
      return 0;
    }
    const shortfall = request.unitsRequested - request.unitsAllocated;
    const stock = await countUsableStock(request);
    const missing = shortfall - stock.exact - stock.compatibleSubstitutes;
    if (missing <= 0) return 0;

    const search = await searchDonors(request, shortfall);
    const already = await DonorOutreachModel.countDocuments({ requestId });
    const count = Math.min(suggestedOutreachCount(missing), settings().outreachMaxDonors - already);
    const picks = search.ranked.slice(0, Math.max(0, count)).map((d) => d.donorId);
    if (!picks.length) return 0;
    return await contactDonors(SYSTEM_ACTOR, search, picks);
  } catch (err) {
    logger.error({ err, requestId: requestId.toString() }, 'Automatic donor outreach failed');
    return 0;
  }
}
