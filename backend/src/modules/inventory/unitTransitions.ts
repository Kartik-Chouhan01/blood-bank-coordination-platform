import type { ClientSession, Types } from 'mongoose';
import { ERROR_CODES, type UnitStatus } from '@bbms/shared';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import { findTransition, type TransitionActor } from '../../domain/inventory/unitStateMachine.js';
import { recordAudit } from '../audit/audit.service.js';
import { BloodUnitModel, type BloodUnit } from './bloodUnit.model.js';

interface TransitionRequest {
  unit: Pick<BloodUnit, '_id' | 'status' | 'unitCode'>;
  to: UnitStatus;
  by: TransitionActor;
  actor: Actor;
  reason?: string | null | undefined;
  /** Additional fields to set atomically with the status change (e.g. testingStatus). */
  set?: Partial<Pick<BloodUnit, 'testingStatus' | 'bloodGroup' | 'currentAllocationId'>>;
  session?: ClientSession | undefined;
}

/**
 * The ONLY way a blood unit's status changes. Validates the move against the state machine,
 * applies it with a compare-and-set on the current status (so two people acting at once cannot
 * both succeed), appends to the unit's history and writes the audit entry.
 */
export async function transitionUnit({
  unit,
  to,
  by,
  actor,
  reason,
  set,
  session,
}: TransitionRequest) {
  const rule = findTransition(unit.status, to, by);
  if (!rule) {
    throw AppError.conflict(
      `A unit that is ${unit.status.toLowerCase().replace('_', ' ')} cannot move to ${to.toLowerCase().replace('_', ' ')}${by === 'STAFF' ? ' manually' : ''}.`,
      ERROR_CODES.INVALID_STATE_TRANSITION,
    );
  }
  if (rule.requiresReason && !reason?.trim()) {
    throw AppError.validation([
      { field: 'body.reason', message: 'A reason is required for this action' },
    ]);
  }

  const override = by === 'OVERRIDE';
  const updated = await BloodUnitModel.findOneAndUpdate(
    { _id: unit._id, status: unit.status },
    {
      $set: { status: to, ...set },
      $push: {
        statusHistory: {
          from: unit.status,
          to,
          at: new Date(),
          by: actor.userId,
          reason: reason?.trim() || null,
          override,
        },
      },
    },
    { session, returnDocument: 'after' },
  ).lean();

  if (!updated) {
    throw AppError.conflict(
      `Unit ${unit.unitCode} was changed by someone else. Refresh and try again.`,
      ERROR_CODES.INVALID_STATE_TRANSITION,
    );
  }

  await recordAudit(
    actor,
    {
      action: override ? 'WORKFLOW_OVERRIDE' : 'BLOOD_UNIT_STATUS_CHANGED',
      entityType: 'BloodUnit',
      entityId: unit._id as Types.ObjectId,
      before: { status: unit.status },
      after: { status: to, ...(set?.bloodGroup && { bloodGroup: set.bloodGroup }) },
      reason: reason?.trim() || null,
    },
    session,
  );
  return updated;
}

/** Staff may change only their own blood bank's records; administrators may change any. */
export function assertCanManageBank(actor: Actor, bloodBankId: Types.ObjectId) {
  if (actor.role === 'ADMIN') return;
  if (actor.role === 'BLOOD_BANK_STAFF' && actor.bloodBankId?.equals(bloodBankId)) return;
  throw AppError.forbidden("You can only manage your own blood bank's records.");
}

export function canManageBank(actor: Actor, bloodBankId: Types.ObjectId): boolean {
  try {
    assertCanManageBank(actor, bloodBankId);
    return true;
  } catch {
    return false;
  }
}
