import type {
  BloodRequestDetail,
  DonorCandidates,
  DonorOutreachSelfView,
  InventoryCandidates,
  ReleaseAllocationInput,
  RequestOutreachSummary,
  RespondOutreachInput,
  ReserveUnitsInput,
  StartOutreachInput,
} from '@bbms/shared';
import { apiGet, apiPost } from '@/services/httpClient';

/** Blood-bank staff: allocation and donor outreach. Mutations return the updated request. */
export const matchingApi = {
  inventory: (requestId: string) =>
    apiGet<InventoryCandidates>(`/matching/requests/${requestId}/inventory`),
  reserve: (requestId: string, input: ReserveUnitsInput) =>
    apiPost<BloodRequestDetail>(`/matching/requests/${requestId}/allocations`, input),
  release: (allocationId: string, input: ReleaseAllocationInput) =>
    apiPost<BloodRequestDetail>(`/matching/allocations/${allocationId}/release`, input),
  issue: (allocationId: string) =>
    apiPost<BloodRequestDetail>(`/matching/allocations/${allocationId}/issue`),
  donors: (requestId: string) => apiGet<DonorCandidates>(`/matching/requests/${requestId}/donors`),
  outreach: (requestId: string) =>
    apiGet<RequestOutreachSummary>(`/matching/requests/${requestId}/outreach`),
  startOutreach: (requestId: string, input: StartOutreachInput) =>
    apiPost<RequestOutreachSummary>(`/matching/requests/${requestId}/outreach`, input),
};

/** Donors: requests for help they were contacted about. */
export const donorOutreachApi = {
  mine: () => apiGet<DonorOutreachSelfView[]>('/donor-outreach/mine'),
  respond: (id: string, input: RespondOutreachInput) =>
    apiPost<DonorOutreachSelfView[]>(`/donor-outreach/${id}/respond`, input),
};
