import { Types } from 'mongoose';
import {
  ERROR_CODES,
  OPEN_REQUEST_STATUSES,
  type DonorOutreachSelfView,
  type OutreachStatus,
  type RequestOutreachSummary,
  type RespondOutreachInput,
} from '@bbms/shared';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import { withTransaction } from '../../utils/mongoose.js';
import { recordAudit } from '../audit/audit.service.js';
import * as notify from '../notifications/notify.js';
import { DonorProfileModel } from '../donors/donorProfile.model.js';
import { HospitalModel } from '../hospitals/hospital.model.js';
import { BloodRequestModel } from '../requests/bloodRequest.model.js';
import { UserModel } from '../users/user.model.js';
import { DonorOutreachModel } from './donorOutreach.model.js';

const OPEN = new Set<string>(OPEN_REQUEST_STATUSES);
/** A donor may change their answer while the request is open; these are the answerable states. */
const ANSWERABLE = new Set<OutreachStatus>(['NOTIFIED', 'INTERESTED', 'DECLINED']);
/** Contact details are revealed to staff only once the donor said they are interested. */
const CONTACT_VISIBLE = new Set<OutreachStatus>(['INTERESTED', 'DONATED']);

// ─── Staff ───────────────────────────────────────────────────────────────────

export async function getRequestOutreach(requestId: string): Promise<RequestOutreachSummary> {
  if (!(await BloodRequestModel.exists({ _id: requestId }))) throw AppError.notFound('Request');
  const outreach = await DonorOutreachModel.find({ requestId: new Types.ObjectId(requestId) })
    .sort({ score: -1, notifiedAt: 1 })
    .lean();
  const donors = await DonorProfileModel.find({ _id: { $in: outreach.map((o) => o.donorId) } })
    .select('userId bloodGroup bloodGroupConfirmed location.city location.area')
    .lean();
  const donorMap = new Map(donors.map((d) => [d._id.toString(), d]));
  const revealUserIds = outreach
    .filter((o) => CONTACT_VISIBLE.has(o.status))
    .map((o) => donorMap.get(o.donorId.toString())?.userId)
    .filter((id): id is Types.ObjectId => !!id);
  const users = revealUserIds.length
    ? await UserModel.find({ _id: { $in: revealUserIds } })
        .select('name phone email')
        .lean()
    : [];
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const counts: Partial<Record<OutreachStatus, number>> = {};
  const items = outreach.map((o) => {
    counts[o.status] = (counts[o.status] ?? 0) + 1;
    const donor = donorMap.get(o.donorId.toString());
    const user =
      donor && CONTACT_VISIBLE.has(o.status) ? userMap.get(donor.userId.toString()) : undefined;
    return {
      id: o._id.toString(),
      status: o.status,
      bloodGroup: donor?.bloodGroup ?? 'O+',
      bloodGroupConfirmed: donor?.bloodGroupConfirmed ?? false,
      city: donor?.location.city ?? '',
      area: donor?.location.area ?? '',
      approxDistanceKm: o.approxDistanceKm,
      score: o.score,
      notifiedAt: o.notifiedAt.toISOString(),
      respondedAt: o.respondedAt?.toISOString() ?? null,
      contact: user ? { name: user.name, phone: user.phone, email: user.email } : null,
    };
  });
  return { requestId, outreach: items, counts };
}

// ─── Donor ───────────────────────────────────────────────────────────────────

async function ownDonorId(actor: Actor) {
  const donor = await DonorProfileModel.findOne({ userId: actor.userId }).select('_id').lean();
  if (!donor) throw AppError.notFound('Donor profile');
  return donor._id;
}

/**
 * The donor's own outreach. Deliberately shows only what they need to decide — group, component,
 * urgency, timing and city — never the hospital, its reference or anything about the patient.
 */
export async function listOwnOutreach(actor: Actor): Promise<DonorOutreachSelfView[]> {
  const donorId = await ownDonorId(actor);
  const outreach = await DonorOutreachModel.find({ donorId })
    .sort({ notifiedAt: -1 })
    .limit(50)
    .lean();
  const requests = await BloodRequestModel.find({ _id: { $in: outreach.map((o) => o.requestId) } })
    .select('bloodGroup componentType urgency requiredBy status hospitalId')
    .lean();
  const requestMap = new Map(requests.map((r) => [r._id.toString(), r]));
  const hospitals = await HospitalModel.find({ _id: { $in: requests.map((r) => r.hospitalId) } })
    .select('address.city')
    .lean();
  const cityOf = new Map(hospitals.map((h) => [h._id.toString(), h.address.city]));
  const now = new Date();

  return outreach.flatMap((o) => {
    const request = requestMap.get(o.requestId.toString());
    if (!request) return [];
    const open = OPEN.has(request.status) && request.requiredBy > now;
    return [
      {
        id: o._id.toString(),
        status: o.status,
        bloodGroupNeeded: request.bloodGroup,
        componentType: request.componentType,
        urgency: request.urgency,
        requiredBy: request.requiredBy.toISOString(),
        city: cityOf.get(request.hospitalId.toString()) ?? '',
        approxDistanceKm: o.approxDistanceKm,
        notifiedAt: o.notifiedAt.toISOString(),
        respondedAt: o.respondedAt?.toISOString() ?? null,
        open,
        canRespond: open && ANSWERABLE.has(o.status),
      },
    ];
  });
}

export async function respondToOutreach(actor: Actor, id: string, input: RespondOutreachInput) {
  const donorId = await ownDonorId(actor);
  // Another donor's outreach is reported as not found, so ids cannot be probed.
  const outreach = await DonorOutreachModel.findOne({ _id: id, donorId }).lean();
  if (!outreach) throw AppError.notFound('Request for help');
  const request = await BloodRequestModel.findById(outreach.requestId)
    .select('status requiredBy')
    .lean();
  if (!request || !OPEN.has(request.status) || request.requiredBy <= new Date()) {
    throw AppError.conflict(
      'This request is no longer open, so no response is needed. Thank you.',
      ERROR_CODES.INVALID_STATE_TRANSITION,
    );
  }
  if (!ANSWERABLE.has(outreach.status)) {
    throw AppError.conflict(
      'This request for help can no longer be answered.',
      ERROR_CODES.INVALID_STATE_TRANSITION,
    );
  }
  if (outreach.status === input.response) return;

  await withTransaction(async (session) => {
    const updated = await DonorOutreachModel.findOneAndUpdate(
      { _id: outreach._id, status: outreach.status },
      { $set: { status: input.response, respondedAt: new Date() } },
      { session },
    );
    if (!updated) {
      throw AppError.conflict('Your answer changed meanwhile. Refresh and try again.');
    }
    await recordAudit(
      actor,
      {
        action: 'DONOR_OUTREACH_RESPONDED',
        entityType: 'DonorOutreach',
        entityId: outreach._id,
        before: { status: outreach.status },
        after: { status: input.response },
      },
      session,
    );
  });
  if (input.response === 'INTERESTED') await notify.donorInterested(outreach._id);
}
