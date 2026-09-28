import type { HospitalDetail, HospitalSelfView, HospitalSummary } from '@bbms/shared';
import type { User } from '../users/user.model.js';
import type { Hospital } from './hospital.model.js';

const iso = (date: Date | null | undefined) => date?.toISOString() ?? null;

export function canEditIdentity(hospital: Pick<Hospital, 'verificationStatus'>): boolean {
  return hospital.verificationStatus === 'PENDING' || hospital.verificationStatus === 'REJECTED';
}

export function toHospitalSelfView(hospital: Hospital): HospitalSelfView {
  const showReason =
    hospital.verificationStatus === 'REJECTED' || hospital.verificationStatus === 'SUSPENDED';
  return {
    id: hospital._id.toString(),
    name: hospital.name,
    registrationNumber: hospital.registrationNumber,
    address: hospital.address,
    operatingStatus: hospital.operatingStatus,
    verificationStatus: hospital.verificationStatus,
    statusReason: showReason ? hospital.statusReason : null,
    verifiedAt: iso(hospital.verifiedAt),
    canEditIdentity: canEditIdentity(hospital),
  };
}

type Contact = Pick<User, 'name' | 'email' | 'phone'>;

export function toHospitalSummary(
  hospital: Hospital,
  contact: Contact | undefined,
): HospitalSummary {
  return {
    id: hospital._id.toString(),
    name: hospital.name,
    registrationNumber: hospital.registrationNumber,
    city: hospital.address.city,
    state: hospital.address.state,
    verificationStatus: hospital.verificationStatus,
    operatingStatus: hospital.operatingStatus,
    contact: {
      name: contact?.name ?? '—',
      email: contact?.email ?? '—',
      phone: contact?.phone ?? '—',
    },
    registeredAt: hospital.createdAt.toISOString(),
  };
}

export function toHospitalDetail(hospital: Hospital, contact: Contact | undefined): HospitalDetail {
  return {
    ...toHospitalSummary(hospital, contact),
    address: hospital.address,
    statusReason: hospital.statusReason,
    verifiedAt: iso(hospital.verifiedAt),
    resubmittedAt: iso(hospital.resubmittedAt),
  };
}
