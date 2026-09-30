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
  /** True right after the user deliberately signed out on this device. */
  signedOut: boolean;
  /** True right after the user deleted their own account. */
  accountDeleted: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  registerDonor: (input: RegisterDonorInput) => Promise<AuthUser>;
  registerHospital: (input: RegisterHospitalInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  /** Ends the local session after the server anonymised the account (its sessions are gone). */
  endDeletedAccount: () => void;
  refreshUser: () => Promise<void>;
  applySession: (session: AuthSessionResponse) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
