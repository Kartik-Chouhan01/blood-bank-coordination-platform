import { Types, type QueryFilter } from 'mongoose';
import {
  ERROR_CODES,
  type ListHospitalsQuery,
  type UpdateHospitalProfileInput,
  type UpdateHospitalVerificationInput,
} from '@bbms/shared';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import { withTransaction } from '../../utils/mongoose.js';
import { buildPaginationMeta, escapeRegex, pageToSkip } from '../../utils/pagination.js';
import { recordAudit } from '../audit/audit.service.js';
import { hospitalVerificationChanged } from '../notifications/notify.js';
import { UserModel } from '../users/user.model.js';
import { sendHospitalVerificationEmail } from './hospital.emails.js';
import { HospitalModel, type Hospital } from './hospital.model.js';
import {
  canEditIdentity,
  toHospitalDetail,
  toHospitalSelfView,
  toHospitalSummary,
} from './hospital.presenter.js';

const auditable = (hospital: Hospital) => ({
  name: hospital.name,
  registrationNumber: hospital.registrationNumber,
  city: hospital.address.city,
  operatingStatus: hospital.operatingStatus,
  verificationStatus: hospital.verificationStatus,
});

const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;
const duplicateRegistration = () =>
  AppError.conflict(
    'A hospital with this registration number is already registered.',
    ERROR_CODES.DUPLICATE_RESOURCE,
  );

async function contactsFor(hospitals: Hospital[]) {
  const users = await UserModel.find({ _id: { $in: hospitals.map((h) => h.userId) } })
    .select('name email phone')
    .lean();
  return new Map(users.map((user) => [user._id.toString(), user]));
}

// ─── Hospital self-service ───────────────────────────────────────────────────

async function findOwnHospital(actor: Actor) {
  const hospital = await HospitalModel.findOne({ userId: actor.userId }).lean();
  if (!hospital) throw AppError.notFound('Hospital');
  return hospital;
}

export async function getOwnHospital(actor: Actor) {
  return toHospitalSelfView(await findOwnHospital(actor));
}

/**
 * Hospitals keep their address and operating status current. Name and registration number are
 * what an administrator verified, so they are locked once verified; editing them after a
 * rejection resubmits the hospital for review.
 */
export async function updateOwnHospital(actor: Actor, input: UpdateHospitalProfileInput) {
  const current = await findOwnHospital(actor);
  const changesIdentity =
    (input.name !== undefined && input.name !== current.name) ||
    (input.registrationNumber !== undefined &&
      input.registrationNumber !== current.registrationNumber);

  if (changesIdentity && !canEditIdentity(current)) {
    throw AppError.conflict(
      'The hospital name and registration number are locked after verification. Contact an administrator to change them.',
      ERROR_CODES.CONFLICT,
    );
  }

  const resubmit = changesIdentity && current.verificationStatus === 'REJECTED';
  const set: Record<string, unknown> = { ...input };
  if (resubmit) Object.assign(set, { verificationStatus: 'PENDING', resubmittedAt: new Date() });

  try {
    const updated = await withTransaction(async (session) => {
      const after = await HospitalModel.findOneAndUpdate(
        { _id: current._id },
        { $set: set },
        { session, returnDocument: 'after', runValidators: true },
      ).lean();
      await recordAudit(
        actor,
        {
          action: 'HOSPITAL_PROFILE_UPDATED',
          entityType: 'Hospital',
          entityId: current._id,
          before: auditable(current),
          after: auditable(after!),
          ...(resubmit && { reason: 'Details corrected and resubmitted for verification' }),
        },
        session,
      );
      return after!;
    });
    return toHospitalSelfView(updated);
  } catch (err) {
    if (isDuplicateKey(err)) throw duplicateRegistration();
    throw err;
  }
}

// ─── Staff / admin ───────────────────────────────────────────────────────────

export async function listHospitals(query: ListHospitalsQuery) {
  const filter: QueryFilter<Hospital> = {};
  if (query.verificationStatus) filter.verificationStatus = query.verificationStatus;
  if (query.city) filter['address.city'] = new RegExp(`^${escapeRegex(query.city)}$`, 'i');
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: pattern }, { registrationNumber: pattern }];
  }

  // Pending reviews first, then newest.
  const [hospitals, total] = await Promise.all([
    HospitalModel.aggregate<Hospital>([
      { $match: filter },
      {
        $addFields: {
          _pendingFirst: { $cond: [{ $eq: ['$verificationStatus', 'PENDING'] }, 0, 1] },
        },
      },
      { $sort: { _pendingFirst: 1, createdAt: -1 } },
      { $skip: pageToSkip(query) },
      { $limit: query.limit },
      { $project: { _pendingFirst: 0 } },
    ]),
    HospitalModel.countDocuments(filter),
  ]);
  const contacts = await contactsFor(hospitals);
  return {
    items: hospitals.map((h) => toHospitalSummary(h, contacts.get(h.userId.toString()))),
    meta: buildPaginationMeta(query, total),
  };
}

export async function getHospital(id: string) {
  const hospital = await HospitalModel.findById(id).lean();
  if (!hospital) throw AppError.notFound('Hospital');
  const contacts = await contactsFor([hospital]);
  return toHospitalDetail(hospital, contacts.get(hospital.userId.toString()));
}

export async function updateHospitalVerification(
  actor: Actor,
  id: string,
  input: UpdateHospitalVerificationInput,
) {
  const hospitalId = new Types.ObjectId(id);
  const { after, contact } = await withTransaction(async (session) => {
    const before = await HospitalModel.findById(hospitalId).session(session).lean();
    if (!before) throw AppError.notFound('Hospital');
    if (before.verificationStatus === input.status) {
      throw AppError.conflict(
        `Hospital is already ${input.status.toLowerCase()}.`,
        ERROR_CODES.CONFLICT,
      );
    }

    const verified = input.status === 'VERIFIED';
    const updated = await HospitalModel.findOneAndUpdate(
      { _id: hospitalId },
      {
        $set: {
          verificationStatus: input.status,
          statusReason: verified ? null : input.reason,
          ...(verified && { verifiedBy: actor.userId, verifiedAt: new Date() }),
        },
      },
      { session, returnDocument: 'after' },
    ).lean();
    await recordAudit(
      actor,
      {
        action: 'HOSPITAL_VERIFICATION_CHANGED',
        entityType: 'Hospital',
        entityId: hospitalId,
        before: { verificationStatus: before.verificationStatus },
        after: { verificationStatus: input.status },
        reason: input.reason ?? null,
      },
      session,
    );
    const owner = await UserModel.findById(before.userId)
      .select('name email phone')
      .session(session)
      .lean();
    return { after: updated!, contact: owner ?? undefined };
  });

  // Sent after commit: a rolled-back decision must never be announced.
  if (contact) {
    await sendHospitalVerificationEmail(
      contact.email,
      contact.name,
      after.name,
      input.status,
      input.reason ?? null,
    );
  }
  await hospitalVerificationChanged(after._id, input.status, input.reason ?? null);
  return toHospitalDetail(after, contact);
}
