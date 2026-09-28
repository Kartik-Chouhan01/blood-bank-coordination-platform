import type { AuthUser, UserSummary } from '@bbms/shared';
import { DonorProfileModel } from '../donors/donorProfile.model.js';
import { HospitalModel } from '../hospitals/hospital.model.js';
import type { User } from './user.model.js';

type UserFields = Pick<
  User,
  | '_id'
  | 'name'
  | 'email'
  | 'phone'
  | 'role'
  | 'accountStatus'
  | 'emailVerified'
  | 'lastLoginAt'
  | 'createdAt'
>;

export function toUserSummary(user: UserFields): UserSummary {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    accountStatus: user.accountStatus,
    emailVerified: user.emailVerified,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

/** The signed-in user's own view, including a summary of their role-specific profile. */
export async function toAuthUser(user: UserFields): Promise<AuthUser> {
  const base = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    accountStatus: user.accountStatus,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
  };

  if (user.role === 'DONOR') {
    const donor = await DonorProfileModel.findOne({ userId: user._id })
      .select('bloodGroup location.city location.area verificationStatus')
      .lean();
    return {
      ...base,
      profile: donor && {
        kind: 'DONOR',
        bloodGroup: donor.bloodGroup,
        city: donor.location.city,
        area: donor.location.area,
        verificationStatus: donor.verificationStatus,
      },
    };
  }

  if (user.role === 'HOSPITAL') {
    const hospital = await HospitalModel.findOne({ userId: user._id })
      .select('name verificationStatus')
      .lean();
    return {
      ...base,
      profile: hospital && {
        kind: 'HOSPITAL',
        hospitalName: hospital.name,
        verificationStatus: hospital.verificationStatus,
      },
    };
  }

  return { ...base, profile: null };
}
