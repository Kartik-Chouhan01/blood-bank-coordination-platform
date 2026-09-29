import { OPEN_REQUEST_STATUSES } from '@bbms/shared';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { SYSTEM_ACTOR } from '../utils/actor.js';
import { AppError } from '../utils/AppError.js';
import { withTransaction } from '../utils/mongoose.js';
import { BloodRequestModel } from '../modules/requests/bloodRequest.model.js';
import { transitionRequest } from '../modules/requests/requestTransitions.js';

const BATCH_SIZE = 200;

/**
 * Closes open requests whose required-by time passed more than the grace period ago with nothing
 * issued. Until then they stay open and are flagged "overdue" so staff can still act.
 * TODO(Phase 7): expiring a request with reserved units must release them in the same transaction.
 */
export async function runRequestExpirySweep(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - env.REQUEST_EXPIRY_GRACE_HOURS * 3_600_000);
  let expired = 0;
  for (;;) {
    const due = await BloodRequestModel.find({
      status: { $in: [...OPEN_REQUEST_STATUSES] },
      requiredBy: { $lte: cutoff },
      unitsIssued: 0,
    })
      .select('_id status requestNumber')
      .limit(BATCH_SIZE)
      .lean();
    if (!due.length) break;

    for (const request of due) {
      try {
        await withTransaction((session) =>
          transitionRequest({
            request,
            to: 'EXPIRED',
            by: 'SYSTEM',
            actor: SYSTEM_ACTOR,
            reason: 'Required-by time passed before any units were issued',
            set: { statusReason: 'Required-by time passed before any units were issued' },
            session,
          }),
        );
        expired += 1;
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
      }
    }
    if (due.length < BATCH_SIZE) break;
  }
  if (expired) logger.info({ expired }, 'Request expiry sweep closed overdue requests');
  return expired;
}
