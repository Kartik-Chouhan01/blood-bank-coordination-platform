import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditLogEntry, DonorStaffDetail, HospitalDetail } from '@bbms/shared';
import { refreshSession } from '@/services/session';
import type * as SessionModule from '@/services/session';
import { makeUser, renderApp, sessionFor } from '@/test/renderApp';
import { authApi } from '@/features/auth/api';
import type * as AuthApiModule from '@/features/auth/api';
import { donorStaffApi } from '@/features/donor/api';
import { auditApi, hospitalsApi } from '@/features/organisations/api';

vi.mock('@/services/session', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  refreshSession: vi.fn(),
}));

vi.mock('@/features/donor/api', () => ({
  donorStaffApi: {
    list: vi.fn(),
    get: vi.fn(),
    setVerification: vi.fn(),
    confirmBloodGroup: vi.fn(),
  },
  donorSelfApi: {},
}));

vi.mock('@/features/organisations/api', () => ({
  hospitalsApi: { list: vi.fn(), get: vi.fn(), setVerification: vi.fn() },
  auditApi: { list: vi.fn() },
  bloodBanksApi: { list: vi.fn() },
  hospitalSelfApi: {},
  staffApi: {},
}));

vi.mock('@/features/auth/api', async (importOriginal) => {
  const original = await importOriginal<typeof AuthApiModule>();
  return {
    ...original,
    authApi: {
      ...original.authApi,
      resetPassword: vi.fn(),
      acceptInvite: vi.fn(),
      verifyEmail: vi.fn(),
    },
  };
});

const emptyPage = { items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } };

const donor: DonorStaffDetail = {
  id: 'd1',
  userId: 'u1',
  name: 'Asha Rao',
  bloodGroup: 'A+',
  bloodGroupConfirmed: false,
  city: 'Pune',
  area: 'Baner',
  age: 34,
  effectiveAvailability: 'AVAILABLE',
  verificationStatus: 'PENDING',
  donationCount: 0,
  lastDonationAt: null,
  registeredAt: '2026-09-01T00:00:00.000Z',
  availabilityHistory: [],
  earliestContactDate: null,
  accountStatus: 'ACTIVE',
};

const hospital: HospitalDetail = {
  id: 'h1',
  name: 'City General Hospital',
  registrationNumber: 'MH/PUN/1001',
  city: 'Pune',
  state: 'Maharashtra',
  verificationStatus: 'PENDING',
  operatingStatus: 'OPERATIONAL',
  contact: { name: 'Dr Contact', email: 'contact@hospital.example', phone: '+91 20 1234 5678' },
  registeredAt: '2026-09-01T00:00:00.000Z',
  address: { line1: '1 Hospital Rd', city: 'Pune', state: 'Maharashtra', postalCode: '411001' },
  statusReason: null,
  verifiedAt: null,
  resubmittedAt: null,
};

beforeEach(() => {
  vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('ADMIN')));
  vi.mocked(auditApi.list).mockResolvedValue(emptyPage);
});

afterEach(() => window.history.replaceState(null, '', '/'));

describe('donor verification', () => {
  it('verifies a donor without a reason', async () => {
    vi.mocked(donorStaffApi.get).mockResolvedValue(donor);
    vi.mocked(donorStaffApi.setVerification).mockResolvedValue({
      ...donor,
      verificationStatus: 'VERIFIED',
    });
    renderApp('/admin/donors/d1');
    await userEvent.click(await screen.findByRole('button', { name: 'Verify' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Verify' }),
    );
    await waitFor(() =>
      expect(donorStaffApi.setVerification).toHaveBeenCalledWith('d1', { status: 'VERIFIED' }),
    );
  });

  it('needs a reason to reject a donor', async () => {
    vi.mocked(donorStaffApi.get).mockResolvedValue(donor);
    vi.mocked(donorStaffApi.setVerification).mockResolvedValue({
      ...donor,
      verificationStatus: 'REJECTED',
    });
    renderApp('/admin/donors/d1');
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Reject' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox'), 'Identity could not be confirmed');
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(donorStaffApi.setVerification).toHaveBeenCalledWith('d1', {
        status: 'REJECTED',
        reason: 'Identity could not be confirmed',
      }),
    );
  });
});

