import type { AuthUser, DonorSelfView } from '@bbms/shared';

export interface CompletionStep {
  label: string;
  done: boolean;
  /** Where the donor can complete it (undefined when only staff can). */
  to?: string;
}

/** Steps that make a donor reachable and well-matched. Staff-only steps are shown but not actionable. */
export function donorCompletionSteps(user: AuthUser, donor: DonorSelfView): CompletionStep[] {
  return [
    { label: 'Confirm your email address', done: user.emailVerified, to: '/account' },
    {
      label: 'Share an approximate location for nearby matching',
      done: donor.location.hasApproximateLocation,
      to: '/donor/profile',
    },
    {
      label: 'Review how you want to be contacted',
      done: donor.notificationPreferences.inApp || donor.notificationPreferences.email,
      to: '/donor/settings',
    },
    { label: 'Blood group confirmed by blood-bank staff', done: donor.bloodGroupConfirmed },
    {
      label: 'Profile verified by blood-bank staff',
      done: donor.verificationStatus === 'VERIFIED',
    },
  ];
}
