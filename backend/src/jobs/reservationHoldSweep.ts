import { logger } from '../config/logger.js';
import { SYSTEM_ACTOR } from '../utils/actor.js';
import { AppError } from '../utils/AppError.js';
import { withTransaction } from '../utils/mongoose.js';
import { AllocationModel } from '../modules/matching/allocation.model.js';
import { releaseAllocationInSession } from '../modules/matching/allocationWorkflow.js';
import { reservationReleased } from '../modules/notifications/notify.js';

const BATCH_SIZE = 200;
export const HOLD_EXPIRED_REASON = 'Reservation hold expired before the unit was issued';

/**
 * Returns units to stock when their reservation was not issued within the hold period, so a unit
 * can never be locked indefinitely. Each release is its own transaction and a compare-and-set, so
 * running on several instances (or racing a person issuing the unit) is safe.
 */
export async function runReservationHoldSweep(now = new Date()): Promise<number> {
  let released = 0;
  for (;;) {
    const due = await AllocationModel.find({ status: 'RESERVED', holdUntil: { $lte: now } })
      .select('_id status unitId requestId')
      .limit(BATCH_SIZE)
      .lean();
    if (!due.length) break;

    for (const allocation of due) {
      try {
        await withTransaction((session) =>
          releaseAllocationInSession({
            allocation,
            actor: SYSTEM_ACTOR,
            reason: HOLD_EXPIRED_REASON,
            session,
          }),
        );
        released += 1;
        await reservationReleased(allocation.requestId, allocation.unitId, HOLD_EXPIRED_REASON);
      } catch (err) {
        // Issued or released concurrently; nothing left to do for it.
        if (!(err instanceof AppError)) throw err;
      }
    }
    if (due.length < BATCH_SIZE) break;
  }
  if (released) logger.info({ released }, 'Reservation hold sweep released stale reservations');
  return released;
}
