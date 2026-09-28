import type { ListUsersQuery, UpdateUserStatusInput, UserSummary } from '@bbms/shared';
import { apiGetPage, apiPatch } from '@/services/httpClient';

export const usersApi = {
  list: (query: Partial<ListUsersQuery>) => apiGetPage<UserSummary>('/users', query),
  updateStatus: (id: string, input: UpdateUserStatusInput) =>
    apiPatch<UserSummary>(`/users/${id}/status`, input),
};
