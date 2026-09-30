import { Types, type ClientSession } from 'mongoose';
import { ERROR_CODES, type UnitStatus } from '@bbms/shared';
import { env } from '../../config/env.js';
import { isCompatible } from '../../domain/matching/compatibility.js';
import {
  ALLOCATABLE_REQUEST_STATUSES,
  statusForAllocatedUnits,
} from '../../domain/requests/requestStateMachine.js';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import { recordAudit } from '../audit/audit.service.js';
import { BloodUnitModel } from '../inventory/bloodUnit.model.js';
import { assertCanManageBank, transitionUnit } from '../inventory/unitTransitions.js';
import { BloodRequestModel, type BloodRequest } from '../requests/bloodRequest.model.js';
import { transitionRequest } from '../requests/requestTransitions.js';
import { AllocationModel, type Allocation } from './allocation.model.js';

/**
 * The allocation workflow: the ONLY code that reserves, releases, issues or receives units against
 * a request. Every function here runs inside the caller's transaction and keeps three things in
 * step — the Allocation record, the unit's status and the request's counters/status — so none of
 * them can drift from the others.
 */

const HOUR_MS = 3_600_000;
const ALLOCATION_STATES = new Set<string>(['APPROVED', 'PARTIALLY_ALLOCATED', 'ALLOCATED']);

const unitNotAvailable = (message: string) =>
  AppError.conflict(message, ERROR_CODES.UNIT_NOT_AVAILABLE);

const requestChanged = (requestNumber: string) =>
  AppError.conflict(
    `Request ${requestNumber} changed while you were working on it. Refresh and try again.`,
    ERROR_CODES.CONFLICT,
  );

/** A unit may be reserved only while it is usable until the request's required-by time. */
export const usableUntil = (request: Pick<BloodRequest, 'requiredBy'>, now = new Date()) =>
  new Date(Math.max(now.getTime(), request.requiredBy.getTime()));

/** Moves the request to the allocation status matching its counters, when that differs. */
async function syncRequestStatus(
  request: BloodRequest,
  actor: Actor,
  reason: string | null,
  session: ClientSession,
) {
  if (!ALLOCATION_STATES.has(request.status)) return request;
  const target = statusForAllocatedUnits(request.unitsAllocated, request.unitsRequested);
  if (target === request.status) return request;
  return transitionRequest({ request, to: target, by: 'ALLOCATION', actor, reason, session });
}

// ─── Reserve ─────────────────────────────────────────────────────────────────

export async function reserveUnitsInSession({
  requestId,
  unitIds,
  actor,
  session,
}: {
  requestId: Types.ObjectId;
  unitIds: Types.ObjectId[];
  actor: Actor;
  session: ClientSession;
}) {
  const now = new Date();
  const request = await BloodRequestModel.findById(requestId).session(session).lean();
  if (!request) throw AppError.notFound('Request');
  if (!ALLOCATABLE_REQUEST_STATUSES.includes(request.status)) {
    throw AppError.conflict(
      `Units can be reserved only for approved requests; ${request.requestNumber} is ${request.status.toLowerCase().replaceAll('_', ' ')}.`,
      ERROR_CODES.INVALID_STATE_TRANSITION,
    );
  }
  const shortfall = request.unitsRequested - request.unitsAllocated;
  if (unitIds.length > shortfall) {
    throw AppError.conflict(
      `Only ${shortfall} more unit${shortfall === 1 ? ' is' : 's are'} needed for this request.`,
    );
  }

  const units = await BloodUnitModel.find({ _id: { $in: unitIds } })
    .session(session)
    .lean();
  const byId = new Map(units.map((u) => [u._id.toString(), u]));
  const mustLastUntil = usableUntil(request, now);

  // Check everything before changing anything, so the first problem is reported clearly.
  for (const id of unitIds) {
    const unit = byId.get(id.toString());
    if (!unit) throw unitNotAvailable('One of the selected units no longer exists.');
    assertCanManageBank(actor, unit.bloodBankId);
    if (unit.status !== 'AVAILABLE' || unit.testingStatus !== 'PASSED') {
      throw unitNotAvailable(
        `Unit ${unit.unitCode} is no longer available. Refresh the list and choose again.`,
      );
    }
    if (unit.expiryDate <= mustLastUntil) {
      throw unitNotAvailable(
        `Unit ${unit.unitCode} expires before the request's required-by time.`,
      );
    }
    if (
      unit.componentType !== request.componentType ||
      !isCompatible(unit.bloodGroup, request.bloodGroup, request.componentType)
    ) {
      throw unitNotAvailable(`Unit ${unit.unitCode} is not a compatible match for this request.`);
    }
  }

  const holdUntil = new Date(now.getTime() + env.RESERVATION_HOLD_HOURS * HOUR_MS);
  const allocations: Allocation[] = [];
  for (const id of unitIds) {
    const unit = byId.get(id.toString())!;
    const allocationId = new Types.ObjectId();
    // Compare-and-set on AVAILABLE: of two people reserving the same unit, only one succeeds.
    await transitionUnit({
      unit,
      to: 'RESERVED',
      by: 'ALLOCATION',
      actor,
      set: { currentAllocationId: allocationId },
      session,
    });
    const [allocation] = await AllocationModel.create(
      [
        {
          _id: allocationId,
          requestId: request._id,
          unitId: unit._id,
          bloodBankId: unit.bloodBankId,
          status: 'RESERVED',
          reservedBy: actor.userId,
          reservedAt: now,
          holdUntil,
        },
      ],
      { session },
    );
    allocations.push(allocation!.toObject());
  }

  // Guarded on the version and the remaining quantity, so two staff reserving for the same request
  // at once cannot over-allocate it.
  const updated = await BloodRequestModel.findOneAndUpdate(
    {
      _id: request._id,
      status: request.status,
      version: request.version,
      unitsAllocated: { $lte: request.unitsRequested - unitIds.length },
    },
    { $inc: { unitsAllocated: unitIds.length, version: 1 } },
    { session, returnDocument: 'after' },
  ).lean();
  if (!updated) throw requestChanged(request.requestNumber);
  await syncRequestStatus(updated, actor, null, session);

  await recordAudit(
    actor,
    {
      action: 'UNITS_RESERVED',
      entityType: 'BloodRequest',
      entityId: request._id,
      before: { unitsAllocated: request.unitsAllocated },
      after: {
        unitsAllocated: updated.unitsAllocated,
        units: unitIds.map((id) => byId.get(id.toString())!.unitCode),
        holdUntil: holdUntil.toISOString(),
      },
    },
    session,
  );
  return allocations;
}

