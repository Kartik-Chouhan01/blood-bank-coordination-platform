import type {
  BloodUnitDetail,
  BloodUnitSummary,
  DonationDetail,
  DonationSummary,
  DonorDonationView,
  InventorySummary,
  ListBloodUnitsQuery,
  ListDonationsQuery,
  RecordDonationInput,
  RecordTestResultInput,
  UnitTransitionInput,
} from '@bbms/shared';
import { apiGet, apiGetPage, apiPost } from '@/services/httpClient';

export const donationsApi = {
  list: (query: Partial<ListDonationsQuery>) => apiGetPage<DonationSummary>('/donations', query),
  get: (id: string) => apiGet<DonationDetail>(`/donations/${id}`),
  record: (input: RecordDonationInput) => apiPost<DonationDetail>('/donations', input),
  startTesting: (id: string) => apiPost<DonationDetail>(`/donations/${id}/start-testing`),
  recordResult: (id: string, input: RecordTestResultInput) =>
    apiPost<DonationDetail>(`/donations/${id}/test-result`, input),
  mine: () => apiGet<DonorDonationView[]>('/donors/me/donations'),
};

export const unitsApi = {
  list: (query: Partial<ListBloodUnitsQuery>) =>
    apiGetPage<BloodUnitSummary>('/blood-units', query),
  summary: (bloodBankId?: string) =>
    apiGet<InventorySummary>('/blood-units/summary', bloodBankId ? { bloodBankId } : undefined),
  get: (id: string) => apiGet<BloodUnitDetail>(`/blood-units/${id}`),
  transition: (id: string, input: UnitTransitionInput) =>
    apiPost<BloodUnitDetail>(`/blood-units/${id}/transitions`, input),
};
