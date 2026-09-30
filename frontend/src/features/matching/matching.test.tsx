import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AllocationView,
  BloodRequestDetail,
  DonorOutreachSelfView,
  InventoryCandidate,
} from '@bbms/shared';
import { refreshSession } from '@/services/session';
import type * as SessionModule from '@/services/session';
import { makeUser, renderApp, sessionFor } from '@/test/renderApp';
import { requestsApi } from '@/features/requests/api';
import { donorOutreachApi, matchingApi } from './api';

vi.mock('@/services/session', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  refreshSession: vi.fn(),
}));

vi.mock('@/features/requests/api', () => ({
  requestsApi: { get: vi.fn(), confirmReceipt: vi.fn() },
}));

vi.mock('./api', () => ({
  matchingApi: {
    inventory: vi.fn(),
    reserve: vi.fn(),
    release: vi.fn(),
    issue: vi.fn(),
    donors: vi.fn(),
    outreach: vi.fn(),
    startOutreach: vi.fn(),
  },
  donorOutreachApi: { mine: vi.fn(), respond: vi.fn() },
}));

vi.mock('@/features/organisations/api', () => ({
  auditApi: {
    list: vi
      .fn()
      .mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } }),
  },
}));

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

function makeRequest(overrides: Partial<BloodRequestDetail> = {}): BloodRequestDetail {
  return {
    id: 'r1',
    requestNumber: 'REQ-260930-0001',
    hospital: { id: 'h1', name: 'City General', city: 'Pune' },
    bloodGroup: 'A+',
    componentType: 'PRBC',
    unitsRequested: 2,
    unitsAllocated: 0,
    unitsIssued: 0,
    urgency: 'URGENT',
    requiredBy: inHours(24),
    overdue: false,
    status: 'APPROVED',
    reasonCategory: 'SCHEDULED_PROCEDURE',
    createdAt: inHours(-1),
    hospitalReference: null,
    notes: null,
    statusReason: null,
    createdBy: null,
    reviewedBy: null,
    reviewedAt: null,
    statusHistory: [],
    allowedActions: ['ALLOCATE', 'OUTREACH', 'CANCEL'],
    stock: { exact: 1, compatibleSubstitutes: 1 },
    allocations: [],
    outreachStatus: 'NONE',
    ...overrides,
  };
}

function candidate(unitCode: string, overrides: Partial<InventoryCandidate> = {}) {
  return {
    unitId: `id-${unitCode}`,
    unitCode,
    bloodGroup: 'A+',
    componentType: 'PRBC',
    groupMatch: 'EXACT',
    expiryDate: inHours(24 * 10),
    daysToExpiry: 10,
    collectedAt: inHours(-24),
    storageLocation: null,
    bloodBank: { id: 'b1', name: 'Central', code: 'CEN' },
    canReserve: true,
    ...overrides,
  } satisfies InventoryCandidate;
}

function allocation(overrides: Partial<AllocationView> = {}): AllocationView {
  return {
    id: 'a1',
    status: 'ISSUED',
    unit: {
      id: 'u1',
      unitCode: 'CEN-260930-0001',
      bloodGroup: 'A+',
      componentType: 'PRBC',
      expiryDate: inHours(240),
    },
    bloodBank: { id: 'b1', name: 'Central', code: 'CEN' },
    groupMatch: 'EXACT',
    reservedAt: inHours(-3),
    reservedBy: null,
    holdUntil: null,
    issuedAt: inHours(-1),
    issuedBy: null,
    receivedAt: null,
    releasedAt: null,
    releaseReason: null,
    canIssue: false,
    canRelease: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('BLOOD_BANK_STAFF')));
  vi.mocked(matchingApi.outreach).mockResolvedValue({ requestId: 'r1', outreach: [], counts: {} });
});

