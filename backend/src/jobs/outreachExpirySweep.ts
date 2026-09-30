import { CLOSED_REQUEST_STATUSES } from '@bbms/shared';
import { logger } from '../config/logger.js';
import { DonorOutreachModel } from '../modules/matching/donorOutreach.model.js';
import { BloodRequestModel } from '../modules/requests/bloodRequest.model.js';

/**
 * Closes donor outreach that can no longer be useful: unanswered contacts become NO_RESPONSE once
 * their request is closed or past its required-by time, and the request's outreach is marked
 * CLOSED. Plain idempotent updates, safe to run anywhere at any time.
 */
export async function runOutreachExpirySweep(now = new Date()): Promise<number> {
  const pendingRequestIds = await DonorOutreachModel.distinct('requestId', { status: 'NOTIFIED' });
  const finished = pendingRequestIds.length
    ? await BloodRequestModel.find({
        _id: { $in: pendingRequestIds },
        $or: [{ status: { $in: [...CLOSED_REQUEST_STATUSES] } }, { requiredBy: { $lte: now } }],
      })
        .select('_id')
        .lean()
    : [];

  const { modifiedCount } = finished.length
    ? await DonorOutreachModel.updateMany(
        { requestId: { $in: finished.map((r) => r._id) }, status: 'NOTIFIED' },
        { $set: { status: 'NO_RESPONSE' } },
      )
    : { modifiedCount: 0 };
  await BloodRequestModel.updateMany(
    { outreachStatus: 'ACTIVE', status: { $in: [...CLOSED_REQUEST_STATUSES] } },
    { $set: { outreachStatus: 'CLOSED' } },
  );

  if (modifiedCount) logger.info({ closed: modifiedCount }, 'Outreach sweep closed stale contacts');
  return modifiedCount;
}
