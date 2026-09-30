import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BloodRequestSummary,
  BloodUnitSummary,
  DonationDetail,
  DonorStaffSummary,
  InventorySummary,
} from '@bbms/shared';
import { refreshSession } from '@/services/session';
import type * as SessionModule from '@/services/session';
import { makeUser, renderApp, sessionFor } from '@/test/renderApp';
import { donorStaffApi } from '@/features/donor/api';
import { requestsApi } from '@/features/requests/api';
import { donationsApi, unitsApi } from './api';

vi.mock('@/services/session', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  refreshSession: vi.fn(),
}));

vi.mock('./api', () => ({
  unitsApi: { list: vi.fn(), summary: vi.fn(), get: vi.fn(), transition: vi.fn() },
  donationsApi: {
    list: vi.fn(),
    get: vi.fn(),
    record: vi.fn(),
    startTesting: vi.fn(),
    recordResult: vi.fn(),
    mine: vi.fn(),
  },
}));

vi.mock('@/features/donor/api', () => ({
  donorStaffApi: { list: vi.fn(), get: vi.fn() },
  donorSelfApi: {},
}));

vi.mock('@/features/requests/api', () => ({
  requestsApi: { list: vi.fn(), stats: vi.fn() },
}));

vi.mock('@/features/organisations/api', () => ({
  bloodBanksApi: {
    list: vi.fn().mockResolvedValue({
      items: [{ id: 'b1', name: 'Central', code: 'CEN' }],
      meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
    }),
  },
  auditApi: {
    list: vi
      .fn()
      .mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } }),
  },
}));

const page = <T,>(items: T[]) => ({
  items,
  meta: { page: 1, limit: 20, total: items.length, totalPages: 1 },
});
const bank = { id: 'b1', name: 'Central', code: 'CEN' };

const donor: DonorStaffSummary = {
  id: 'd1',
  userId: 'u1',
  name: 'Asha Rao',
  bloodGroup: 'A+',
  bloodGroupConfirmed: false,
  city: 'Pune',
  area: 'Baner',
  age: 34,
  effectiveAvailability: 'AVAILABLE',
  verificationStatus: 'VERIFIED',
  donationCount: 2,
  lastDonationAt: null,
  registeredAt: '2026-01-01T00:00:00.000Z',
};

function unit(overrides: Partial<BloodUnitSummary> = {}): BloodUnitSummary {
  return {
    id: 'unit1',
    unitCode: 'CEN-260930-0001',
    bloodGroup: 'A+',
    componentType: 'PRBC',
    volumeMl: null,
    status: 'UNDER_TESTING',
    testingStatus: 'PENDING',
    collectedAt: '2026-09-29T10:00:00.000Z',
    expiryDate: '2026-11-10T10:00:00.000Z',
    expiredByDate: false,
    daysToExpiry: 40,
    storageLocation: 'Fridge 2',
    bloodBank: bank,
    ...overrides,
  };
}

function donation(overrides: Partial<DonationDetail> = {}): DonationDetail {
  return {
    id: 'don1',
    donor: { id: 'd1', name: 'Asha Rao' },
    bloodBank: bank,
    collectedAt: '2026-09-29T10:00:00.000Z',
    donationType: 'WHOLE_BLOOD',
    volumeMl: 450,
    testingStatus: 'PENDING',
    unitCount: 2,
    recordedBy: { id: 's1', name: 'Sunil' },
    units: [unit(), unit({ id: 'unit2', unitCode: 'CEN-260930-0002', componentType: 'PLASMA' })],
    testedAt: null,
    testedBy: null,
    testedBloodGroup: null,
    testNote: null,
    notes: null,
    canStartTesting: false,
    canRecordResult: true,
    canManage: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(refreshSession).mockResolvedValue(
    sessionFor(
      makeUser('BLOOD_BANK_STAFF', {
        profile: { kind: 'STAFF', bloodBankId: 'b1', bloodBankName: 'Central' },
      }),
    ),
  );
});

