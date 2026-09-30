import { Types } from 'mongoose';
import {
  ERROR_CODES,
  type AllocationView,
  type InventoryCandidates,
  type ReleaseAllocationInput,
  type ReserveUnitsInput,
} from '@bbms/shared';
import { getCompatibleDonorGroups } from '../../domain/matching/compatibility.js';
import { rankUnits } from '../../domain/matching/ranking.js';
import { daysToExpiry } from '../../domain/inventory/expiry.js';
import { ALLOCATABLE_REQUEST_STATUSES } from '../../domain/requests/requestStateMachine.js';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import { withTransaction } from '../../utils/mongoose.js';
import { BloodUnitModel } from '../inventory/bloodUnit.model.js';
import { loadLookups } from '../inventory/inventory.presenter.js';
import { assertCanManageBank, canManageBank } from '../inventory/unitTransitions.js';
import { BloodRequestModel, type BloodRequest } from '../requests/bloodRequest.model.js';
import { AllocationModel } from './allocation.model.js';
import {
  issueAllocationInSession,
  releaseAllocationInSession,
  reserveUnitsInSession,
  usableUntil,
} from './allocationWorkflow.js';

/** Candidate lists are for a person to choose from; beyond this they stop being useful. */
const CANDIDATE_LIMIT = 100;

async function findRequest(id: string) {
  const request = await BloodRequestModel.findById(id).lean();
  if (!request) throw AppError.notFound('Request');
  return request;
}

/** Mongo duplicate-key error: the partial unique index caught a unit already live elsewhere. */
const isDuplicateKey = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;

/** Usable stock for a request: available, tested, compatible and in date until required-by. */
export function usableStockFilter(request: BloodRequest, now = new Date()) {
  return {
    status: 'AVAILABLE',
    testingStatus: 'PASSED',
    componentType: request.componentType,
    bloodGroup: { $in: getCompatibleDonorGroups(request.bloodGroup, request.componentType) },
    expiryDate: { $gt: usableUntil(request, now) },
  } as const;
}

/** Exact-group and substitute counts shown on the staff request view. */
export async function countUsableStock(request: BloodRequest) {
  const rows = await BloodUnitModel.aggregate<{ _id: boolean; n: number }>([
    { $match: usableStockFilter(request) },
    { $group: { _id: { $eq: ['$bloodGroup', request.bloodGroup] }, n: { $sum: 1 } } },
  ]);
  return {
    exact: rows.find((r) => r._id)?.n ?? 0,
    compatibleSubstitutes: rows.find((r) => !r._id)?.n ?? 0,
  };
}

export async function getInventoryCandidates(
  actor: Actor,
  requestId: string,
): Promise<InventoryCandidates> {
  const request = await findRequest(requestId);
  const shortfall = request.unitsRequested - request.unitsAllocated;
  const compatibleGroups = getCompatibleDonorGroups(request.bloodGroup, request.componentType);
  if (!ALLOCATABLE_REQUEST_STATUSES.includes(request.status) || shortfall <= 0) {
    return {
      requestId,
      shortfall: Math.max(0, shortfall),
      compatibleGroups,
      candidates: [],
      preselectedUnitIds: [],
      truncated: false,
    };
  }

  // Fetch generously, rank in memory (the ranking depends on group preference, which the database
  // cannot sort by), then cut to the display limit.
  const units = await BloodUnitModel.find(usableStockFilter(request))
    .sort({ expiryDate: 1 })
    .limit(CANDIDATE_LIMIT * 5)
    .lean();
  const ranked = rankUnits(units, request.bloodGroup, request.componentType);
  const shown = ranked.slice(0, CANDIDATE_LIMIT);
  const lookups = await loadLookups({ banks: shown.map((u) => u.bloodBankId) });

  const candidates = shown.map((unit) => ({
    unitId: unit._id.toString(),
    unitCode: unit.unitCode,
    bloodGroup: unit.bloodGroup,
    componentType: unit.componentType,
    groupMatch:
      unit.bloodGroup === request.bloodGroup ? ('EXACT' as const) : ('COMPATIBLE' as const),
    expiryDate: unit.expiryDate.toISOString(),
    daysToExpiry: daysToExpiry(unit.expiryDate),
    collectedAt: unit.collectedAt.toISOString(),
    storageLocation: unit.storageLocation,
    bloodBank: lookups.bank(unit.bloodBankId),
    canReserve: canManageBank(actor, unit.bloodBankId),
  }));
  return {
    requestId,
    shortfall,
    compatibleGroups,
    candidates,
    // A suggestion only — staff confirm the selection before anything is reserved.
    preselectedUnitIds: candidates
      .filter((c) => c.canReserve)
      .slice(0, shortfall)
      .map((c) => c.unitId),
    truncated: ranked.length > CANDIDATE_LIMIT,
  };
}

