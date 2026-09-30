import { Types, type QueryFilter } from 'mongoose';
import {
  CLOSED_REQUEST_STATUSES,
  ERROR_CODES,
  OPEN_REQUEST_STATUSES,
  URGENCY_RANK,
  hasPermission,
  type CancelRequestInput,
  type CreateRequestInput,
  type EscalateRequestInput,
  type ListRequestsQuery,
  type RequestAction,
  type RequestStats,
  type ReviewRequestInput,
  type UpdateRequestInput,
} from '@bbms/shared';
import {
  ALLOCATABLE_REQUEST_STATUSES,
  canTransition,
} from '../../domain/requests/requestStateMachine.js';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import { withTransaction } from '../../utils/mongoose.js';
import { buildPaginationMeta, pageToSkip } from '../../utils/pagination.js';
import { recordAudit } from '../audit/audit.service.js';
import { HospitalModel } from '../hospitals/hospital.model.js';
import {
  confirmReceiptInSession,
  releaseAllForRequestInSession,
} from '../matching/allocationWorkflow.js';
import { countUsableStock, loadAllocationViews } from '../matching/allocations.service.js';
import { autoOutreachIfShort } from '../matching/donorMatching.service.js';
import { nextSequence } from '../inventory/counter.model.js';
import { BloodRequestModel, urgencyRankOf, type BloodRequest } from './bloodRequest.model.js';
import { loadRequestLookups, toRequestDetail, toRequestSummary } from './request.presenter.js';
import { transitionRequest } from './requestTransitions.js';

const OPEN = OPEN_REQUEST_STATUSES as readonly string[];
const AUTO_APPROVAL_REASON =
  'Emergency requests from verified hospitals are approved automatically';

const isStaff = (actor: Actor) =>
  actor.role !== 'SYSTEM' && hasPermission(actor.role, 'requests:review');

/** The signed-in hospital user's hospital. */
async function ownHospital(actor: Actor) {
  const hospital = await HospitalModel.findOne({ userId: actor.userId }).lean();
  if (!hospital) throw AppError.notFound('Hospital');
  return hospital;
}

/**
 * Loads a request the actor may see. Hospitals only ever find their own — another hospital's
 * request is reported as not found, so ids cannot be probed.
 */
async function findVisibleRequest(actor: Actor, id: string) {
  const filter: QueryFilter<BloodRequest> = { _id: new Types.ObjectId(id) };
  let hospitalId: Types.ObjectId | null = null;
  if (actor.role === 'HOSPITAL') {
    hospitalId = (await ownHospital(actor))._id;
    filter.hospitalId = hospitalId;
  } else if (!isStaff(actor)) {
    throw AppError.forbidden();
  }
  const request = await BloodRequestModel.findOne(filter).lean();
  if (!request) throw AppError.notFound('Request');
  return { request, isOwner: hospitalId !== null };
}

function actionsFor(
  request: BloodRequest,
  isOwner: boolean,
  staff: boolean,
  awaitingReceipt: boolean,
): RequestAction[] {
  const actions: RequestAction[] = [];
  if (isOwner) {
    if (request.status === 'PENDING') actions.push('EDIT');
    if (OPEN.includes(request.status) && request.urgency !== 'EMERGENCY') actions.push('ESCALATE');
    if (canTransition(request.status, 'CANCELLED', 'HOSPITAL')) actions.push('CANCEL');
    if (awaitingReceipt) actions.push('CONFIRM_RECEIPT');
  }
  if (staff) {
    if (request.status === 'PENDING') actions.push('REVIEW');
    if (
      ALLOCATABLE_REQUEST_STATUSES.includes(request.status) &&
      request.unitsAllocated < request.unitsRequested
    ) {
      actions.push('ALLOCATE', 'OUTREACH');
    }
    if (canTransition(request.status, 'CANCELLED', 'STAFF')) actions.push('CANCEL');
  }
  return actions;
}

