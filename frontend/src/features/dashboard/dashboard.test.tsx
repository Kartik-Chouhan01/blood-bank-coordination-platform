import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BLOOD_GROUPS,
  type AnalyticsReport,
  type PublicStats,
  type StaffOverview,
} from '@bbms/shared';
import { refreshSession } from '@/services/session';
import type * as SessionModule from '@/services/session';
import { makeUser, renderApp, sessionFor } from '@/test/renderApp';
import type * as NotificationsApiModule from '@/features/notifications/api';
import { dashboardApi } from './api';

vi.mock('@/services/session', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  refreshSession: vi.fn(),
}));

vi.mock('./api', () => ({
  dashboardApi: { publicStats: vi.fn(), overview: vi.fn(), analytics: vi.fn(), hospital: vi.fn() },
}));

vi.mock('@/features/organisations/api', () => ({
  bloodBanksApi: {
    list: vi.fn().mockResolvedValue({
      items: [{ id: 'b1', name: 'Central', code: 'CEN' }],
      meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
    }),
  },
}));

vi.mock('@/features/notifications/api', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationsApiModule>()),
  notificationsApi: {
    unreadCount: vi.fn().mockResolvedValue({ unread: 0, critical: 0 }),
    list: vi.fn(),
  },
}));

const overview: StaffOverview = {
  requests: {
    open: 5,
    pendingReview: 2,
    overdue: 1,
    openByUrgency: { EMERGENCY: 1, URGENT: 1, ROUTINE: 3 },
  },
  stockByGroup: BLOOD_GROUPS.map((bloodGroup, i) => ({ bloodGroup, units: i * 2 })),
  expiringSoon: 3,
  expiryWarningDays: 3,
  awaitingIssue: 4,
  outreach: { awaitingReply: 6, interested: 2 },
  verification: { hospitalsPending: null, donorsPending: 1 },
  bloodBank: { id: 'b1', name: 'Central' },
};

function report(days: 30 | 90 = 30): AnalyticsReport {
  const bucket = days === 30 ? 'day' : 'week';
  const keys =
    days === 30
      ? ['2026-09-28', '2026-09-29', '2026-09-30']
      : ['2026-09-14', '2026-09-21', '2026-09-28'];
  return {
    range: { from: '', to: '', days, bucket, timeZone: 'Asia/Kolkata' },
    bloodBank: null,
    totals: {
      requestsRaised: 12,
      emergencyRequests: 3,
      requestsFulfilled: 8,
      fulfilmentRate: 0.8,
      medianHoursToFulfil: 5.5,
      emergencyMedianHoursToFulfil: 0.5,
      unitsIssued: 20,
      donations: 9,
      unitsExpired: 2,
      unitsDiscarded: 1,
      expiryWastageRate: 0.091,
      donorsContacted: 10,
      donorsInterested: 4,
    },
    series: keys.map((bucketKey, i) => ({
      bucket: bucketKey,
      requestsRaised: 4 + i,
      requestsFulfilled: 2 + i,
      unitsIssued: 6 + i,
      donations: 3,
      unitsExpired: i,
    })),
    byBloodGroup: BLOOD_GROUPS.map((bloodGroup) => ({
      bloodGroup,
      unitsRequested: bloodGroup === 'O-' ? 7 : 1,
      unitsIssued: bloodGroup === 'O-' ? 5 : 1,
    })),
  };
}

beforeEach(() => {
  vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('BLOOD_BANK_STAFF')));
  vi.mocked(dashboardApi.overview).mockResolvedValue(overview);
  vi.mocked(dashboardApi.analytics).mockImplementation(async (q) => report(q.days as 30 | 90));
});

