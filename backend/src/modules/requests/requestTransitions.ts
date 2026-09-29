import type { ClientSession } from 'mongoose';
import { ERROR_CODES, type AuditAction, type RequestStatus } from '@bbms/shared';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import {
  findRequestTransition,
  type RequestActor,
} from '../../domain/requests/requestStateMachine.js';
import { recordAudit } from '../audit/audit.service.js';
import { BloodRequestModel, type BloodRequest } from './bloodRequest.model.js';

interface RequestTransition {
  request: Pick<BloodRequest, '_id' | 'status' | 'requestNumber'>;
  to: RequestStatus;
  by: RequestActor;
  actor: Actor;
  reason?: string | null | undefined;
  set?: Partial<Pick<BloodRequest, 'statusReason' | 'reviewedBy' | 'reviewedAt'>>;
  auditAction?: AuditAction;
  session?: ClientSession | undefined;
}

/**
 * The ONLY way a request's status changes: validated against the request state machine, applied
 * with a compare-and-set on the current status, appended to the history and audited.
 */
export async function transitionRequest({
  request,
  to,
  by,
  actor,
  reason,
  set,
  auditAction = 'REQUEST_STATUS_CHANGED',
  session,
}: RequestTransition) {
  const rule = findRequestTransition(request.status, to, by);
  if (!rule) {
    throw AppError.conflict(
      `Request ${request.requestNumber} is ${request.status.toLowerCase().replaceAll('_', ' ')} and cannot become ${to.toLowerCase().replaceAll('_', ' ')}.`,
      ERROR_CODES.INVALID_STATE_TRANSITION,
    );
  }
  if (rule.requiresReason && !reason?.trim()) {
    throw AppError.validation([{ field: 'body.reason', message: 'A reason is required' }]);
  }

  const updated = await BloodRequestModel.findOneAndUpdate(
    { _id: request._id, status: request.status },
    {
      $set: { status: to, ...set },
      $push: {
        statusHistory: {
          from: request.status,
          to,
          at: new Date(),
          by: actor.userId,
          reason: reason?.trim() || null,
        },
      },
    },
    { session, returnDocument: 'after' },
  ).lean();
  if (!updated) {
    throw AppError.conflict(
      `Request ${request.requestNumber} was changed by someone else. Refresh and try again.`,
      ERROR_CODES.INVALID_STATE_TRANSITION,
    );
  }

  await recordAudit(
    actor,
    {
      action: auditAction,
      entityType: 'BloodRequest',
      entityId: request._id,
      before: { status: request.status },
      after: { status: to },
      reason: reason?.trim() || null,
    },
    session,
  );
  return updated;
}
