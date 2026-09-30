import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationView } from '@bbms/shared';
import { refreshSession } from '@/services/session';
import type * as SessionModule from '@/services/session';
import { makeUser, renderApp, sessionFor } from '@/test/renderApp';
import type * as NotificationsApiModule from './api';
import { notificationsApi } from './api';

vi.mock('@/services/session', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  refreshSession: vi.fn(),
}));

// Keep the real change-announcement helpers; only the HTTP calls are mocked.
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationsApiModule>()),
  notificationsApi: {
    list: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function note(overrides: Partial<NotificationView> = {}): NotificationView {
  return {
    id: 'n1',
    type: 'URGENT_REQUEST',
    title: 'Emergency request REQ-260930-0001',
    message: 'City General Hospital, Pune needs 2 × O- packed red blood cells.',
    priority: 'CRITICAL',
    link: '/admin/requests/r1',
    readAt: null,
    createdAt: minutesAgo(5),
    ...overrides,
  };
}

const page = (items: NotificationView[]) => ({
  items,
  meta: { page: 1, limit: 20, total: items.length, totalPages: 1 },
});

beforeEach(() => {
  vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('BLOOD_BANK_STAFF')));
  vi.mocked(notificationsApi.unreadCount).mockResolvedValue({ unread: 2, critical: 1 });
  vi.mocked(notificationsApi.list).mockResolvedValue(
    page([
      note(),
      note({
        id: 'n2',
        type: 'DONOR_INTERESTED',
        priority: 'HIGH',
        title: 'A donor can help with REQ-260930-0002',
        link: '/admin/requests/r2',
        createdAt: minutesAgo(90),
      }),
      note({
        id: 'n3',
        type: 'RESERVATION_RELEASED',
        priority: 'NORMAL',
        title: 'Reservation released',
        readAt: minutesAgo(10),
        createdAt: minutesAgo(600),
      }),
    ]),
  );
  vi.mocked(notificationsApi.markRead).mockImplementation(async (id) =>
    note({ id, readAt: new Date().toISOString() }),
  );
  vi.mocked(notificationsApi.markAllRead).mockResolvedValue({ marked: 2 });
});

describe('notification bell', () => {
  it('announces unread and critical counts, and lists the latest notifications', async () => {
    renderApp('/admin');
    const bell = await screen.findByRole('button', {
      name: 'Notifications, 2 unread, 1 critical',
    });
    expect(bell).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(bell);
    const panel = await screen.findByRole('region', { name: 'Latest notifications' });
    expect(await within(panel).findByText('Emergency request REQ-260930-0001')).toBeInTheDocument();
    expect(within(panel).getByText('Critical:')).toBeInTheDocument();
    expect(within(panel).getAllByText('Unread')).toHaveLength(2);
    expect(notificationsApi.list).toHaveBeenCalledWith({ limit: 8 });
  });

  it('marks a notification read and follows its link', async () => {
    const { router } = renderApp('/admin');
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications, 2 unread/ }));
    await userEvent.click(await screen.findByText('A donor can help with REQ-260930-0002'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/requests/r2'));
    expect(notificationsApi.markRead).toHaveBeenCalledWith('n2');
    expect(screen.queryByRole('region', { name: 'Latest notifications' })).not.toBeInTheDocument();
    // The badge refreshes after the read is announced.
    await waitFor(() => expect(notificationsApi.unreadCount).toHaveBeenCalledTimes(2));
  });

  it('marks everything read and closes on Escape', async () => {
    renderApp('/admin');
    const bell = await screen.findByRole('button', { name: /^Notifications, 2 unread/ });
    await userEvent.click(bell);
    const panel = await screen.findByRole('region', { name: 'Latest notifications' });
    await within(panel).findByText('Reservation released');

    vi.mocked(notificationsApi.unreadCount).mockResolvedValue({ unread: 0, critical: 0 });
    await userEvent.click(within(panel).getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(within(panel).queryByText('Unread')).not.toBeInTheDocument());
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Latest notifications' })).not.toBeInTheDocument();
  });
});

describe('notifications page', () => {
  it('filters to unread and marks items read when opened', async () => {
    renderApp('/notifications');
    expect(await screen.findByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    await screen.findByText('Emergency request REQ-260930-0001');

    await userEvent.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() =>
      expect(notificationsApi.list).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        unread: 'true',
      }),
    );
    expect(screen.getByRole('button', { name: 'Unread' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an empty state', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue(page([]));
    renderApp('/notifications');
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
  });
});