describe('staff home', () => {
  it('leads with what needs attention and shows stock by group with a table view', async () => {
    renderApp('/admin');
    expect(await screen.findByText('Open requests')).toBeInTheDocument();
    expect(screen.getByText('1 emergency')).toBeInTheDocument();
    expect(screen.getByText('2 awaiting review · 1 overdue')).toBeInTheDocument();
    expect(screen.getByText('At Central')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Usable units per blood group at Central/ }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show table' }));
    const table = screen.getByRole('table', { name: 'Usable stock by blood group' });
    expect(within(table).getByRole('rowheader', { name: 'O-' }).closest('tr')).toHaveTextContent(
      '14',
    );
  });

  it('links to analytics for staff', async () => {
    renderApp('/admin');
    expect(await screen.findByRole('link', { name: /Analytics.*Open analytics/s })).toHaveAttribute(
      'href',
      '/admin/analytics',
    );
  });
});

describe('analytics', () => {
  it('shows headline figures, a trend with a readable tooltip, and demand by group', async () => {
    renderApp('/admin/analytics');
    expect(await screen.findByText('80%')).toBeInTheDocument();
    expect(screen.getByText('5.5 h')).toBeInTheDocument();
    expect(screen.getByText('Emergencies: 30 min')).toBeInTheDocument();
    expect(screen.getByText('9%')).toBeInTheDocument();

    // Two series → a legend; keyboard focus reads the latest point.
    const trend = screen.getByRole('img', { name: /Raised and Fulfilled per day/ });
    const hit = within(trend).getByLabelText(/arrow keys/);
    fireEvent.focus(hit);
    const tooltip = await screen.findByRole('status');
    // Formatted in the viewer's locale, so build the expectation the same way.
    const day = new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date('2026-09-30T00:00:00Z'));
    expect(tooltip).toHaveTextContent(day);
    expect(tooltip).toHaveTextContent('6Raised');
    fireEvent.keyDown(hit, { key: 'ArrowLeft' });
    expect(screen.getByRole('status')).toHaveTextContent('5Raised');

    await userEvent.click(screen.getByRole('button', { name: 'Units' }));
    expect(screen.getByRole('img', { name: /Issued and Expired per day/ })).toBeInTheDocument();

    expect(screen.getByRole('img', { name: 'O-, Requested: 7' })).toBeInTheDocument();
  });

  it('refetches for a new period and keeps the previous charts while loading', async () => {
    renderApp('/admin/analytics');
    await screen.findByText('80%');
    let resolve!: (r: AnalyticsReport) => void;
    vi.mocked(dashboardApi.analytics).mockImplementationOnce(
      () => new Promise((r) => (resolve = r)),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Last 90 days' }));
    expect(dashboardApi.analytics).toHaveBeenLastCalledWith({ days: 90 });
    // The old figures stay on screen (dimmed) instead of a spinner.
    expect(screen.getByText('80%')).toBeInTheDocument();
    resolve(report(90));
    await waitFor(() => expect(screen.getByRole('img', { name: /per week/ })).toBeInTheDocument());
  });

  it('is not available to hospitals', async () => {
    vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('HOSPITAL')));
    renderApp('/admin/analytics');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  });
});

describe('public stock levels', () => {
  it('shows levels, never counts, on the landing page', async () => {
    vi.mocked(refreshSession).mockRejectedValue(new Error('signed out'));
    const stats: PublicStats = {
      stock: BLOOD_GROUPS.map((bloodGroup) => ({
        bloodGroup,
        level: bloodGroup === 'O-' ? 'LOW' : bloodGroup === 'A+' ? 'MODERATE' : 'GOOD',
      })),
      updatedAt: '2026-09-30T10:00:00.000Z',
    };
    vi.mocked(dashboardApi.publicStats).mockResolvedValue(stats);
    renderApp('/');
    const heading = await screen.findByRole('heading', { name: 'Blood stock right now' });
    const section = heading.closest('section')!;
    expect(await within(section).findByText('Low')).toBeInTheDocument();
    expect(within(section).getByText('Moderate')).toBeInTheDocument();
    expect(within(section).getAllByText('Good')).toHaveLength(6);
    expect(within(section).getByText(/exact counts are not published/)).toBeInTheDocument();
  });
});