async function present(actor: Actor, request: BloodRequest, isOwner: boolean) {
  const staff = isStaff(actor);
  const [lookups, allocations, stock] = await Promise.all([
    loadRequestLookups([request]),
    loadAllocationViews(actor, request, staff),
    staff && OPEN.includes(request.status) ? countUsableStock(request) : null,
  ]);
  const awaitingReceipt = allocations.some((a) => a.status === 'ISSUED');
  return toRequestDetail(request, lookups, {
    allowedActions: actionsFor(request, isOwner, staff, awaitingReceipt),
    stock,
    allocations,
  });
}

// ─── Hospital actions ────────────────────────────────────────────────────────

export async function createRequest(actor: Actor, input: CreateRequestInput) {
  const createdBy = actor.userId;
  if (!createdBy) throw AppError.forbidden();
  const hospital = await ownHospital(actor);
  if (hospital.verificationStatus !== 'VERIFIED') {
    throw AppError.forbidden('Your hospital must be verified before it can raise blood requests.');
  }
  if (hospital.operatingStatus !== 'OPERATIONAL') {
    throw AppError.conflict(
      'Your hospital is marked as closed. Update its operating status first.',
      ERROR_CODES.CONFLICT,
    );
  }

  const now = new Date();
  const day = now.toISOString().slice(2, 10).replaceAll('-', '');
  const requestNumber = `REQ-${day}-${String(await nextSequence(`request:${day}`)).padStart(4, '0')}`;
  const requestId = new Types.ObjectId();

  await withTransaction(async (session) => {
    const [created] = await BloodRequestModel.create(
      [
        {
          _id: requestId,
          requestNumber,
          hospitalId: hospital._id,
          createdBy,
          bloodGroup: input.bloodGroup,
          componentType: input.componentType,
          unitsRequested: input.unitsRequested,
          urgency: input.urgency,
          urgencyRank: urgencyRankOf(input.urgency),
          requiredBy: new Date(input.requiredBy),
          reasonCategory: input.reasonCategory,
          hospitalReference: input.hospitalReference || null,
          notes: input.notes || null,
          status: 'PENDING',
          statusHistory: [{ from: null, to: 'PENDING', at: now, by: createdBy, reason: null }],
        },
      ],
      { session },
    );
    await recordAudit(
      actor,
      {
        action: 'REQUEST_CREATED',
        entityType: 'BloodRequest',
        entityId: requestId,
        after: {
          requestNumber,
          bloodGroup: input.bloodGroup,
          componentType: input.componentType,
          unitsRequested: input.unitsRequested,
          urgency: input.urgency,
        },
      },
      session,
    );
    if (input.urgency === 'EMERGENCY') {
      await transitionRequest({
        request: created!,
        to: 'APPROVED',
        by: 'SYSTEM',
        actor: { ...actor, userId: null, role: 'SYSTEM' },
        reason: AUTO_APPROVAL_REASON,
        session,
      });
    }
  });

  if (input.urgency === 'EMERGENCY') await autoOutreachIfShort(requestId);
  return getRequest(actor, requestId.toString());
}

