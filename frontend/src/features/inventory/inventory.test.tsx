import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BloodUnitDetail, InventorySummary } from '@bbms/shared';
import { refreshSession } from '@/services/session';
import type * as SessionModule from '@/services/session';
import { makeUser, renderApp, sessionFor } from '@/test/renderApp';
import { unitsApi } from './api';
import { ExpiryBadge } from './components/ExpiryBadge';
import { StockGrid } from './components/StockGrid';

vi.mock('@/services/session', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  refreshSession: vi.fn(),
}));

vi.mock('./api', () => ({
  unitsApi: { list: vi.fn(), summary: vi.fn(), get: vi.fn(), transition: vi.fn() },
  donationsApi: { list: vi.fn(), get: vi.fn(), mine: vi.fn() },
}));

vi.mock('@/features/organisations/api', () => ({
  bloodBanksApi: {
    list: vi
      .fn()
      .mockResolvedValue({ items: [], meta: { page: 1, limit: 100, total: 0, totalPages: 1 } }),
  },
  hospitalsApi: { list: vi.fn() },
  auditApi: {
    list: vi
      .fn()
      .mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } }),
  },
  hospitalSelfApi: {},
  staffApi: {},
}));

const summary: InventorySummary = {
  available: [
    { bloodGroup: 'O-', componentType: 'PRBC', units: 3 },
    { bloodGroup: 'A+', componentType: 'PLASMA', units: 1 },
  ],
  byStatus: { AVAILABLE: 4 },
  expiringSoon: 1,
  expiredAwaitingSweep: 0,
  expiryWarningDays: 3,
};

function makeUnit(overrides: Partial<BloodUnitDetail> = {}): BloodUnitDetail {
  return {
    id: 'u1',
    unitCode: 'CEN-260929-0001',
    bloodGroup: 'O-',
    componentType: 'PRBC',
    volumeMl: null,
    status: 'AVAILABLE',
    testingStatus: 'PASSED',
    collectedAt: '2026-09-20T10:00:00.000Z',
    expiryDate: '2026-11-01T10:00:00.000Z',
    expiredByDate: false,
    daysToExpiry: 30,
    storageLocation: 'Fridge 2',
    bloodBank: { id: 'b1', name: 'Central', code: 'CEN' },
    donationId: 'd1',
    donor: { id: 'dn1', name: 'Asha' },
    statusHistory: [
      {
        from: null,
        to: 'COLLECTED',
        at: '2026-09-20T10:00:00.000Z',
        by: { id: 's1', name: 'Nurse' },
        reason: null,
        override: false,
      },
    ],
    allowedTransitions: [
      { to: 'DISCARDED', requiresReason: true, override: false, label: 'Discard' },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('BLOOD_BANK_STAFF')));
  vi.mocked(unitsApi.transition).mockReset();
});

describe('StockGrid', () => {
  it('shows counts per group and component and flags groups with no usable stock', () => {
    render(<StockGrid summary={summary} />);
    const oneg = screen.getByRole('row', { name: /^O-/ });
    expect(oneg).toHaveTextContent('3');
    expect(screen.getByRole('row', { name: /^B\+/ })).toHaveTextContent('no usable stock');
  });
});

describe('ExpiryBadge', () => {
  it('uses words, not just colour', () => {
    const { rerender } = render(
      <ExpiryBadge expiryDate="2026-10-01" daysToExpiry={1} expiredByDate={false} inInventory />,
    );
    expect(screen.getByText('1 day left')).toBeInTheDocument();
    rerender(<ExpiryBadge expiryDate="2026-10-01" daysToExpiry={-1} expiredByDate inInventory />);
    expect(screen.getByText(/Expired/)).toBeInTheDocument();
  });
});

describe('unit detail', () => {
  it('only offers the actions the server allows and requires a reason to discard', async () => {
    vi.mocked(unitsApi.get).mockResolvedValue(makeUnit());
    vi.mocked(unitsApi.transition).mockResolvedValue(
      makeUnit({ status: 'DISCARDED', allowedTransitions: [] }),
    );
    renderApp('/admin/inventory/units/u1');

    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    const dialog = screen.getByRole('dialog');
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Discard',
    )!;
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/reason/i), 'Bag seal broken');
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(unitsApi.transition).toHaveBeenCalledWith('u1', {
        to: 'DISCARDED',
        reason: 'Bag seal broken',
      }),
    );
  });

  it('warns when a unit is past its expiry date', async () => {
    vi.mocked(unitsApi.get).mockResolvedValue(makeUnit({ expiredByDate: true, daysToExpiry: -1 }));
    renderApp('/admin/inventory/units/u1');
    expect(await screen.findByText('Past expiry date')).toBeInTheDocument();
  });

  it('marks override actions distinctly', async () => {
    vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('ADMIN')));
    vi.mocked(unitsApi.get).mockResolvedValue(
      makeUnit({
        status: 'DISCARDED',
        allowedTransitions: [
          {
            to: 'UNDER_TESTING',
            requiresReason: true,
            override: true,
            label: 'Return to testing (discarded in error)',
          },
        ],
      }),
    );
    renderApp('/admin/inventory/units/u1');
    await userEvent.click(await screen.findByRole('button', { name: /return to testing/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/administrator override/i);
  });
});

describe('access', () => {
  it('keeps donors out of inventory', async () => {
    vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('DONOR')));
    renderApp('/admin/inventory');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  });
});
