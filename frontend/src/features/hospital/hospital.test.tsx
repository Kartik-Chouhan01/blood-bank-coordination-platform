import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HospitalSelfView } from '@bbms/shared';
import { refreshSession } from '@/services/session';
import type * as SessionModule from '@/services/session';
import { makeUser, renderApp, sessionFor } from '@/test/renderApp';
import { hospitalSelfApi } from '@/features/organisations/api';

vi.mock('@/services/session', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  refreshSession: vi.fn(),
}));

vi.mock('@/features/organisations/api', () => ({
  hospitalSelfApi: { get: vi.fn(), update: vi.fn() },
  hospitalsApi: { list: vi.fn(), get: vi.fn() },
  bloodBanksApi: { list: vi.fn() },
  staffApi: {},
  auditApi: { list: vi.fn() },
}));

function makeHospital(overrides: Partial<HospitalSelfView> = {}): HospitalSelfView {
  return {
    id: 'h1',
    name: 'City General',
    registrationNumber: 'MH-001',
    address: { line1: '1 Road', city: 'Pune', state: 'MH', postalCode: '411001' },
    operatingStatus: 'OPERATIONAL',
    verificationStatus: 'PENDING',
    statusReason: null,
    verifiedAt: null,
    canEditIdentity: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(refreshSession).mockResolvedValue(sessionFor(makeUser('HOSPITAL')));
  vi.mocked(hospitalSelfApi.get).mockReset();
  vi.mocked(hospitalSelfApi.update).mockReset();
});

describe('hospital pages', () => {
  it('explains that requests unlock after verification', async () => {
    vi.mocked(hospitalSelfApi.get).mockResolvedValue(makeHospital());
    renderApp('/hospital');
    expect(await screen.findByText('Awaiting verification')).toBeInTheDocument();
    expect(screen.getByText(/become available once your hospital is verified/)).toBeInTheDocument();
  });

  it('shows the admin’s reason when rejected', async () => {
    vi.mocked(hospitalSelfApi.get).mockResolvedValue(
      makeHospital({ verificationStatus: 'REJECTED', statusReason: 'Licence number not found' }),
    );
    renderApp('/hospital');
    expect(await screen.findByText(/Licence number not found/)).toBeInTheDocument();
  });

  it('locks name and registration number once verified', async () => {
    vi.mocked(hospitalSelfApi.get).mockResolvedValue(
      makeHospital({ verificationStatus: 'VERIFIED', canEditIdentity: false }),
    );
    renderApp('/hospital/profile');
    expect(await screen.findByLabelText(/hospital name/i)).toBeDisabled();
    expect(screen.getByLabelText(/registration/i)).toBeDisabled();
    expect(screen.getByLabelText(/^address/i)).toBeEnabled();
  });

  it('sends only the fields that changed', async () => {
    const hospital = makeHospital({ verificationStatus: 'VERIFIED', canEditIdentity: false });
    vi.mocked(hospitalSelfApi.get).mockResolvedValue(hospital);
    vi.mocked(hospitalSelfApi.update).mockResolvedValue({ ...hospital, operatingStatus: 'CLOSED' });
    renderApp('/hospital/profile');

    await userEvent.selectOptions(await screen.findByLabelText(/operating status/i), 'CLOSED');
    await userEvent.click(screen.getByRole('button', { name: 'Save hospital details' }));
    await waitFor(() =>
      expect(hospitalSelfApi.update).toHaveBeenCalledWith({ operatingStatus: 'CLOSED' }),
    );
  });

  it('keeps hospitals out of admin pages', async () => {
    renderApp('/admin/hospitals');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  });
});