export async function updateRequest(actor: Actor, id: string, input: UpdateRequestInput) {
  const { request, isOwner } = await findVisibleRequest(actor, id);
  if (!isOwner) throw AppError.forbidden();
  if (request.status !== 'PENDING') {
    throw AppError.conflict(
      'Requests can only be edited while they are pending review.',
      ERROR_CODES.INVALID_STATE_TRANSITION,
    );
  }

  const set: Partial<BloodRequest> = {};
  if (input.bloodGroup) set.bloodGroup = input.bloodGroup;
  if (input.componentType) set.componentType = input.componentType;
  if (input.unitsRequested) set.unitsRequested = input.unitsRequested;
  if (input.requiredBy) set.requiredBy = new Date(input.requiredBy);
  if (input.reasonCategory) set.reasonCategory = input.reasonCategory;
  if (input.hospitalReference !== undefined)
    set.hospitalReference = input.hospitalReference || null;
  if (input.notes !== undefined) set.notes = input.notes || null;

  const auditable = (
    r: Pick<BloodRequest, 'bloodGroup' | 'componentType' | 'unitsRequested' | 'requiredBy'>,
  ) => ({
    bloodGroup: r.bloodGroup,
    componentType: r.componentType,
    unitsRequested: r.unitsRequested,
    requiredBy: r.requiredBy.toISOString(),
  });

  await withTransaction(async (session) => {
    const updated = await BloodRequestModel.findOneAndUpdate(
      { _id: request._id, status: 'PENDING' },
      { $set: set },
      { session, returnDocument: 'after' },
    ).lean();
    if (!updated) {
      throw AppError.conflict(
        'This request was reviewed while you were editing it.',
        ERROR_CODES.INVALID_STATE_TRANSITION,
      );
    }
    await recordAudit(
      actor,
      {
        action: 'REQUEST_UPDATED',
        entityType: 'BloodRequest',
        entityId: request._id,
        before: auditable(request),
        after: auditable(updated),
      },
      session,
    );
  });
  return getRequest(actor, id);
}

/** Urgency can only go up. Escalating a pending request to EMERGENCY approves it automatically. */
export async function escalateRequest(actor: Actor, id: string, input: EscalateRequestInput) {
  const { request, isOwner } = await findVisibleRequest(actor, id);
  if (!isOwner) throw AppError.forbidden();
  if (!OPEN.includes(request.status)) {
    throw AppError.conflict(
      'Only open requests can be escalated.',
      ERROR_CODES.INVALID_STATE_TRANSITION,
    );
  }
  if (URGENCY_RANK[input.urgency] >= request.urgencyRank) {
    throw AppError.conflict('Urgency can only be raised, not lowered.', ERROR_CODES.CONFLICT);
  }

  const autoApproved = await withTransaction(async (session) => {
    const updated = await BloodRequestModel.findOneAndUpdate(
      { _id: request._id, status: request.status, urgency: request.urgency },
      { $set: { urgency: input.urgency, urgencyRank: urgencyRankOf(input.urgency) } },
      { session, returnDocument: 'after' },
    ).lean();
    if (!updated)
      throw AppError.conflict(
        'This request changed meanwhile. Refresh and try again.',
        ERROR_CODES.CONFLICT,
      );
    await recordAudit(
      actor,
      {
        action: 'REQUEST_ESCALATED',
        entityType: 'BloodRequest',
        entityId: request._id,
        before: { urgency: request.urgency },
        after: { urgency: input.urgency },
        reason: input.reason,
      },
      session,
    );
    if (input.urgency === 'EMERGENCY' && updated.status === 'PENDING') {
      await transitionRequest({
        request: updated,
        to: 'APPROVED',
        by: 'SYSTEM',
        actor: { ...actor, userId: null, role: 'SYSTEM' },
        reason: AUTO_APPROVAL_REASON,
        session,
      });
      return true;
    }
    return false;
  });
  if (autoApproved) await autoOutreachIfShort(request._id);
  return getRequest(actor, id);
}

/** Reserved units go back to stock in the same transaction; already-issued units stay issued. */
export async function cancelRequest(actor: Actor, id: string, input: CancelRequestInput) {
  const { request, isOwner } = await findVisibleRequest(actor, id);
  await withTransaction(async (session) => {
    await releaseAllForRequestInSession(
      request._id,
      actor,
      `Request cancelled: ${input.reason}`,
      session,
    );
    await transitionRequest({
      request,
      to: 'CANCELLED',
      by: isOwner ? 'HOSPITAL' : 'STAFF',
      actor,
      reason: input.reason,
      set: { statusReason: input.reason },
      auditAction: 'REQUEST_CANCELLED',
      session,
    });
  });
  return getRequest(actor, id);
}

/** The hospital confirms that every issued unit arrived; a fulfilled request becomes COMPLETED. */
export async function confirmReceipt(actor: Actor, id: string) {
  const { request, isOwner } = await findVisibleRequest(actor, id);
  if (!isOwner) throw AppError.forbidden();
  await withTransaction((session) => confirmReceiptInSession({ request, actor, session }));
  return getRequest(actor, id);
}

