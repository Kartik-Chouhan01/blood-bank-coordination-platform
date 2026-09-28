import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '@bbms/shared';
import { ApiClientError } from '@/services/apiError';
import { refreshSession } from '@/services/session';
import type * as SessionModule from '@/services/session';
import { authApi } from '@/features/auth/api';
import { makeUser, renderApp, sessionFor } from '@/test/renderApp';

vi.mock('@/features/system/api', () => ({
  fetchHealth: vi.fn().mockResolvedValue({ status: 'ok', checks: { database: 'up' } }),
}));

vi.mock('@/services/session', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  refreshSession: vi.fn(),
}));

vi.mock('@/features/auth/api', () => ({
  authApi: { login: vi.fn(), logout: vi.fn().mockResolvedValue(null), me: vi.fn() },
}));

const noSession = () =>
  vi
    .mocked(refreshSession)
    .mockRejectedValue(new ApiClientError('No session', ERROR_CODES.SESSION_EXPIRED, 401));

const signedInAs = (role: Parameters<typeof makeUser>[0]) =>
  vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser(role)));

beforeEach(() => {
  vi.mocked(refreshSession).mockReset();
  vi.mocked(authApi.login).mockReset();
});

describe('public routes', () => {
  it('shows the mission, registration calls to action and live system status', async () => {
    noSession();
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/every unit matters/i);
    expect(screen.getByRole('link', { name: /become a donor/i })).toHaveAttribute(
      'href',
      '/register/donor',
    );
    expect(await screen.findByText('All systems operational')).toBeInTheDocument();
  });

  it('always shows the medical safety notice on the landing page', () => {
    noSession();
    renderApp('/');
    expect(
      screen.getByRole('complementary', { name: /medical safety notice/i }),
    ).toBeInTheDocument();
  });

  it('renders a not-found page for unknown paths', async () => {
    noSession();
    renderApp('/definitely-not-a-page');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});

describe('route guards', () => {
  it('sends anonymous visitors of a dashboard to the sign-in page', async () => {
    noSession();
    const { router } = renderApp('/admin/users');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('shows "no access" when a donor opens an admin page', async () => {
    signedInAs('DONOR');
    renderApp('/admin/users');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  });

  it('redirects signed-in users away from the login page to their dashboard', async () => {
    signedInAs('HOSPITAL');
    const { router } = renderApp('/login');
    await waitFor(() => expect(router.state.location.pathname).toBe('/hospital'));
    expect(
      await screen.findByText(/awaiting verification|reviewing your hospital/i),
    ).toBeInTheDocument();
  });
});

describe('sign-in flow', () => {
  it('validates on the client before calling the API', async () => {
    noSession();
    renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('signs in and lands on the role dashboard', async () => {
    noSession();
    vi.mocked(authApi.login).mockResolvedValue(
      sessionFor(makeUser('DONOR', { name: 'Asha Patil' })),
    );
    const { router } = renderApp('/login');

    await userEvent.type(await screen.findByLabelText(/email/i), 'asha@example.test');
    await userEvent.type(screen.getByLabelText(/^password/i), 'whatever-123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/donor'));
  });

  it('shows the server message on wrong credentials', async () => {
    noSession();
    vi.mocked(authApi.login).mockRejectedValue(
      new ApiClientError('Incorrect email or password.', ERROR_CODES.INVALID_CREDENTIALS, 401),
    );
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText(/email/i), 'asha@example.test');
    await userEvent.type(screen.getByLabelText(/^password/i), 'wrong-123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
  });

  it('returns to the originally requested page after signing in', async () => {
    noSession();
    vi.mocked(authApi.login).mockResolvedValue(sessionFor(makeUser('ADMIN')));
    const { router } = renderApp('/admin/users');

    await userEvent.type(await screen.findByLabelText(/email/i), 'admin@example.test');
    await userEvent.type(screen.getByLabelText(/^password/i), 'whatever-123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users'));
  });

  it('does not send the next user to the previous user’s page after a sign-out', async () => {
    signedInAs('ADMIN');
    vi.mocked(authApi.login).mockResolvedValue(sessionFor(makeUser('DONOR')));
    const { router } = renderApp('/admin/users');

    await userEvent.click(await screen.findByRole('button', { name: /sign out/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));

    await userEvent.type(await screen.findByLabelText(/email/i), 'donor@example.test');
    await userEvent.type(screen.getByLabelText(/^password/i), 'whatever-123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/donor'));
  });
});
