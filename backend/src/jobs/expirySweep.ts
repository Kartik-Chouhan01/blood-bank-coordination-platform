import { EXPIRABLE_UNIT_STATUSES } from '@bbms/shared';
import { logger } from '../config/logger.js';
import { SYSTEM_ACTOR } from '../utils/actor.js';
import { withTransaction } from '../utils/mongoose.js';
import { AppError } from '../utils/AppError.js';
import { BloodUnitModel } from '../modules/inventory/bloodUnit.model.js';
import { transitionUnit } from '../modules/inventory/unitTransitions.js';

const BATCH_SIZE = 500;

/**
 * Marks every in-inventory unit past its expiry date as EXPIRED, one unit at a time through the
 * state machine (history + audit per unit). Safe to run concurrently or on several instances:
 * each change is a compare-and-set, so a unit is only ever expired once.
 *
 * Correctness never depends on this job — every inventory query also excludes units past expiry.
 * TODO(Phase 7): expiring a RESERVED unit must also release its allocation and notify staff.
 */
export async function runExpirySweep(now = new Date()): Promise<number> {
  let expired = 0;
  for (;;) {
    const due = await BloodUnitModel.find({
      status: { $in: [...EXPIRABLE_UNIT_STATUSES] },
      expiryDate: { $lte: now },
    })
      .select('_id status unitCode')
      .limit(BATCH_SIZE)
      .lean();
    if (!due.length) break;

    for (const unit of due) {
      try {
        await withTransaction((session) =>
          transitionUnit({
            unit,
            to: 'EXPIRED',
            by: 'SYSTEM',
            actor: SYSTEM_ACTOR,
            reason: 'Reached expiry date',
            session,
          }),
        );
        expired += 1;
      } catch (err) {
        // Someone changed the unit concurrently; the next sweep will look at it again.
        if (!(err instanceof AppError)) throw err;
      }
    }
    if (due.length < BATCH_SIZE) break;
  }
  if (expired) logger.info({ expired }, 'Expiry sweep marked units as expired');
  return expired;
}
