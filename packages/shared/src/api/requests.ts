import type { BloodGroup, ComponentType } from '../constants/blood.js';
import type { RequestReasonCategory } from '../constants/requests.js';
import type { RequestOutreachStatus, RequestStatus, Urgency } from '../constants/statuses.js';
import type { AllocationView } from './matching.js';

export interface RequestStatusChange {
  from: RequestStatus | null;
  to: RequestStatus;
  at: string;
  /** null for automatic system steps (auto-approval, expiry). */
  by: { id: string; name: string } | null;
  reason: string | null;
}

export type RequestAction =
  | 'EDIT'
  | 'ESCALATE'
  | 'CANCEL'
  | 'REVIEW'
  /** Staff: reserve units from inventory. */
  | 'ALLOCATE'
  /** Staff: search for and contact potential donors. */
  | 'OUTREACH'
  /** Hospital: confirm that issued units arrived. */
  | 'CONFIRM_RECEIPT';

export interface BloodRequestSummary {
  id: string;
  requestNumber: string;
  hospital: { id: string; name: string; city: string };
  bloodGroup: BloodGroup;
  componentType: ComponentType;
  unitsRequested: number;
  unitsAllocated: number;
  unitsIssued: number;
  urgency: Urgency;
  requiredBy: string;
  /** Still open and past its required-by time. */
  overdue: boolean;
  status: RequestStatus;
  reasonCategory: RequestReasonCategory;
  createdAt: string;
}

export interface BloodRequestDetail extends BloodRequestSummary {
  hospitalReference: string | null;
  notes: string | null;
  statusReason: string | null;
  createdBy: { id: string; name: string } | null;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  statusHistory: RequestStatusChange[];
  /** What the current viewer may do right now. */
  allowedActions: RequestAction[];
  /** Staff only: usable, compatible units in stock for this request. */
  stock: { exact: number; compatibleSubstitutes: number } | null;
  /** Units reserved, issued and received against this request (releases are kept for history). */
  allocations: AllocationView[];
  outreachStatus: RequestOutreachStatus;
}

export interface RequestStats {
  open: number;
  pendingReview: number;
  openEmergency: number;
  openUrgent: number;
  overdue: number;
}
