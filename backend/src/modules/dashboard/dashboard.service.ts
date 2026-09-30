import { Types, type PipelineStage } from 'mongoose';
import {
  BLOOD_GROUPS,
  CLOSED_REQUEST_STATUSES,
  OPEN_REQUEST_STATUSES,
  URGENCY_LEVELS,
  hasPermission,
  type AnalyticsBucket,
  type AnalyticsQuery,
  type AnalyticsReport,
  type BloodGroup,
  type HospitalDashboard,
  type OverviewQuery,
  type PublicStats,
  type StaffOverview,
  type Urgency,
} from '@bbms/shared';
import { env } from '../../config/env.js';
import {
  bucketFor,
  bucketKeys,
  median,
  rate,
  stockLevel,
} from '../../domain/analytics/analytics.js';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import { BloodBankModel } from '../bloodBanks/bloodBank.model.js';
import { DonorProfileModel } from '../donors/donorProfile.model.js';
import { HospitalModel } from '../hospitals/hospital.model.js';
import { BloodUnitModel } from '../inventory/bloodUnit.model.js';
import { DonationModel } from '../inventory/donation.model.js';
import { AllocationModel } from '../matching/allocation.model.js';
import { DonorOutreachModel } from '../matching/donorOutreach.model.js';
import { BloodRequestModel } from '../requests/bloodRequest.model.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

type Counted<K> = { _id: K; n: number };
const countMap = <K extends string>(rows: Counted<K>[]) =>
  new Map(rows.map((r) => [r._id, r.n] as const));

/** Usable stock: available, tested and in date (never trusting the expiry sweep to have run). */
const usable = (now: Date) =>
  ({
    status: 'AVAILABLE',
    testingStatus: 'PASSED',
    expiryDate: { $gt: now },
  }) as const;

async function bankRef(bloodBankId: Types.ObjectId | null) {
  if (!bloodBankId) return null;
  const bank = await BloodBankModel.findById(bloodBankId).select('name').lean();
  if (!bank) throw AppError.notFound('Blood bank');
  return { id: bank._id.toString(), name: bank.name };
}

// ─── Public ──────────────────────────────────────────────────────────────────

const PUBLIC_CACHE_MS = 5 * 60_000;
let publicCache: { at: number; value: PublicStats } | null = null;

/** Red-cell-bearing components: what "is my blood group needed?" means to the public. */
const RED_CELL_COMPONENTS = ['PRBC', 'WHOLE_BLOOD'];

/**
 * Coarse network-wide stock levels per blood group, cached for five minutes so the public
 * endpoint cannot be used to hammer the database or to watch stock move unit by unit.
 */
export async function getPublicStats(now = new Date()): Promise<PublicStats> {
  if (publicCache && now.getTime() - publicCache.at < PUBLIC_CACHE_MS) return publicCache.value;
  const rows = await BloodUnitModel.aggregate<Counted<BloodGroup>>([
    { $match: { ...usable(now), componentType: { $in: RED_CELL_COMPONENTS } } },
    { $group: { _id: '$bloodGroup', n: { $sum: 1 } } },
  ]);
  const units = countMap(rows);
  const value: PublicStats = {
    stock: BLOOD_GROUPS.map((bloodGroup) => ({
      bloodGroup,
      level: stockLevel(
        units.get(bloodGroup) ?? 0,
        env.PUBLIC_STOCK_LOW_BELOW,
        env.PUBLIC_STOCK_GOOD_FROM,
      ),
    })),
    updatedAt: now.toISOString(),
  };
  publicCache = { at: now.getTime(), value };
  return value;
}

/** For tests. */
export const clearPublicStatsCache = () => {
  publicCache = null;
};

// ─── Staff overview ──────────────────────────────────────────────────────────

/** Staff default to their own bank's stock; administrators to the whole network. */
function scopeBank(actor: Actor, requested?: string) {
  if (requested) return new Types.ObjectId(requested);
  return actor.role === 'BLOOD_BANK_STAFF' ? (actor.bloodBankId ?? null) : null;
}

