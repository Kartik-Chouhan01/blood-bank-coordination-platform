import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthSessionResponse, AuthUser } from '@bbms/shared';
import { authApi } from '@/features/auth/api';
import { onSessionExpired, refreshSession, setAccessToken } from '@/services/session';
import { AuthContext, type AuthContextValue, type AuthStatus } from './authContext';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  sessionExpired: boolean;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    sessionExpired: false,
  });

  // Restore the session from the httpOnly refresh cookie on page load.
  useEffect(() => {
    let active = true;
    refreshSession()
      .then((session) => {
        if (active)
          setState({ status: 'authenticated', user: session.user, sessionExpired: false });
      })
      .catch(() => {
        if (active) setState({ status: 'anonymous', user: null, sessionExpired: false });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      onSessionExpired(() =>
        setState((prev) => ({
          status: 'anonymous',
          user: null,
          sessionExpired: prev.status === 'authenticated',
        })),
      ),
    [],
  );

  const applySession = useCallback((session: AuthSessionResponse) => {
    setAccessToken(session.accessToken);
    setState({ status: 'authenticated', user: session.user, sessionExpired: false });
  }, []);

  const endSession = useCallback(() => {
    setAccessToken(null);
    setState({ status: 'anonymous', user: null, sessionExpired: false });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      applySession,
      login: async (input) => {
        const session = await authApi.login(input);
        applySession(session);
        return session.user;
      },
      registerDonor: async (input) => {
        const session = await authApi.registerDonor(input);
        applySession(session);
        return session.user;
      },
      registerHospital: async (input) => {
        const session = await authApi.registerHospital(input);
        applySession(session);
        return session.user;
      },
      logout: async () => {
        // Sign out locally even if the server is unreachable.
        await authApi.logout().catch(() => undefined);
        endSession();
      },
      logoutAll: async () => {
        await authApi.logoutAll();
        endSession();
      },
      refreshUser: async () => {
        const user = await authApi.me();
        setState((prev) => ({ ...prev, user }));
      },
    }),
    [state, applySession, endSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
