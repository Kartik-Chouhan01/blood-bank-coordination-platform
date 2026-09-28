import type {
  AcceptInviteInput,
  ApiSuccess,
  AuthSessionResponse,
  AuthUser,
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterDonorInput,
  RegisterHospitalInput,
  ResetPasswordInput,
} from '@bbms/shared';
import { apiGet, apiPost } from '@/services/httpClient';
import { toApiClientError } from '@/services/apiError';
import { sessionClient } from '@/services/session';

/** Credential endpoints go through the bare session client (no refresh-retry interceptor). */
async function sessionPost<T>(url: string, body?: unknown): Promise<T> {
  try {
    const res = await sessionClient.post<ApiSuccess<T>>(url, body);
    return res.data.data;
  } catch (err) {
    throw toApiClientError(err);
  }
}

export const authApi = {
  login: (input: LoginInput) => sessionPost<AuthSessionResponse>('/auth/login', input),
  registerDonor: (input: RegisterDonorInput) =>
    sessionPost<AuthSessionResponse>('/auth/register/donor', input),
  registerHospital: (input: RegisterHospitalInput) =>
    sessionPost<AuthSessionResponse>('/auth/register/hospital', input),
  logout: () => sessionPost<null>('/auth/logout'),
  logoutAll: () => apiPost<null>('/auth/logout-all'),
  me: () => apiGet<AuthUser>('/auth/me'),
  verifyEmail: (token: string) => sessionPost<null>('/auth/verify-email', { token }),
  resendVerification: () => apiPost<null>('/auth/resend-verification'),
  forgotPassword: (input: ForgotPasswordInput) => sessionPost<null>('/auth/forgot-password', input),
  resetPassword: (input: ResetPasswordInput) => sessionPost<null>('/auth/reset-password', input),
  acceptInvite: (input: AcceptInviteInput) =>
    sessionPost<AuthSessionResponse>('/auth/accept-invite', input),
  changePassword: (input: ChangePasswordInput) =>
    apiPost<AuthSessionResponse>('/auth/change-password', input),
};
