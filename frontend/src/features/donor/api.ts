import type {
  DonorSelfView,
  DonorStaffDetail,
  DonorStaffSummary,
  ListDonorsQuery,
  NotificationPreferences,
  UpdateAvailabilityInput,
  UpdateDonorProfileInput,
  UpdateDonorVerificationInput,
  ConfirmBloodGroupInput,
} from '@bbms/shared';
import { apiGet, apiGetPage, apiPatch, httpClient } from '@/services/httpClient';
import type { ApiSuccess } from '@bbms/shared';

async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const res = await httpClient.put<ApiSuccess<T>>(url, body);
  return res.data.data;
}

/** The signed-in donor's own profile. */
export const donorSelfApi = {
  get: () => apiGet<DonorSelfView>('/donors/me'),
  update: (input: UpdateDonorProfileInput) => apiPatch<DonorSelfView>('/donors/me', input),
  setAvailability: (input: UpdateAvailabilityInput) =>
    apiPut<DonorSelfView>('/donors/me/availability', input),
  setNotificationPreferences: (input: NotificationPreferences) =>
    apiPut<DonorSelfView>('/donors/me/notification-preferences', input),
};

/** Blood-bank staff and administrators. */
export const donorStaffApi = {
  list: (query: Partial<ListDonorsQuery>) => apiGetPage<DonorStaffSummary>('/donors', query),
  get: (id: string) => apiGet<DonorStaffDetail>(`/donors/${id}`),
  setVerification: (id: string, input: UpdateDonorVerificationInput) =>
    apiPatch<DonorStaffDetail>(`/donors/${id}/verification`, input),
  confirmBloodGroup: (id: string, input: ConfirmBloodGroupInput) =>
    apiPatch<DonorStaffDetail>(`/donors/${id}/blood-group`, input),
};