// ─── Release ─────────────────────────────────────────────────────────────────

interface ReleaseOptions {
  allocation: Pick<Allocation, '_id' | 'status' | 'unitId' | 'requestId'>;
  actor: Actor;
  reason: string;
  session: ClientSession;
  /** EXPIRED when the unit itself reached its expiry date (expiry sweep). */
  unitTo?: Extract<UnitStatus, 'AVAILABLE' | 'EXPIRED'>;
  /**
   * false when the request is being closed in the same transaction (cancel / expiry): only its
   * counters change, and the caller moves it to its closed status.
   */
  syncRequest?: boolean;
}

/** Releases a reserved unit: allocation → RELEASED, unit back to stock (or expired), counters down. */
export async function releaseAllocationInSession({
  allocation,
  actor,
  reason,
  session,
  unitTo = 'AVAILABLE',
  syncRequest = true,
}: ReleaseOptions) {
  const released = await AllocationModel.findOneAndUpdate(
    { _id: allocation._id, status: 'RESERVED' },
    {
      $set: {
        status: 'RELEASED',
        releasedBy: actor.userId,
        releasedAt: new Date(),
        releaseReason: reason,
      },
    },
    { session, returnDocument: 'after' },
  ).lean();
  if (!released) {
    throw AppError.conflict(
      'This reservation was already issued or released. Refresh and try again.',
      ERROR_CODES.INVALID_STATE_TRANSITION,
    );
  }

  const unit = await BloodUnitModel.findById(allocation.unitId)
    .select('_id status unitCode')
    .session(session)
    .lean();
  if (!unit) throw AppError.notFound('Blood unit');
  await transitionUnit({
    unit,
    to: unitTo,
    by: unitTo === 'EXPIRED' ? 'SYSTEM' : 'ALLOCATION',
    actor,
    reason,
    set: { currentAllocationId: null },
    session,
  });

  const request = await BloodRequestModel.findOneAndUpdate(
    { _id: allocation.requestId, unitsAllocated: { $gte: 1 } },
    { $inc: { unitsAllocated: -1, version: 1 } },
    { session, returnDocument: 'after' },
  ).lean();
  if (!request) throw AppError.notFound('Request');
  if (syncRequest) await syncRequestStatus(request, actor, reason, session);

  await recordAudit(
    actor,
    {
      action: 'ALLOCATION_RELEASED',
      entityType: 'Allocation',
      entityId: allocation._id,
      before: { status: 'RESERVED', unitCode: unit.unitCode },
      after: { status: 'RELEASED', unitStatus: unitTo, requestNumber: request.requestNumber },
      reason,
    },
    session,
  );
  return released;
}

/** Releases every reservation of a request that is being closed (cancelled or expired). */
export async function releaseAllForRequestInSession(
  requestId: Types.ObjectId,
  actor: Actor,
  reason: string,
  session: ClientSession,
) {
  const reserved = await AllocationModel.find({ requestId, status: 'RESERVED' })
    .select('_id status unitId requestId')
    .session(session)
    .lean();
  for (const allocation of reserved) {
    await releaseAllocationInSession({ allocation, actor, reason, session, syncRequest: false });
  }
  return reserved.length;
}

