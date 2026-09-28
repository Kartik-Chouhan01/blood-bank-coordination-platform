import { Types, type QueryFilter } from 'mongoose';
import {
  ERROR_CODES,
  type BloodBankView,
  type CreateBloodBankInput,
  type ListBloodBanksQuery,
  type UpdateBloodBankInput,
} from '@bbms/shared';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import { withTransaction } from '../../utils/mongoose.js';
import { buildPaginationMeta, escapeRegex, pageToSkip } from '../../utils/pagination.js';
import { recordAudit } from '../audit/audit.service.js';
import { UserModel } from '../users/user.model.js';
import { BloodBankModel, type BloodBank } from './bloodBank.model.js';

function toView(bank: BloodBank, staffCount: number): BloodBankView {
  return {
    id: bank._id.toString(),
    name: bank.name,
    code: bank.code,
    address: bank.address,
    contactPhone: bank.contactPhone,
    contactEmail: bank.contactEmail,
    isActive: bank.isActive,
    staffCount,
    createdAt: bank.createdAt.toISOString(),
  };
}

async function staffCounts(bankIds: Types.ObjectId[]): Promise<Map<string, number>> {
  const counts = await UserModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { bloodBankId: { $in: bankIds }, role: 'BLOOD_BANK_STAFF' } },
    { $group: { _id: '$bloodBankId', count: { $sum: 1 } } },
  ]);
  return new Map(counts.map((row) => [row._id.toString(), row.count]));
}

const duplicateCode = () =>
  AppError.conflict('A blood bank with this code already exists.', ERROR_CODES.DUPLICATE_RESOURCE);

const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;

/** Fields recorded in audit entries (all institutional, no personal data). */
const auditable = (bank: BloodBank) => ({
  name: bank.name,
  code: bank.code,
  city: bank.address.city,
  isActive: bank.isActive,
});

export async function listBloodBanks(query: ListBloodBanksQuery) {
  const filter: QueryFilter<BloodBank> = {};
  if (query.active) filter.isActive = query.active === 'true';
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: pattern }, { code: pattern }, { 'address.city': pattern }];
  }
  const [banks, total] = await Promise.all([
    BloodBankModel.find(filter).sort({ name: 1 }).skip(pageToSkip(query)).limit(query.limit).lean(),
    BloodBankModel.countDocuments(filter),
  ]);
  const counts = await staffCounts(banks.map((bank) => bank._id));
  return {
    items: banks.map((bank) => toView(bank, counts.get(bank._id.toString()) ?? 0)),
    meta: buildPaginationMeta(query, total),
  };
}

export async function getBloodBank(id: string) {
  const bank = await BloodBankModel.findById(id).lean();
  if (!bank) throw AppError.notFound('Blood bank');
  const counts = await staffCounts([bank._id]);
  return toView(bank, counts.get(bank._id.toString()) ?? 0);
}

export async function createBloodBank(actor: Actor, input: CreateBloodBankInput) {
  try {
    return await withTransaction(async (session) => {
      const [bank] = await BloodBankModel.create([input], { session });
      await recordAudit(
        actor,
        {
          action: 'BLOOD_BANK_CREATED',
          entityType: 'BloodBank',
          entityId: bank!._id,
          after: auditable(bank!),
        },
        session,
      );
      return toView(bank!.toObject(), 0);
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw duplicateCode();
    throw err;
  }
}

export async function updateBloodBank(actor: Actor, id: string, input: UpdateBloodBankInput) {
  const bankId = new Types.ObjectId(id);
  try {
    return await withTransaction(async (session) => {
      const before = await BloodBankModel.findById(bankId).session(session).lean();
      if (!before) throw AppError.notFound('Blood bank');
      const after = await BloodBankModel.findOneAndUpdate(
        { _id: bankId },
        { $set: input },
        { session, returnDocument: 'after', runValidators: true },
      ).lean();
      await recordAudit(
        actor,
        {
          action: 'BLOOD_BANK_UPDATED',
          entityType: 'BloodBank',
          entityId: bankId,
          before: auditable(before),
          after: auditable(after!),
        },
        session,
      );
      const counts = await staffCounts([bankId]);
      return toView(after!, counts.get(id) ?? 0);
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw duplicateCode();
    throw err;
  }
}
