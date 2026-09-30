import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DonorSelfView } from '@bbms/shared';
import { refreshSession } from '@/services/session';
import type * as SessionModule from '@/services/session';
import { makeUser, renderApp, sessionFor } from '@/test/renderApp';
import { donorSelfApi } from './api';
import { AvailabilityCard } from './components/AvailabilityCard';
import { donorCompletionSteps } from './profileCompletion';

vi.mock('@/services/session', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  refreshSession: vi.fn(),
}));

vi.mock('./api', () => ({
  donorSelfApi: {
    get: vi.fn(),
    update: vi.fn(),
    setAvailability: vi.fn(),
    setNotificationPreferences: vi.fn(),
  },
  donorStaffApi: { list: vi.fn(), get: vi.fn() },
}));

vi.mock('@/features/matching/api', () => ({
  donorOutreachApi: { mine: vi.fn().mockResolvedValue([]), respond: vi.fn() },
  matchingApi: {},
}));

function makeDonor(overrides: Partial<DonorSelfView> = {}): DonorSelfView {
  return {
    id: 'donor-1',
    bloodGroup: 'O-',
    bloodGroupConfirmed: false,
    dateOfBirth: '1994-03-12',
    location: { city: 'Pune', area: 'Hinjawadi', hasApproximateLocation: false },
    lastDonationAt: null,
    donationCount: 0,
    availabilityStatus: 'AVAILABLE',
    effectiveAvailability: 'AVAILABLE',
    availableAgainAt: null,
    availabilityHistory: [
      { status: 'AVAILABLE', changedAt: '2026-09-01T10:00:00.000Z', availableAgainAt: null },
    ],
    verificationStatus: 'PENDING',
    notificationPreferences: {
      inApp: true,
      email: true,
      emergencyOnly: false,
      maxContactsPerWeek: 3,
    },
    earliestContactDate: null,
    contactIntervalDays: 90,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(donorSelfApi.get).mockReset();
  vi.mocked(donorSelfApi.setAvailability).mockReset();
  vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('DONOR')));
});

describe('AvailabilityCard', () => {
  it('only enables saving after a change, and asks for a return date when away', async () => {
    const onChange = vi.fn();
    const updated = makeDonor({ effectiveAvailability: 'TEMPORARILY_UNAVAILABLE' });
    vi.mocked(donorSelfApi.setAvailability).mockResolvedValue(updated);
    render(<AvailabilityCard donor={makeDonor()} onChange={onChange} />);

    const save = screen.getByRole('button', { name: 'Save availability' });
    expect(save).toBeDisabled();

    await userEvent.click(screen.getByRole('radio', { name: /away until a date/i }));
    expect(screen.getByLabelText('Available again on')).toBeInTheDocument();
    expect(save).toBeEnabled();

    await userEvent.click(save);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(updated));
    expect(donorSelfApi.setAvailability).toHaveBeenCalledWith({
      status: 'TEMPORARILY_UNAVAILABLE',
      availableAgainAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('sends no return date for other statuses', async () => {
    vi.mocked(donorSelfApi.setAvailability).mockResolvedValue(makeDonor());
    render(<AvailabilityCard donor={makeDonor()} onChange={() => {}} />);
    await userEvent.click(screen.getByRole('radio', { name: /do not contact/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Save availability' }));
    expect(donorSelfApi.setAvailability).toHaveBeenCalledWith({ status: 'DO_NOT_CONTACT' });
  });
});

describe('donorCompletionSteps', () => {
  it('marks staff-only steps as not actionable by the donor', () => {
    const steps = donorCompletionSteps(makeUser('DONOR'), makeDonor());
    const staffSteps = steps.filter((step) => !step.to);
    expect(staffSteps.map((s) => s.label)).toEqual([
      'Blood group confirmed by blood-bank staff',
      'Profile verified by blood-bank staff',
    ]);
  });
});

describe('donor pages', () => {
  it('shows the overview with profile completion and donor-only navigation', async () => {
    vi.mocked(donorSelfApi.get).mockResolvedValue(makeDonor());
    renderApp('/donor');

    expect(
      await screen.findByRole('progressbar', { name: 'Profile completion' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'My profile' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Donors' })).not.toBeInTheDocument();
  });

  it('locks the blood group once staff have confirmed it', async () => {
    vi.mocked(donorSelfApi.get).mockResolvedValue(makeDonor({ bloodGroupConfirmed: true }));
    renderApp('/donor/profile');
    expect(await screen.findByText(/Confirmed by blood-bank staff/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save blood group' })).not.toBeInTheDocument();
  });

  it('never phrases the contact interval as medical eligibility', async () => {
    vi.mocked(donorSelfApi.get).mockResolvedValue(
      makeDonor({
        lastDonationAt: '2026-08-01T00:00:00.000Z',
        earliestContactDate: '2026-10-30T00:00:00.000Z',
      }),
    );
    renderApp('/donor');
    expect(
      await screen.findByText(/will not contact you about donating before/),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\beligible\b/i);
  });

  it('keeps donors out of the staff donor list', async () => {
    renderApp('/admin/donors');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  });
});
