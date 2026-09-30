import { Types, type QueryFilter } from 'mongoose';
import {
  EXPIRABLE_UNIT_STATUSES,
  hasPermission,
  type BloodUnitDetail,
  type InventorySummary,
  type ListBloodUnitsQuery,
  type UnitStatus,
  type UnitTransitionInput,
} from '@bbms/shared';
import { settings } from '../settings/settings.service.js';
import { manualTransitionsFrom } from '../../domain/inventory/unitStateMachine.js';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import { withTransaction } from '../../utils/mongoose.js';
import { buildPaginationMeta, pageToSkip } from '../../utils/pagination.js';
import { BloodUnitModel, type BloodUnit } from './bloodUnit.model.js';
import { loadLookups, toHistory, toUnitSummary } from './inventory.presenter.js';
import { assertCanManageBank, canManageBank, transitionUnit } from './unitTransitions.js';

const DAY_MS = 86_400_000;
const canOverride = (actor: Actor) =>
  actor.role !== 'SYSTEM' && hasPermission(actor.role, 'workflow:override');

export async function listUnits(query: ListBloodUnitsQuery) {
  const filter: QueryFilter<BloodUnit> = {};
  if (query.bloodBankId) filter.bloodBankId = query.bloodBankId;
  if (query.bloodGroup) filter.bloodGroup = query.bloodGroup;
  if (query.componentType) filter.componentType = query.componentType;
  if (query.status) filter.status = query.status;
  if (query.unitCode) filter.unitCode = { $regex: `^${query.unitCode.replace(/[^A-Z0-9-]/g, '')}` };
  if (query.expiringWithinDays !== undefined) {
    filter.expiryDate = { $lte: new Date(Date.now() + query.expiringWithinDays * DAY_MS) };
    if (!query.status) filter.status = { $in: [...EXPIRABLE_UNIT_STATUSES] };
  }

  const [units, total] = await Promise.all([
    BloodUnitModel.find(filter)
      .sort(query.sort === 'expiry' ? { expiryDate: 1, unitCode: 1 } : { createdAt: -1 })
      .skip(pageToSkip(query))
      .limit(query.limit)
      .lean(),
    BloodUnitModel.countDocuments(filter),
  ]);
  const lookups = await loadLookups({ banks: units.map((u) => u.bloodBankId) });
  return {
    items: units.map((u) => toUnitSummary(u, lookups)),
    meta: buildPaginationMeta(query, total),
  };
}

export async function getUnit(actor: Actor, id: string): Promise<BloodUnitDetail> {
  const unit = await BloodUnitModel.findById(id).lean();
  if (!unit) throw AppError.notFound('Blood unit');
  const lookups = await loadLookups({
    banks: [unit.bloodBankId],
    users: unit.statusHistory.map((h) => h.by),
    donors: [unit.donorId],
  });
  const allowed = canManageBank(actor, unit.bloodBankId)
    ? manualTransitionsFrom(unit.status, canOverride(actor)).map((rule) => ({
        to: rule.to,
        requiresReason: rule.requiresReason,
        override: rule.by === 'OVERRIDE',
        label: rule.label,
      }))
    : [];
  return {
    ...toUnitSummary(unit, lookups),
    donationId: unit.donationId.toString(),
    donor: lookups.donor(unit.donorId),
    statusHistory: toHistory(unit.statusHistory, lookups).reverse(),
    allowedTransitions: allowed,
  };
}

export async function transitionUnitManually(actor: Actor, id: string, input: UnitTransitionInput) {
  if (input.override && !canOverride(actor)) {
    throw AppError.forbidden('Only administrators can override the normal workflow.');
  }
  const unit = await BloodUnitModel.findById(id).lean();
  if (!unit) throw AppError.notFound('Blood unit');
  assertCanManageBank(actor, unit.bloodBankId);

  const returningToTesting = input.override && input.to === 'UNDER_TESTING';
  await withTransaction((session) =>
    transitionUnit({
      unit,
      to: input.to,
      by: input.override ? 'OVERRIDE' : 'STAFF',
      actor,
      reason: input.reason,
      // A unit returned to testing must be re-tested before it can be released again.
      ...(returningToTesting && { set: { testingStatus: 'PENDING' } }),
      session,
    }),
  );
  return getUnit(actor, id);
}

/** Usable stock excludes anything past expiry, whether or not the sweep has run yet. */
export async function getSummary(bloodBankId?: string): Promise<InventorySummary> {
  const now = new Date();
  const soon = new Date(now.getTime() + settings().expiryWarningDays * DAY_MS);
  const scope = bloodBankId ? { bloodBankId: new Types.ObjectId(bloodBankId) } : {};

  const [available, byStatus, expiringSoon, expiredAwaitingSweep] = await Promise.all([
    BloodUnitModel.aggregate<{
      _id: { bloodGroup: BloodUnit['bloodGroup']; componentType: BloodUnit['componentType'] };
      units: number;
    }>([
      { $match: { ...scope, status: 'AVAILABLE', expiryDate: { $gt: now } } },
      {
        $group: {
          _id: { bloodGroup: '$bloodGroup', componentType: '$componentType' },
          units: { $sum: 1 },
        },
      },
    ]),
    BloodUnitModel.aggregate<{ _id: UnitStatus; n: number }>([
      { $match: scope },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    BloodUnitModel.countDocuments({
      ...scope,
      status: 'AVAILABLE',
      expiryDate: { $gt: now, $lte: soon },
    }),
    BloodUnitModel.countDocuments({
      ...scope,
      status: { $in: [...EXPIRABLE_UNIT_STATUSES] },
      expiryDate: { $lte: now },
    }),
  ]);

  return {
    available: available.map((row) => ({ ...row._id, units: row.units })),
    byStatus: Object.fromEntries(byStatus.map((row) => [row._id, row.n])),
    expiringSoon,
    expiredAwaitingSweep,
    expiryWarningDays: settings().expiryWarningDays,
  };
}
