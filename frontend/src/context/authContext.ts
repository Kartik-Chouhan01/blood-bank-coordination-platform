import { createContext } from 'react';
import type {
  AuthSessionResponse,
  AuthUser,
  LoginInput,
  RegisterDonorInput,
  RegisterHospitalInput,
} from '@bbms/shared';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** True when the session ended on its own (expiry, suspension, sign-out elsewhere). */
  sessionExpired: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  registerDonor: (input: RegisterDonorInput) => Promise<AuthUser>;
  registerHospital: (input: RegisterHospitalInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshUser: () => Promise<void>;
  applySession: (session: AuthSessionResponse) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