// ─── Issue ───────────────────────────────────────────────────────────────────

/** Hands a reserved unit over to the hospital. The request is FULFILLED once every unit is issued. */
export async function issueAllocationInSession({
  allocation,
  actor,
  session,
}: {
  allocation: Pick<Allocation, '_id' | 'unitId' | 'requestId'>;
  actor: Actor;
  session: ClientSession;
}) {
  const now = new Date();
  const unit = await BloodUnitModel.findById(allocation.unitId).session(session).lean();
  if (!unit) throw AppError.notFound('Blood unit');
  // Never hand over a unit past its expiry date, whether or not the sweep has marked it yet.
  if (unit.expiryDate <= now) {
    throw unitNotAvailable(
      `Unit ${unit.unitCode} has reached its expiry date and cannot be issued. Release it instead.`,
    );
  }

  const request = await BloodRequestModel.findById(allocation.requestId).session(session).lean();
  if (!request) throw AppError.notFound('Request');
  if (!['PARTIALLY_ALLOCATED', 'ALLOCATED'].includes(request.status)) {
    throw AppError.conflict(
      `Request ${request.requestNumber} is ${request.status.toLowerCase().replaceAll('_', ' ')}; units cannot be issued against it.`,
      ERROR_CODES.INVALID_STATE_TRANSITION,
    );
  }

  const issued = await AllocationModel.findOneAndUpdate(
    { _id: allocation._id, status: 'RESERVED' },
    { $set: { status: 'ISSUED', issuedBy: actor.userId, issuedAt: now } },
    { session, returnDocument: 'after' },
  ).lean();
  if (!issued) {
    throw AppError.conflict(
      'This reservation was already issued or released. Refresh and try again.',
      ERROR_CODES.INVALID_STATE_TRANSITION,
    );
  }
  await transitionUnit({ unit, to: 'ISSUED', by: 'ALLOCATION', actor, session });

  const updated = await BloodRequestModel.findOneAndUpdate(
    { _id: request._id, status: request.status },
    { $inc: { unitsIssued: 1, version: 1 } },
    { session, returnDocument: 'after' },
  ).lean();
  if (!updated) throw requestChanged(request.requestNumber);
  if (updated.status === 'ALLOCATED' && updated.unitsIssued >= updated.unitsRequested) {
    await transitionRequest({
      request: updated,
      to: 'FULFILLED',
      by: 'ALLOCATION',
      actor,
      session,
    });
  }

  await recordAudit(
    actor,
    {
      action: 'ALLOCATION_ISSUED',
      entityType: 'Allocation',
      entityId: allocation._id,
      before: { status: 'RESERVED' },
      after: { status: 'ISSUED', unitCode: unit.unitCode, requestNumber: request.requestNumber },
    },
    session,
  );
  return issued;
}

// ─── Receive ─────────────────────────────────────────────────────────────────

/**
 * The hospital confirms that every issued unit arrived. Completes a fulfilled request; for a
 * request that was cancelled after some units were issued, it still closes the loop on those units.
 */
export async function confirmReceiptInSession({
  request,
  actor,
  session,
}: {
  request: BloodRequest;
  actor: Actor;
  session: ClientSession;
}) {
  const now = new Date();
  const issued = await AllocationModel.find({ requestId: request._id, status: 'ISSUED' })
    .session(session)
    .lean();
  if (!issued.length) {
    throw AppError.conflict(
      'There are no issued units awaiting confirmation for this request.',
      ERROR_CODES.INVALID_STATE_TRANSITION,
    );
  }

  const unitCodes: string[] = [];
  for (const allocation of issued) {
    const received = await AllocationModel.findOneAndUpdate(
      { _id: allocation._id, status: 'ISSUED' },
      { $set: { status: 'RECEIVED', receivedBy: actor.userId, receivedAt: now } },
      { session },
    );
    if (!received) throw requestChanged(request.requestNumber);
    const unit = await BloodUnitModel.findById(allocation.unitId)
      .select('_id status unitCode')
      .session(session)
      .lean();
    if (!unit) throw AppError.notFound('Blood unit');
    await transitionUnit({ unit, to: 'RECEIVED', by: 'ALLOCATION', actor, session });
    unitCodes.push(unit.unitCode);
  }

  const current = await BloodRequestModel.findById(request._id).session(session).lean();
  if (current?.status === 'FULFILLED') {
    await transitionRequest({ request: current, to: 'COMPLETED', by: 'HOSPITAL', actor, session });
  }
  await recordAudit(
    actor,
    {
      action: 'REQUEST_RECEIPT_CONFIRMED',
      entityType: 'BloodRequest',
      entityId: request._id,
      after: { units: unitCodes },
    },
    session,
  );
  return unitCodes.length;
}
