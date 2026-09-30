import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTING_KEYS, type SettingKey, type SettingView } from '@bbms/shared';
import { refreshSession } from '@/services/session';
import type * as SessionModule from '@/services/session';
import type * as AdminApiModule from './api';
import { makeUser, renderApp, sessionFor } from '@/test/renderApp';
import { settingsApi, usersApi } from './api';

vi.mock('@/services/session', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  refreshSession: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof AdminApiModule>()),
  settingsApi: { list: vi.fn(), update: vi.fn() },
  usersApi: { list: vi.fn(), updateStatus: vi.fn(), deleteMe: vi.fn() },
}));

const VALUES: Record<SettingKey, number | boolean> = {
  donorContactIntervalDays: 90,
  donorSearchRadiusKm: 25,
  emergencyDonorSearchRadiusKm: 50,
  outreachDonorsPerUnit: 3,
  outreachMaxDonors: 30,
  allowCompatibleSubstitutes: true,
  conserveUniversalDonors: true,
  reservationHoldHours: 24,
  requestExpiryGraceHours: 2,
  expiryWarningDays: 3,
  publicStockLowBelow: 5,
  publicStockGoodFrom: 15,
};

const settings = (overrides: Partial<Record<SettingKey, number | boolean>> = {}): SettingView[] =>
  SETTING_KEYS.map((key) => ({
    key,
    value: overrides[key] ?? VALUES[key],
    defaultValue: VALUES[key],
    updatedAt: null,
    updatedBy: null,
  }));

beforeEach(() => {
  vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('ADMIN')));
  vi.mocked(settingsApi.list).mockResolvedValue(settings());
});

describe('system settings page', () => {
  it('saves only the changed settings, with a reason', async () => {
    vi.mocked(settingsApi.update).mockResolvedValue(
      settings({ reservationHoldHours: 12, allowCompatibleSubstitutes: false }),
    );
    renderApp('/admin/settings');

    const hold = await screen.findByLabelText(/Reservation hold/);
    await userEvent.clear(hold);
    await userEvent.type(hold, '12');
    await userEvent.click(
      screen.getByRole('switch', { name: /Offer compatible substitute groups/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save 2 changes' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('24 hours → 12 hours');
    expect(dialog).toHaveTextContent('On → Off');
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox'), 'Shorter holds this season');
    await userEvent.click(save);

    await waitFor(() =>
      expect(settingsApi.update).toHaveBeenCalledWith({
        changes: { reservationHoldHours: 12, allowCompatibleSubstitutes: false },
        reason: 'Shorter holds this season',
      }),
    );
    expect(await screen.findByText(/Settings saved/)).toBeInTheDocument();
  });

  it('blocks out-of-range values before anything is sent', async () => {
    renderApp('/admin/settings');
    const hold = await screen.findByLabelText(/Reservation hold/);
    await userEvent.clear(hold);
    await userEvent.type(hold, '500');
    expect(screen.getByText(/must be a whole number from 1 to 168/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save 1 change' })).toBeDisabled();
  });

  it('is for administrators only', async () => {
    vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('BLOOD_BANK_STAFF')));
    renderApp('/admin/settings');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  });
});

describe('account deletion', () => {
  it('lets a donor delete their account after re-entering the password and typing DELETE', async () => {
    vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('DONOR')));
    vi.mocked(usersApi.deleteMe).mockResolvedValue(null);
    const { router } = renderApp('/account');

    await userEvent.click(await screen.findByRole('button', { name: 'Delete my account' }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete permanently' });
    await userEvent.type(within(dialog).getByLabelText('Your password'), 'my-password-1');
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/to confirm/), 'DELETE');
    await userEvent.click(confirm);

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(usersApi.deleteMe).toHaveBeenCalledWith({
      password: 'my-password-1',
      confirm: 'DELETE',
    });
    expect(await screen.findByText(/Your account has been deleted/)).toBeInTheDocument();
  });

  it('is not offered to hospitals or staff', async () => {
    vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('HOSPITAL')));
    renderApp('/account');
    await screen.findByRole('heading', { name: 'Account' });
    expect(screen.queryByRole('button', { name: 'Delete my account' })).not.toBeInTheDocument();
  });
});
