import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { AuthSessionResponse, AuthUser, Role } from '@bbms/shared';
import { AuthProvider } from '@/context/AuthProvider';
import { routes } from '@/routes/routes';

export function makeUser(role: Role, overrides: Partial<AuthUser> = {}): AuthUser {
  const profile: AuthUser['profile'] =
    role === 'DONOR'
      ? {
          kind: 'DONOR',
          bloodGroup: 'O+',
          city: 'Pune',
          area: 'Hinjawadi',
          verificationStatus: 'PENDING',
        }
      : role === 'HOSPITAL'
        ? { kind: 'HOSPITAL', hospitalName: 'City General', verificationStatus: 'PENDING' }
        : null;
  return {
    id: 'user-1',
    name: 'Test Person',
    email: 'person@example.test',
    phone: '+910000000000',
    role,
    accountStatus: 'ACTIVE',
    emailVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    profile,
    ...overrides,
  };
}

export function sessionFor(user: AuthUser): AuthSessionResponse {
  return { user, accessToken: 'test-access-token', expiresIn: 900 };
}

/** Renders the real route tree inside the real AuthProvider at the given path. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return { ...utils, router };
}