export async function getStaffOverview(actor: Actor, query: OverviewQuery): Promise<StaffOverview> {
  const now = new Date();
  const bankId = scopeBank(actor, query.bloodBankId);
  const bankScope = bankId ? { bloodBankId: bankId } : {};
  const open = { status: { $in: [...OPEN_REQUEST_STATUSES] } };
  const soon = new Date(now.getTime() + env.EXPIRY_WARNING_DAYS * DAY_MS);
  const canVerifyHospitals =
    actor.role !== 'SYSTEM' && hasPermission(actor.role, 'hospitals:verify');

  const [
    bank,
    openCount,
    pendingReview,
    overdue,
    byUrgency,
    stock,
    expiringSoon,
    awaitingIssue,
    awaitingReply,
    interested,
    hospitalsPending,
    donorsPending,
  ] = await Promise.all([
    bankRef(bankId),
    BloodRequestModel.countDocuments(open),
    BloodRequestModel.countDocuments({ status: 'PENDING' }),
    BloodRequestModel.countDocuments({ ...open, requiredBy: { $lte: now } }),
    BloodRequestModel.aggregate<Counted<Urgency>>([
      { $match: open },
      { $group: { _id: '$urgency', n: { $sum: 1 } } },
    ]),
    BloodUnitModel.aggregate<Counted<BloodGroup>>([
      { $match: { ...bankScope, ...usable(now) } },
      { $group: { _id: '$bloodGroup', n: { $sum: 1 } } },
    ]),
    BloodUnitModel.countDocuments({
      ...bankScope,
      ...usable(now),
      expiryDate: { $gt: now, $lte: soon },
    }),
    AllocationModel.countDocuments({ ...bankScope, status: 'RESERVED' }),
    DonorOutreachModel.countDocuments({ status: 'NOTIFIED' }),
    DonorOutreachModel.countDocuments({ status: 'INTERESTED' }),
    canVerifyHospitals ? HospitalModel.countDocuments({ verificationStatus: 'PENDING' }) : null,
    DonorProfileModel.countDocuments({ verificationStatus: 'PENDING' }),
  ]);

  const urgency = countMap(byUrgency);
  const units = countMap(stock);
  return {
    requests: {
      open: openCount,
      pendingReview,
      overdue,
      openByUrgency: Object.fromEntries(
        URGENCY_LEVELS.map((u) => [u, urgency.get(u) ?? 0]),
      ) as Record<Urgency, number>,
    },
    stockByGroup: BLOOD_GROUPS.map((bloodGroup) => ({
      bloodGroup,
      units: units.get(bloodGroup) ?? 0,
    })),
    expiringSoon,
    expiryWarningDays: env.EXPIRY_WARNING_DAYS,
    awaitingIssue,
    outreach: { awaitingReply, interested },
    verification: { hospitalsPending, donorsPending },
    bloodBank: bank,
  };
}

// ─── Analytics ───────────────────────────────────────────────────────────────

/** Bucket key for a date field, computed in the platform time zone to match `bucketKeys`. */
function bucketExpr(field: string, bucket: AnalyticsBucket) {
  return {
    $dateToString: {
      format: '%Y-%m-%d',
      timezone: env.APP_TIME_ZONE,
      date: {
        $dateTrunc: {
          date: field,
          unit: bucket,
          timezone: env.APP_TIME_ZONE,
          ...(bucket === 'week' && { startOfWeek: 'monday' }),
        },
      },
    },
  };
}

const perBucket = (match: object, field: string, bucket: AnalyticsBucket): PipelineStage[] => [
  { $match: match },
  { $group: { _id: bucketExpr(field, bucket), n: { $sum: 1 } } },
];

/** Status-history entries reaching `to` inside the window, one row per entry. */
const historyEntries = (
  to: string[],
  from: Date,
  until: Date,
  scope: object = {},
): PipelineStage[] => [
  {
    $match: {
      ...scope,
      statusHistory: { $elemMatch: { to: { $in: to }, at: { $gte: from, $lte: until } } },
    },
  },
  { $unwind: '$statusHistory' },
  {
    $match: {
      'statusHistory.to': { $in: to },
      'statusHistory.at': { $gte: from, $lte: until },
    },
  },
];

