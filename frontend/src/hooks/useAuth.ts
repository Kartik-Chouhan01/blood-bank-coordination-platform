import { useContext } from 'react';
import { hasPermission, type Permission } from '@bbms/shared';
import { AuthContext } from '@/context/authContext';

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** UI-only check for hiding controls; the API enforces the real permission. */
export function usePermission(permission: Permission): boolean {
  const { user } = useAuth();
  return hasPermission(user?.role, permission);
}
