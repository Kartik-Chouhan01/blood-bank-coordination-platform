import type {
  BloodRequestDetail,
  BloodRequestSummary,
  CancelRequestInput,
  CreateRequestInput,
  EscalateRequestInput,
  ListRequestsQuery,
  RequestStats,
  ReviewRequestInput,
  UpdateRequestInput,
} from '@bbms/shared';
import { apiGet, apiGetPage, apiPatch, apiPost } from '@/services/httpClient';

export const requestsApi = {
  // Hospital
  create: (input: CreateRequestInput) => apiPost<BloodRequestDetail>('/requests', input),
  mine: (query: Partial<ListRequestsQuery>) =>
    apiGetPage<BloodRequestSummary>('/requests/mine', query),
  myStats: () => apiGet<RequestStats>('/requests/mine/stats'),
  update: (id: string, input: UpdateRequestInput) =>
    apiPatch<BloodRequestDetail>(`/requests/${id}`, input),
  escalate: (id: string, input: EscalateRequestInput) =>
    apiPost<BloodRequestDetail>(`/requests/${id}/escalate`, input),
  confirmReceipt: (id: string) => apiPost<BloodRequestDetail>(`/requests/${id}/confirm-receipt`),
  // Staff
  list: (query: Partial<ListRequestsQuery>) => apiGetPage<BloodRequestSummary>('/requests', query),
  stats: () => apiGet<RequestStats>('/requests/stats'),
  review: (id: string, input: ReviewRequestInput) =>
    apiPost<BloodRequestDetail>(`/requests/${id}/review`, input),
  // Both
  get: (id: string) => apiGet<BloodRequestDetail>(`/requests/${id}`),
  cancel: (id: string, input: CancelRequestInput) =>
    apiPost<BloodRequestDetail>(`/requests/${id}/cancel`, input),
};