export async function getAnalytics(query: AnalyticsQuery): Promise<AnalyticsReport> {
  const to = new Date();
  const from = new Date(to.getTime() - query.days * DAY_MS);
  const bucket = bucketFor(query.days);
  const bankId = query.bloodBankId ? new Types.ObjectId(query.bloodBankId) : null;
  const bankScope = bankId ? { bloodBankId: bankId } : {};
  const window = { $gte: from, $lte: to };

  const [bank, raised, fulfilments, closedRaised, issued, donations, wasted, byGroup, outreach] =
    await Promise.all([
      bankRef(bankId),
      BloodRequestModel.aggregate<{ _id: string; n: number; emergency: number }>([
        { $match: { createdAt: window } },
        {
          $group: {
            _id: bucketExpr('$createdAt', bucket),
            n: { $sum: 1 },
            emergency: { $sum: { $cond: [{ $eq: ['$urgency', 'EMERGENCY'] }, 1, 0] } },
          },
        },
      ]),
      // One row per request fulfilled in the window, with how long it took.
      BloodRequestModel.aggregate<{ bucket: string; hours: number; urgency: Urgency }>([
        ...historyEntries(['FULFILLED'], from, to),
        {
          $project: {
            _id: 0,
            urgency: 1,
            bucket: bucketExpr('$statusHistory.at', bucket),
            hours: { $divide: [{ $subtract: ['$statusHistory.at', '$createdAt'] }, HOUR_MS] },
          },
        },
      ]),
      BloodRequestModel.aggregate<Counted<string>>([
        {
          $match: {
            createdAt: window,
            status: { $in: CLOSED_REQUEST_STATUSES.filter((s) => s !== 'REJECTED') },
          },
        },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      AllocationModel.aggregate<Counted<string>>(
        perBucket(
          { ...bankScope, issuedAt: window, status: { $in: ['ISSUED', 'RECEIVED'] } },
          '$issuedAt',
          bucket,
        ),
      ),
      DonationModel.aggregate<Counted<string>>(
        perBucket({ ...bankScope, collectedAt: window }, '$collectedAt', bucket),
      ),
      BloodUnitModel.aggregate<{ _id: { bucket: string; expired: boolean }; n: number }>([
        ...historyEntries(['EXPIRED', 'DISCARDED'], from, to, bankScope),
        // Disposal of an already-expired unit is not a second loss.
        { $match: { 'statusHistory.from': { $ne: 'EXPIRED' } } },
        {
          $group: {
            _id: {
              bucket: bucketExpr('$statusHistory.at', bucket),
              expired: { $eq: ['$statusHistory.to', 'EXPIRED'] },
            },
            n: { $sum: 1 },
          },
        },
      ]),
      BloodRequestModel.aggregate<{ _id: BloodGroup; requested: number; issued: number }>([
        { $match: { createdAt: window, status: { $ne: 'REJECTED' } } },
        {
          $group: {
            _id: '$bloodGroup',
            requested: { $sum: '$unitsRequested' },
            issued: { $sum: '$unitsIssued' },
          },
        },
      ]),
      DonorOutreachModel.aggregate<{ _id: null; contacted: number; interested: number }>([
        { $match: { notifiedAt: window } },
        {
          $group: {
            _id: null,
            contacted: { $sum: 1 },
            interested: {
              $sum: { $cond: [{ $in: ['$status', ['INTERESTED', 'DONATED']] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

  const raisedBy = new Map(raised.map((r) => [r._id, r.n]));
  const fulfilledBy = new Map<string, number>();
  for (const f of fulfilments) fulfilledBy.set(f.bucket, (fulfilledBy.get(f.bucket) ?? 0) + 1);
  const issuedBy = countMap(issued);
  const donationsBy = countMap(donations);
  const expiredBy = new Map<string, number>();
  let unitsExpired = 0;
  let unitsDiscarded = 0;
  for (const w of wasted) {
    if (w._id.expired) {
      unitsExpired += w.n;
      expiredBy.set(w._id.bucket, (expiredBy.get(w._id.bucket) ?? 0) + w.n);
    } else {
      unitsDiscarded += w.n;
    }
  }

  const closed = countMap(closedRaised);
  const closedTotal = [...closed.values()].reduce((a, b) => a + b, 0);
  const closedFulfilled = (closed.get('FULFILLED') ?? 0) + (closed.get('COMPLETED') ?? 0);
  const unitsIssued = [...issuedBy.values()].reduce((a, b) => a + b, 0);
  const hours = (list: typeof fulfilments) => {
    const m = median(list.map((f) => f.hours));
    return m === null ? null : Math.round(m * 10) / 10;
  };
  const groups = new Map(byGroup.map((g) => [g._id, g]));
  const o = outreach[0];

  return {
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
      days: query.days,
      bucket,
      timeZone: env.APP_TIME_ZONE,
    },
    bloodBank: bank,
    totals: {
      requestsRaised: raised.reduce((a, r) => a + r.n, 0),
      emergencyRequests: raised.reduce((a, r) => a + r.emergency, 0),
      requestsFulfilled: fulfilments.length,
      fulfilmentRate: rate(closedFulfilled, closedTotal),
      medianHoursToFulfil: hours(fulfilments),
      emergencyMedianHoursToFulfil: hours(fulfilments.filter((f) => f.urgency === 'EMERGENCY')),
      unitsIssued,
      donations: [...donationsBy.values()].reduce((a, b) => a + b, 0),
      unitsExpired,
      unitsDiscarded,
      expiryWastageRate: rate(unitsExpired, unitsIssued + unitsExpired),
      donorsContacted: o?.contacted ?? 0,
      donorsInterested: o?.interested ?? 0,
    },
    series: bucketKeys(from, to, bucket, env.APP_TIME_ZONE).map((key) => ({
      bucket: key,
      requestsRaised: raisedBy.get(key) ?? 0,
      requestsFulfilled: fulfilledBy.get(key) ?? 0,
      unitsIssued: issuedBy.get(key) ?? 0,
      donations: donationsBy.get(key) ?? 0,
      unitsExpired: expiredBy.get(key) ?? 0,
    })),
    byBloodGroup: BLOOD_GROUPS.map((bloodGroup) => ({
      bloodGroup,
      unitsRequested: groups.get(bloodGroup)?.requested ?? 0,
      unitsIssued: groups.get(bloodGroup)?.issued ?? 0,
    })),
  };
}

// ─── Hospital ────────────────────────────────────────────────────────────────

const HOSPITAL_WINDOW_DAYS = 90;

export async function getHospitalDashboard(actor: Actor): Promise<HospitalDashboard> {
  const hospital = await HospitalModel.findOne({ userId: actor.userId }).select('_id').lean();
  if (!hospital) throw AppError.notFound('Hospital');
  const to = new Date();
  const from = new Date(to.getTime() - HOSPITAL_WINDOW_DAYS * DAY_MS);
  const own = { hospitalId: hospital._id };

  const [raised, fulfilled, closed, ownRequestIds] = await Promise.all([
    BloodRequestModel.countDocuments({ ...own, createdAt: { $gte: from } }),
    BloodRequestModel.aggregate<{ hours: number }>([
      ...historyEntries(['FULFILLED'], from, to, own),
      {
        $project: {
          _id: 0,
          hours: { $divide: [{ $subtract: ['$statusHistory.at', '$createdAt'] }, HOUR_MS] },
        },
      },
    ]),
    BloodRequestModel.aggregate<Counted<string>>([
      {
        $match: {
          ...own,
          createdAt: { $gte: from },
          status: { $in: CLOSED_REQUEST_STATUSES.filter((s) => s !== 'REJECTED') },
        },
      },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    BloodRequestModel.distinct('_id', own),
  ]);
  const [unitsReceived, awaitingReceipt] = await Promise.all([
    AllocationModel.countDocuments({
      requestId: { $in: ownRequestIds },
      status: 'RECEIVED',
      receivedAt: { $gte: from },
    }),
    AllocationModel.countDocuments({ requestId: { $in: ownRequestIds }, status: 'ISSUED' }),
  ]);

  const closedMap = countMap(closed);
  const closedTotal = [...closedMap.values()].reduce((a, b) => a + b, 0);
  const m = median(fulfilled.map((f) => f.hours));
  return {
    days: HOSPITAL_WINDOW_DAYS,
    requestsRaised: raised,
    requestsFulfilled: fulfilled.length,
    fulfilmentRate: rate(
      (closedMap.get('FULFILLED') ?? 0) + (closedMap.get('COMPLETED') ?? 0),
      closedTotal,
    ),
    medianHoursToFulfil: m === null ? null : Math.round(m * 10) / 10,
    unitsReceived,
    awaitingReceipt,
  };
}
