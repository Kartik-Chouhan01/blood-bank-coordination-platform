import type { Types } from 'mongoose';
import {
  OPEN_REQUEST_STATUSES,
  type AllocationView,
  type BloodRequestDetail,
  type BloodRequestSummary,
  type RequestAction,
} from '@bbms/shared';
import { HospitalModel } from '../hospitals/hospital.model.js';
import { UserModel } from '../users/user.model.js';
import type { BloodRequest } from './bloodRequest.model.js';

const OPEN = new Set<string>(OPEN_REQUEST_STATUSES);

type HospitalRef = { id: string; name: string; city: string };
type NameRef = { id: string; name: string };

export async function loadRequestLookups(requests: BloodRequest[]) {
  const userIds = requests.flatMap((r) => [
    r.createdBy,
    r.reviewedBy,
    ...r.statusHistory.map((h) => h.by),
  ]);
  const [hospitals, users] = await Promise.all([
    HospitalModel.find({ _id: { $in: requests.map((r) => r.hospitalId) } })
      .select('name address.city')
      .lean(),
    UserModel.find({ _id: { $in: userIds.filter(Boolean) } })
      .select('name')
      .lean(),
  ]);
  const hospitalMap = new Map<string, HospitalRef>(
    hospitals.map((h) => [
      h._id.toString(),
      { id: h._id.toString(), name: h.name, city: h.address.city },
    ]),
  );
  const userMap = new Map<string, NameRef>(
    users.map((u) => [u._id.toString(), { id: u._id.toString(), name: u.name }]),
  );
  return {
    hospital: (id: Types.ObjectId) =>
      hospitalMap.get(id.toString()) ?? { id: id.toString(), name: 'Unknown hospital', city: '' },
    user: (id: Types.ObjectId | null) => (id ? (userMap.get(id.toString()) ?? null) : null),
  };
}

export type RequestLookups = Awaited<ReturnType<typeof loadRequestLookups>>;

export function toRequestSummary(
  request: BloodRequest,
  lookups: RequestLookups,
  now = new Date(),
): BloodRequestSummary {
  return {
    id: request._id.toString(),
    requestNumber: request.requestNumber,
    hospital: lookups.hospital(request.hospitalId),
    bloodGroup: request.bloodGroup,
    componentType: request.componentType,
    unitsRequested: request.unitsRequested,
    unitsAllocated: request.unitsAllocated,
    unitsIssued: request.unitsIssued,
    urgency: request.urgency,
    requiredBy: request.requiredBy.toISOString(),
    overdue: OPEN.has(request.status) && request.requiredBy <= now,
    status: request.status,
    reasonCategory: request.reasonCategory,
    createdAt: request.createdAt.toISOString(),
  };
}

export function toRequestDetail(
  request: BloodRequest,
  lookups: RequestLookups,
  extra: {
    allowedActions: RequestAction[];
    stock: BloodRequestDetail['stock'];
    allocations: AllocationView[];
  },
): BloodRequestDetail {
  return {
    ...toRequestSummary(request, lookups),
    hospitalReference: request.hospitalReference,
    notes: request.notes,
    statusReason: request.statusReason,
    createdBy: lookups.user(request.createdBy),
    reviewedBy: lookups.user(request.reviewedBy),
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    statusHistory: [...request.statusHistory].reverse().map((entry) => ({
      from: entry.from,
      to: entry.to,
      at: entry.at.toISOString(),
      by: lookups.user(entry.by),
      reason: entry.reason,
    })),
    allowedActions: extra.allowedActions,
    stock: extra.stock,
    allocations: extra.allocations,
    outreachStatus: request.outreachStatus,
  };
}
