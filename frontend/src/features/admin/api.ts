import type {
  DeleteAccountInput,
  ListUsersQuery,
  SettingView,
  UpdateSettingsInput,
  UpdateUserStatusInput,
  UserSummary,
} from '@bbms/shared';
import { apiGet, apiGetPage, apiPatch, apiPost } from '@/services/httpClient';

export const usersApi = {
  list: (query: Partial<ListUsersQuery>) => apiGetPage<UserSummary>('/users', query),
  updateStatus: (id: string, input: UpdateUserStatusInput) =>
    apiPatch<UserSummary>(`/users/${id}/status`, input),
  /** Donors: anonymise and close their own account. */
  deleteMe: (input: DeleteAccountInput) => apiPost<null>('/users/me/delete', input),
};

/** Administrators: platform policies (every change needs a reason and is audited). */
export const settingsApi = {
  list: () => apiGet<SettingView[]>('/settings'),
  update: (input: UpdateSettingsInput) => apiPatch<SettingView[]>('/settings', input),
};