describe('staff allocation', () => {
  it('pre-selects the suggested units, lets staff change them, and reserves on confirm', async () => {
    vi.mocked(requestsApi.get).mockResolvedValue(makeRequest());
    vi.mocked(matchingApi.inventory).mockResolvedValue({
      requestId: 'r1',
      shortfall: 2,
      compatibleGroups: ['A+', 'O+', 'A-', 'O-'],
      candidates: [
        candidate('CEN-1'),
        candidate('OTH-1', {
          canReserve: false,
          bloodBank: { id: 'b2', name: 'Other', code: 'OTH' },
        }),
        candidate('CEN-2', { bloodGroup: 'O+', groupMatch: 'COMPATIBLE' }),
      ],
      preselectedUnitIds: ['id-CEN-1', 'id-CEN-2'],
      truncated: false,
    });
    vi.mocked(matchingApi.reserve).mockResolvedValue(
      makeRequest({
        status: 'PARTIALLY_ALLOCATED',
        unitsAllocated: 1,
        allocations: [allocation({ status: 'RESERVED', canIssue: true, canRelease: true })],
      }),
    );
    renderApp('/admin/requests/r1');

    expect(
      await screen.findByText(/In stock: 1 exact-group, 1 compatible substitute unit\./),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reserve units' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('CEN-1');

    expect(within(dialog).getByLabelText('Select unit CEN-1')).toBeChecked();
    expect(within(dialog).getByLabelText('Select unit OTH-1')).toBeDisabled();
    expect(within(dialog).getByText('Substitute')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByLabelText('Select unit CEN-2'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reserve 1 unit' }));

    await waitFor(() =>
      expect(matchingApi.reserve).toHaveBeenCalledWith('r1', { unitIds: ['id-CEN-1'] }),
    );
    expect(await screen.findByText('Units reserved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Issue' })).toBeInTheDocument();
  });

  it('requires a reason to release a reservation', async () => {
    vi.mocked(requestsApi.get).mockResolvedValue(
      makeRequest({
        status: 'ALLOCATED',
        unitsAllocated: 2,
        allowedActions: ['CANCEL'],
        allocations: [allocation({ status: 'RESERVED', canIssue: true, canRelease: true })],
      }),
    );
    vi.mocked(matchingApi.release).mockResolvedValue(makeRequest());
    renderApp('/admin/requests/r1');

    await userEvent.click(await screen.findByRole('button', { name: 'Release' }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Release' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox'), 'Wrong unit selected');
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(matchingApi.release).toHaveBeenCalledWith('a1', { reason: 'Wrong unit selected' }),
    );
  });
});

describe('donor outreach for staff', () => {
  it('shows contact details only for donors who said they are interested', async () => {
    vi.mocked(requestsApi.get).mockResolvedValue(makeRequest({ outreachStatus: 'ACTIVE' }));
    vi.mocked(matchingApi.outreach).mockResolvedValue({
      requestId: 'r1',
      counts: { INTERESTED: 1, NOTIFIED: 1 },
      outreach: [
        {
          id: 'o1',
          status: 'INTERESTED',
          bloodGroup: 'A+',
          bloodGroupConfirmed: true,
          city: 'Pune',
          area: 'Baner',
          approxDistanceKm: 4,
          score: 80,
          notifiedAt: inHours(-2),
          respondedAt: inHours(-1),
          contact: { name: 'Asha Rao', phone: '+91 98765 43210', email: 'asha@example.test' },
        },
        {
          id: 'o2',
          status: 'NOTIFIED',
          bloodGroup: 'O+',
          bloodGroupConfirmed: false,
          city: 'Pune',
          area: 'Aundh',
          approxDistanceKm: null,
          score: 50,
          notifiedAt: inHours(-2),
          respondedAt: null,
          contact: null,
        },
      ],
    });
    renderApp('/admin/requests/r1');

    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /asha@example\.test/ })).toBeInTheDocument();
    expect(screen.getByText('Awaiting reply')).toBeInTheDocument();
    expect(screen.getByText('(self-declared)')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /@/ })).toHaveLength(1);
  });
});

describe('hospital receipt', () => {
  it('confirms receipt of issued units', async () => {
    vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('HOSPITAL')));
    vi.mocked(requestsApi.get).mockResolvedValue(
      makeRequest({
        status: 'FULFILLED',
        unitsAllocated: 2,
        unitsIssued: 2,
        stock: null,
        allowedActions: ['CONFIRM_RECEIPT'],
        allocations: [allocation(), allocation({ id: 'a2' })],
      }),
    );
    vi.mocked(requestsApi.confirmReceipt).mockResolvedValue(
      makeRequest({ status: 'COMPLETED', stock: null, allowedActions: [] }),
    );
    renderApp('/hospital/requests/r1');

    await userEvent.click(await screen.findByRole('button', { name: 'Confirm receipt' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/2 issued unit/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm receipt' }));
    await waitFor(() => expect(requestsApi.confirmReceipt).toHaveBeenCalledWith('r1'));
    expect(await screen.findByText('Receipt confirmed. Thank you.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reserve units' })).not.toBeInTheDocument();
  });
});

describe('donor requests for help', () => {
  const item = (overrides: Partial<DonorOutreachSelfView> = {}): DonorOutreachSelfView => ({
    id: 'o1',
    status: 'NOTIFIED',
    bloodGroupNeeded: 'A+',
    componentType: 'PRBC',
    urgency: 'EMERGENCY',
    requiredBy: inHours(6),
    city: 'Pune',
    approxDistanceKm: 3,
    notifiedAt: inHours(-1),
    respondedAt: null,
    open: true,
    canRespond: true,
    ...overrides,
  });

  it('lets a donor say they can help, without showing hospital details', async () => {
    vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('DONOR')));
    vi.mocked(donorOutreachApi.mine).mockResolvedValue([
      item(),
      item({
        id: 'o2',
        open: false,
        canRespond: false,
        status: 'NO_RESPONSE',
        approxDistanceKm: null,
      }),
    ]);
    vi.mocked(donorOutreachApi.respond).mockResolvedValue([
      item({ status: 'INTERESTED' }),
      item({
        id: 'o2',
        open: false,
        canRespond: false,
        status: 'NO_RESPONSE',
        approxDistanceKm: null,
      }),
    ]);
    renderApp('/donor/requests');

    expect(await screen.findByText(/about 3 km from you/)).toBeInTheDocument();
    expect(screen.getByText(/no action is needed/)).toBeInTheDocument();
    expect(screen.queryByText(/City General/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'I can help' }));
    await waitFor(() =>
      expect(donorOutreachApi.respond).toHaveBeenCalledWith('o1', { response: 'INTERESTED' }),
    );
    expect(await screen.findByText(/staff can now see your contact details/)).toBeInTheDocument();
  });
});