describe('recording a donation', () => {
  it('needs a donor, then records the chosen components and opens the donation', async () => {
    vi.mocked(donorStaffApi.list).mockResolvedValue(page([donor]));
    vi.mocked(donationsApi.record).mockResolvedValue(donation());
    vi.mocked(donationsApi.get).mockResolvedValue(donation());
    const { router } = renderApp('/admin/donations/new');

    await userEvent.click(await screen.findByRole('button', { name: 'Record donation' }));
    expect(screen.getByText('Choose the donor')).toBeInTheDocument();
    expect(donationsApi.record).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/^Donor/), 'As');
    const results = await screen.findByRole('list', { name: 'Matching donors' });
    await userEvent.click(within(results).getByRole('button', { name: /Asha Rao/ }));
    await userEvent.type(screen.getByLabelText('Storage location'), 'Fridge 2');
    await userEvent.click(screen.getByRole('button', { name: 'Record donation' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/donations/don1'));
    expect(donationsApi.record).toHaveBeenCalledWith(
      expect.objectContaining({
        donorId: 'd1',
        donationType: 'WHOLE_BLOOD',
        volumeMl: 450,
        components: ['PRBC', 'PLASMA'],
        storageLocation: 'Fridge 2',
      }),
    );
    expect(vi.mocked(donationsApi.record).mock.calls[0]![0]).not.toHaveProperty('bloodBankId');
  });

  it('records one whole-blood unit when chosen', async () => {
    vi.mocked(donorStaffApi.list).mockResolvedValue(page([donor]));
    vi.mocked(donationsApi.record).mockResolvedValue(donation());
    vi.mocked(donationsApi.get).mockResolvedValue(donation());
    renderApp('/admin/donations/new');

    await userEvent.type(await screen.findByLabelText(/^Donor/), 'As');
    await userEvent.click(
      within(await screen.findByRole('list', { name: 'Matching donors' })).getByRole('button', {
        name: /Asha Rao/,
      }),
    );
    await userEvent.click(screen.getByRole('radio', { name: /One whole-blood unit/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Record donation' }));
    await waitFor(() =>
      expect(donationsApi.record).toHaveBeenCalledWith(
        expect.objectContaining({ components: ['WHOLE_BLOOD'] }),
      ),
    );
  });
});

describe('testing a donation', () => {
  it('sends collected units to testing', async () => {
    vi.mocked(donationsApi.get).mockResolvedValue(
      donation({ canStartTesting: true, canRecordResult: false }),
    );
    vi.mocked(donationsApi.startTesting).mockResolvedValue(donation());
    renderApp('/admin/donations/don1');
    await userEvent.click(await screen.findByRole('button', { name: 'Send to testing' }));
    expect(await screen.findByText('Units sent to testing.')).toBeInTheDocument();
    expect(donationsApi.startTesting).toHaveBeenCalledWith('don1');
  });

  it('releases units with the tested group', async () => {
    vi.mocked(donationsApi.get).mockResolvedValue(donation());
    vi.mocked(donationsApi.recordResult).mockResolvedValue(donation({ canRecordResult: false }));
    renderApp('/admin/donations/don1');
    await userEvent.click(await screen.findByRole('button', { name: 'Record test result' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Tested blood group'), 'A-');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Release 2 units' }));
    await waitFor(() =>
      expect(donationsApi.recordResult).toHaveBeenCalledWith('don1', {
        result: 'PASSED',
        bloodGroup: 'A-',
      }),
    );
  });

  it('requires a staff-only note to discard a failed donation', async () => {
    vi.mocked(donationsApi.get).mockResolvedValue(donation());
    vi.mocked(donationsApi.recordResult).mockResolvedValue(donation({ canRecordResult: false }));
    renderApp('/admin/donations/don1');
    await userEvent.click(await screen.findByRole('button', { name: 'Record test result' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('radio', { name: /Failed/ }));
    expect(within(dialog).getByText(/never shown to the donor/)).toBeInTheDocument();
    const discard = within(dialog).getByRole('button', { name: 'Discard 2 units' });
    expect(discard).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox'), 'Reactive screen');
    await userEvent.click(discard);
    await waitFor(() =>
      expect(donationsApi.recordResult).toHaveBeenCalledWith('don1', {
        result: 'FAILED',
        note: 'Reactive screen',
      }),
    );
  });
});

describe('inventory and the request queue', () => {
  it("shows the staff member's bank stock and units, filterable by group", async () => {
    const summary: InventorySummary = {
      available: [{ bloodGroup: 'A+', componentType: 'PRBC', units: 5 }],
      byStatus: { AVAILABLE: 5, UNDER_TESTING: 1 },
      expiringSoon: 1,
      expiredAwaitingSweep: 0,
      expiryWarningDays: 3,
    };
    vi.mocked(unitsApi.summary).mockResolvedValue(summary);
    vi.mocked(unitsApi.list).mockResolvedValue(page([unit({ status: 'AVAILABLE' })]));
    renderApp('/admin/inventory');

    expect(await screen.findByText('CEN-260930-0001')).toBeInTheDocument();
    expect(unitsApi.summary).toHaveBeenCalledWith('b1');
    await userEvent.selectOptions(screen.getByLabelText('Blood group'), 'O-');
    await waitFor(() =>
      expect(unitsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ bloodGroup: 'O-' })),
    );
  });

  it('lists open requests most urgent first and flags emergencies and overdue ones', async () => {
    const request = (overrides: Partial<BloodRequestSummary>): BloodRequestSummary => ({
      id: 'r1',
      requestNumber: 'REQ-260930-0001',
      hospital: { id: 'h1', name: 'City General', city: 'Pune' },
      bloodGroup: 'O-',
      componentType: 'PRBC',
      unitsRequested: 2,
      unitsAllocated: 0,
      unitsIssued: 0,
      urgency: 'EMERGENCY',
      requiredBy: new Date(Date.now() + 3_600_000).toISOString(),
      overdue: false,
      status: 'APPROVED',
      reasonCategory: 'EMERGENCY_CARE',
      createdAt: new Date().toISOString(),
      ...overrides,
    });
    vi.mocked(requestsApi.stats).mockResolvedValue({
      open: 2,
      pendingReview: 1,
      openEmergency: 1,
      openUrgent: 0,
      overdue: 1,
    });
    vi.mocked(requestsApi.list).mockResolvedValue(
      page([
        request({}),
        request({
          id: 'r2',
          requestNumber: 'REQ-260930-0002',
          urgency: 'ROUTINE',
          status: 'PENDING',
          overdue: true,
          requiredBy: new Date(Date.now() - 3_600_000).toISOString(),
        }),
      ]),
    );
    renderApp('/admin/requests');

    expect(await screen.findByText('REQ-260930-0001')).toBeInTheDocument();
    expect(requestsApi.list).toHaveBeenCalledWith(expect.objectContaining({ sort: 'priority' }));
    const rows = screen.getAllByRole('row');
    expect(rows.some((r) => within(r).queryByText('Emergency'))).toBe(true);
    expect(screen.getAllByText(/Overdue/).length).toBeGreaterThan(0);
  });
});
