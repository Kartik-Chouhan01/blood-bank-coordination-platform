import type {
  AuditLogEntry,
  BloodBankView,
  CreateBloodBankInput,
  HospitalDetail,
  HospitalSelfView,
  HospitalSummary,
  InviteStaffInput,
  ListAuditLogsQuery,
  ListBloodBanksQuery,
  ListHospitalsQuery,
  UpdateBloodBankInput,
  UpdateHospitalProfileInput,
  UpdateHospitalVerificationInput,
  UserSummary,
} from '@bbms/shared';
import { apiGet, apiGetPage, apiPatch, apiPost } from '@/services/httpClient';

export const hospitalSelfApi = {
  get: () => apiGet<HospitalSelfView>('/hospitals/me'),
  update: (input: UpdateHospitalProfileInput) => apiPatch<HospitalSelfView>('/hospitals/me', input),
};

export const hospitalsApi = {
  list: (query: Partial<ListHospitalsQuery>) => apiGetPage<HospitalSummary>('/hospitals', query),
  get: (id: string) => apiGet<HospitalDetail>(`/hospitals/${id}`),
  setVerification: (id: string, input: UpdateHospitalVerificationInput) =>
    apiPatch<HospitalDetail>(`/hospitals/${id}/verification`, input),
};

export const bloodBanksApi = {
  list: (query: Partial<ListBloodBanksQuery>) => apiGetPage<BloodBankView>('/blood-banks', query),
  create: (input: CreateBloodBankInput) => apiPost<BloodBankView>('/blood-banks', input),
  update: (id: string, input: UpdateBloodBankInput) =>
    apiPatch<BloodBankView>(`/blood-banks/${id}`, input),
};

export const staffApi = {
  invite: (input: InviteStaffInput) => apiPost<UserSummary>('/users/staff', input),
  resendInvite: (id: string) => apiPost<null>(`/users/${id}/resend-invite`),
};

export const auditApi = {
  list: (query: Partial<ListAuditLogsQuery>) => apiGetPage<AuditLogEntry>('/audit-logs', query),
};
