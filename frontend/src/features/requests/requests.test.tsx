import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BloodRequestDetail } from '@bbms/shared';
import { refreshSession } from '@/services/session';
import type * as SessionModule from '@/services/session';
import { makeUser, renderApp, sessionFor } from '@/test/renderApp';
import { hospitalSelfApi } from '@/features/organisations/api';
import { requestsApi } from './api';

vi.mock('@/services/session', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  refreshSession: vi.fn(),
}));

vi.mock('./api', () => ({
  requestsApi: {
    create: vi.fn(),
    mine: vi.fn(),
    myStats: vi.fn(),
    update: vi.fn(),
    escalate: vi.fn(),
    list: vi.fn(),
    stats: vi.fn(),
    review: vi.fn(),
    get: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock('@/features/organisations/api', () => ({
  hospitalSelfApi: { get: vi.fn() },
  hospitalsApi: { list: vi.fn() },
  bloodBanksApi: { list: vi.fn() },
  auditApi: {
    list: vi
      .fn()
      .mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } }),
  },
  staffApi: {},
}));

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

function makeRequest(overrides: Partial<BloodRequestDetail> = {}): BloodRequestDetail {
  return {
    id: 'r1',
    requestNumber: 'REQ-260929-0001',
    hospital: { id: 'h1', name: 'City General', city: 'Pune' },
    bloodGroup: 'O+',
    componentType: 'PRBC',
    unitsRequested: 2,
    unitsAllocated: 0,
    unitsIssued: 0,
    urgency: 'ROUTINE',
    requiredBy: inHours(24),
    overdue: false,
    status: 'PENDING',
    reasonCategory: 'SCHEDULED_PROCEDURE',
    createdAt: inHours(-1),
    hospitalReference: null,
    notes: null,
    statusReason: null,
    createdBy: { id: 'u1', name: 'Dr Contact' },
    reviewedBy: null,
    reviewedAt: null,
    statusHistory: [
      {
        from: null,
        to: 'PENDING',
        at: inHours(-1),
        by: { id: 'u1', name: 'Dr Contact' },
        reason: null,
      },
    ],
    allowedActions: ['EDIT', 'ESCALATE', 'CANCEL'],
    stock: null,
    allocations: [],
    outreachStatus: 'NONE',
    ...overrides,
  };
}

const hospitalView = {
  id: 'h1',
  name: 'City General',
  registrationNumber: 'MH-1',
  address: { line1: '1 Rd', city: 'Pune', state: 'MH', postalCode: '411001' },
  operatingStatus: 'OPERATIONAL' as const,
  verificationStatus: 'VERIFIED' as const,
  statusReason: null,
  verifiedAt: null,
  canEditIdentity: false,
};

beforeEach(() => {
  vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('HOSPITAL')));
  vi.mocked(requestsApi.create).mockReset();
  vi.mocked(requestsApi.cancel).mockReset();
  vi.mocked(requestsApi.review).mockReset();
  vi.mocked(hospitalSelfApi.get).mockResolvedValue(hospitalView);
});

describe('raising a request', () => {
  it('blocks unverified hospitals with an explanation', async () => {
    vi.mocked(hospitalSelfApi.get).mockResolvedValue({
      ...hospitalView,
      verificationStatus: 'PENDING',
    });
    renderApp('/hospital/requests/new');
    expect(await screen.findByText(/must be verified/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Raise request' })).not.toBeInTheDocument();
  });

  it('warns before an emergency and sends an ISO required-by time', async () => {
    vi.mocked(requestsApi.create).mockResolvedValue(
      makeRequest({ status: 'APPROVED', urgency: 'EMERGENCY' }),
    );
    vi.mocked(requestsApi.get).mockResolvedValue(
      makeRequest({ status: 'APPROVED', urgency: 'EMERGENCY' }),
    );
    const { router } = renderApp('/hospital/requests/new');

    await userEvent.selectOptions(await screen.findByLabelText(/blood group/i), 'O-');
    await userEvent.selectOptions(screen.getByLabelText(/component/i), 'PRBC');
    await userEvent.selectOptions(screen.getByLabelText(/^reason/i), 'EMERGENCY_CARE');
    await userEvent.click(screen.getByRole('radio', { name: /emergency/i }));
    expect(screen.getByText(/genuine emergencies/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Raise request' }));
    await waitFor(() => expect(requestsApi.create).toHaveBeenCalled());
    const input = vi.mocked(requestsApi.create).mock.calls[0]![0];
    expect(input).toMatchObject({
      bloodGroup: 'O-',
      componentType: 'PRBC',
      urgency: 'EMERGENCY',
      unitsRequested: 1,
    });
    expect(input.requiredBy).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    await waitFor(() => expect(router.state.location.pathname).toBe('/hospital/requests/r1'));
    expect(await screen.findByText(/approved automatically/)).toBeInTheDocument();
  });
});

describe('request detail', () => {
  it('shows only the actions the server allows', async () => {
    vi.mocked(requestsApi.get).mockResolvedValue(
      makeRequest({ status: 'APPROVED', allowedActions: ['ESCALATE', 'CANCEL'] }),
    );
    renderApp('/hospital/requests/r1');
    expect(await screen.findByRole('button', { name: /raise urgency/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
  });

  it('requires a reason to cancel', async () => {
    vi.mocked(requestsApi.get).mockResolvedValue(makeRequest());
    vi.mocked(requestsApi.cancel).mockResolvedValue(
      makeRequest({ status: 'CANCELLED', allowedActions: [] }),
    );
    renderApp('/hospital/requests/r1');

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel request' }));
    const dialog = screen.getByRole('dialog');
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Cancel request',
    )!;
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/reason/i), 'Procedure postponed');
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(requestsApi.cancel).toHaveBeenCalledWith('r1', { reason: 'Procedure postponed' }),
    );
  });

  it('flags overdue requests in words', async () => {
    vi.mocked(requestsApi.get).mockResolvedValue(
      makeRequest({ requiredBy: inHours(-3), overdue: true }),
    );
    renderApp('/hospital/requests/r1');
    expect(await screen.findByText(/^Overdue/)).toBeInTheDocument();
  });

  it('lets staff approve a pending request', async () => {
    vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('BLOOD_BANK_STAFF')));
    vi.mocked(requestsApi.get).mockResolvedValue(
      makeRequest({
        allowedActions: ['REVIEW', 'CANCEL'],
        stock: { exact: 3, compatibleSubstitutes: 1 },
      }),
    );
    vi.mocked(requestsApi.review).mockResolvedValue(
      makeRequest({ status: 'APPROVED', allowedActions: ['CANCEL'] }),
    );
    renderApp('/admin/requests/r1');

    expect(
      await screen.findByText(/In stock: 3 exact-group, 1 compatible substitute unit\./),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const confirm = Array.from(screen.getByRole('dialog').querySelectorAll('button')).find(
      (b) => b.textContent === 'Approve',
    )!;
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(requestsApi.review).toHaveBeenCalledWith('r1', { decision: 'APPROVE' }),
    );
  });

  it('keeps hospitals out of the staff queue', async () => {
    renderApp('/admin/requests');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  });
});