export async function reserveUnits(actor: Actor, requestId: string, input: ReserveUnitsInput) {
  try {
    await withTransaction((session) =>
      reserveUnitsInSession({
        requestId: new Types.ObjectId(requestId),
        unitIds: input.unitIds.map((id) => new Types.ObjectId(id)),
        actor,
        session,
      }),
    );
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw AppError.conflict(
        'One of the selected units was just reserved elsewhere. Refresh the list and choose again.',
        ERROR_CODES.UNIT_NOT_AVAILABLE,
      );
    }
    throw err;
  }
}

async function findAllocation(actor: Actor, id: string) {
  const allocation = await AllocationModel.findById(id).lean();
  if (!allocation) throw AppError.notFound('Allocation');
  assertCanManageBank(actor, allocation.bloodBankId);
  return allocation;
}

export async function releaseAllocation(actor: Actor, id: string, input: ReleaseAllocationInput) {
  const allocation = await findAllocation(actor, id);
  await withTransaction((session) =>
    releaseAllocationInSession({ allocation, actor, reason: input.reason, session }),
  );
  return allocation.requestId.toString();
}

export async function issueAllocation(actor: Actor, id: string) {
  const allocation = await findAllocation(actor, id);
  await withTransaction((session) => issueAllocationInSession({ allocation, actor, session }));
  return allocation.requestId.toString();
}

/** Allocations of a request as the viewer may see them (actions only for staff of the unit's bank). */
export async function loadAllocationViews(
  actor: Actor,
  request: BloodRequest,
  staff: boolean,
): Promise<AllocationView[]> {
  // Hospitals see what is on its way to them, not reservations that were released again.
  const allocations = await AllocationModel.find({
    requestId: request._id,
    ...(!staff && { status: { $ne: 'RELEASED' } }),
  })
    .sort({ reservedAt: -1 })
    .lean();
  if (!allocations.length) return [];
  const units = await BloodUnitModel.find({ _id: { $in: allocations.map((a) => a.unitId) } })
    .select('unitCode bloodGroup componentType expiryDate')
    .lean();
  const unitMap = new Map(units.map((u) => [u._id.toString(), u]));
  const lookups = await loadLookups({
    banks: allocations.map((a) => a.bloodBankId),
    users: allocations.flatMap((a) => [a.reservedBy, a.issuedBy]),
  });
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  const open = ['PARTIALLY_ALLOCATED', 'ALLOCATED'].includes(request.status);

  return allocations.map((a) => {
    const unit = unitMap.get(a.unitId.toString());
    const manage = staff && a.status === 'RESERVED' && canManageBank(actor, a.bloodBankId);
    return {
      id: a._id.toString(),
      status: a.status,
      unit: {
        id: a.unitId.toString(),
        unitCode: unit?.unitCode ?? '—',
        bloodGroup: unit?.bloodGroup ?? request.bloodGroup,
        componentType: unit?.componentType ?? request.componentType,
        expiryDate: iso(unit?.expiryDate ?? null) ?? '',
      },
      bloodBank: lookups.bank(a.bloodBankId),
      groupMatch: unit && unit.bloodGroup !== request.bloodGroup ? 'COMPATIBLE' : 'EXACT',
      reservedAt: a.reservedAt.toISOString(),
      reservedBy: staff ? lookups.user(a.reservedBy) : null,
      holdUntil: a.status === 'RESERVED' ? a.holdUntil.toISOString() : null,
      issuedAt: iso(a.issuedAt),
      issuedBy: staff ? lookups.user(a.issuedBy) : null,
      receivedAt: iso(a.receivedAt),
      releasedAt: iso(a.releasedAt),
      releaseReason: staff ? a.releaseReason : null,
      canIssue: manage && open,
      canRelease: manage,
    };
  });
}
