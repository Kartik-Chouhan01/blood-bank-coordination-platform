import { OPEN_REQUEST_STATUSES } from '@bbms/shared';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { SYSTEM_ACTOR } from '../utils/actor.js';
import { AppError } from '../utils/AppError.js';
import { withTransaction } from '../utils/mongoose.js';
import { BloodRequestModel } from '../modules/requests/bloodRequest.model.js';
import { transitionRequest } from '../modules/requests/requestTransitions.js';
import { releaseAllForRequestInSession } from '../modules/matching/allocationWorkflow.js';
import { requestExpired } from '../modules/notifications/notify.js';

const REASON = 'Required-by time passed before any units were issued';

const BATCH_SIZE = 200;

/**
 * Closes open requests whose required-by time passed more than the grace period ago with nothing
 * issued. Until then they stay open and are flagged "overdue" so staff can still act. Units still
 * reserved for an expiring request go back to stock in the same transaction.
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
        await withTransaction(async (session) => {
          await releaseAllForRequestInSession(request._id, SYSTEM_ACTOR, REASON, session);
          await transitionRequest({
            request,
            to: 'EXPIRED',
            by: 'SYSTEM',
            actor: SYSTEM_ACTOR,
            reason: REASON,
            set: { statusReason: REASON },
            session,
          });
        });
        expired += 1;
        await requestExpired(request._id);
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
      }
    }
    if (due.length < BATCH_SIZE) break;
  }
  if (expired) logger.info({ expired }, 'Request expiry sweep closed overdue requests');
  return expired;
}