// ─── Staff actions ───────────────────────────────────────────────────────────

export async function reviewRequest(actor: Actor, id: string, input: ReviewRequestInput) {
  const { request } = await findVisibleRequest(actor, id);
  const approve = input.decision === 'APPROVE';
  await withTransaction((session) =>
    transitionRequest({
      request,
      to: approve ? 'APPROVED' : 'REJECTED',
      by: 'STAFF',
      actor,
      reason: input.reason,
      set: {
        reviewedBy: actor.userId,
        reviewedAt: new Date(),
        ...(!approve && { statusReason: input.reason ?? null }),
      },
      auditAction: 'REQUEST_REVIEWED',
      session,
    }),
  );
  return getRequest(actor, id);
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export async function getRequest(actor: Actor, id: string) {
  const { request, isOwner } = await findVisibleRequest(actor, id);
  return present(actor, request, isOwner);
}

function buildFilter(query: ListRequestsQuery): QueryFilter<BloodRequest> {
  const filter: QueryFilter<BloodRequest> = {};
  if (query.status) filter.status = query.status;
  else if (query.state === 'open') filter.status = { $in: [...OPEN_REQUEST_STATUSES] };
  else if (query.state === 'closed') filter.status = { $in: [...CLOSED_REQUEST_STATUSES] };
  if (query.urgency) filter.urgency = query.urgency;
  if (query.bloodGroup) filter.bloodGroup = query.bloodGroup;
  if (query.componentType) filter.componentType = query.componentType;
  if (query.hospitalId) filter.hospitalId = new Types.ObjectId(query.hospitalId);
  if (query.overdue) {
    filter.status = { $in: [...OPEN_REQUEST_STATUSES] };
    filter.requiredBy = { $lte: new Date() };
  }
  return filter;
}

async function list(filter: QueryFilter<BloodRequest>, query: ListRequestsQuery) {
  const [requests, total] = await Promise.all([
    BloodRequestModel.find(filter)
      .sort(query.sort === 'priority' ? { urgencyRank: 1, requiredBy: 1 } : { createdAt: -1 })
      .skip(pageToSkip(query))
      .limit(query.limit)
      .lean(),
    BloodRequestModel.countDocuments(filter),
  ]);
  const lookups = await loadRequestLookups(requests);
  return {
    items: requests.map((r) => toRequestSummary(r, lookups)),
    meta: buildPaginationMeta(query, total),
  };
}

/** Staff queue (all hospitals). */
export function listRequests(query: ListRequestsQuery) {
  return list(buildFilter(query), query);
}

/** A hospital's own requests only, whatever filters are supplied. */
export async function listOwnRequests(actor: Actor, query: ListRequestsQuery) {
  const hospital = await ownHospital(actor);
  return list(
    { ...buildFilter({ ...query, hospitalId: undefined }), hospitalId: hospital._id },
    query,
  );
}

export async function getRequestStats(hospitalId?: Types.ObjectId): Promise<RequestStats> {
  const scope = hospitalId ? { hospitalId } : {};
  const open = { ...scope, status: { $in: [...OPEN_REQUEST_STATUSES] } };
  const [openCount, pendingReview, openEmergency, openUrgent, overdue] = await Promise.all([
    BloodRequestModel.countDocuments(open),
    BloodRequestModel.countDocuments({ ...scope, status: 'PENDING' }),
    BloodRequestModel.countDocuments({ ...open, urgency: 'EMERGENCY' }),
    BloodRequestModel.countDocuments({ ...open, urgency: 'URGENT' }),
    BloodRequestModel.countDocuments({ ...open, requiredBy: { $lte: new Date() } }),
  ]);
  return { open: openCount, pendingReview, openEmergency, openUrgent, overdue };
}

export async function getOwnRequestStats(actor: Actor) {
  return getRequestStats((await ownHospital(actor))._id);
}