describe('hospital verification', () => {
  it('rejects a registration with a reason the hospital will see', async () => {
    vi.mocked(hospitalsApi.get).mockResolvedValue(hospital);
    vi.mocked(hospitalsApi.setVerification).mockResolvedValue({
      ...hospital,
      verificationStatus: 'REJECTED',
    });
    renderApp('/admin/hospitals/h1');
    expect(await screen.findByText('MH/PUN/1001')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'Registration number not found');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(hospitalsApi.setVerification).toHaveBeenCalledWith('h1', {
        status: 'REJECTED',
        reason: 'Registration number not found',
      }),
    );
  });

  it('is read-only for staff', async () => {
    vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('BLOOD_BANK_STAFF')));
    vi.mocked(hospitalsApi.get).mockResolvedValue(hospital);
    renderApp('/admin/hospitals/h1');
    expect(await screen.findByText('MH/PUN/1001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify' })).not.toBeInTheDocument();
  });
});

describe('audit log', () => {
  it('shows who did what and filters by action', async () => {
    const entry: AuditLogEntry = {
      id: 'a1',
      action: 'SETTINGS_UPDATED',
      entityType: 'SystemSetting',
      entityId: 's1',
      actor: { id: 'u1', name: 'Anita Admin', role: 'ADMIN' },
      actorRole: 'ADMIN',
      before: { reservationHoldHours: 24 },
      after: { reservationHoldHours: 6 },
      reason: 'Shorter holds',
      requestId: 'req-1',
      ipTruncated: null,
      createdAt: '2026-09-30T10:00:00.000Z',
    };
    vi.mocked(auditApi.list).mockResolvedValue({
      ...emptyPage,
      items: [entry],
      meta: { ...emptyPage.meta, total: 1 },
    });
    renderApp('/admin/audit-logs');
    // The action label also appears in the filter drop-down, so wait for the entry itself.
    expect(await screen.findByText(/by Anita Admin \(Administrator\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /System settings changed/ })).toBeInTheDocument();
    expect(screen.getByText(/Shorter holds/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Action'), 'ACCOUNT_DELETED');
    await waitFor(() =>
      expect(auditApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'ACCOUNT_DELETED' }),
      ),
    );
  });
});

describe('emailed links', () => {
  const token = 'tok_abcdefghijklmnopqrstuvwxyz0123';

  it('resets a password from the link and strips the token from the address bar', async () => {
    vi.mocked(refreshSession).mockRejectedValue(new Error('signed out'));
    vi.mocked(authApi.resetPassword).mockResolvedValue(null);
    window.history.replaceState(null, '', `/reset-password#token=${token}`);
    renderApp('/reset-password');

    await userEvent.type(await screen.findByLabelText(/^New password/), 'fresh-password-42');
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), 'fresh-password-42');
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() =>
      expect(authApi.resetPassword).toHaveBeenCalledWith({ token, password: 'fresh-password-42' }),
    );
    expect(await screen.findByText(/signed out of all devices/)).toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });

  it('explains an incomplete reset link', async () => {
    vi.mocked(refreshSession).mockRejectedValue(new Error('signed out'));
    renderApp('/reset-password');
    expect(await screen.findByText(/reset link is incomplete/)).toBeInTheDocument();
  });

  it('activates an invited staff account', async () => {
    vi.mocked(refreshSession).mockRejectedValue(new Error('signed out'));
    vi.mocked(authApi.acceptInvite).mockResolvedValue(sessionFor(makeUser('BLOOD_BANK_STAFF')));
    window.history.replaceState(null, '', `/accept-invite#token=${token}`);
    renderApp('/accept-invite');
    await userEvent.type(await screen.findByLabelText(/^Password/), 'staff-password-42');
    await userEvent.type(screen.getByLabelText(/^Confirm password/), 'staff-password-42');
    await userEvent.click(screen.getByRole('button', { name: 'Activate account' }));
    await waitFor(() =>
      expect(authApi.acceptInvite).toHaveBeenCalledWith({ token, password: 'staff-password-42' }),
    );
  });

  it('confirms an email address from the link', async () => {
    vi.mocked(refreshSession).mockRejectedValue(new Error('signed out'));
    vi.mocked(authApi.verifyEmail).mockResolvedValue(null);
    window.history.replaceState(null, '', `/verify-email#token=${token}`);
    renderApp('/verify-email');
    expect(await screen.findByText(/Your email address is confirmed/)).toBeInTheDocument();
    expect(authApi.verifyEmail).toHaveBeenCalledWith(token);
  });
});
