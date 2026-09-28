import type { ReactNode } from 'react';
import {
  Ban,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  FlaskConical,
  Hourglass,
  Lock,
  PackageCheck,
  Siren,
  TriangleAlert,
  Truck,
  UserCheck,
  UserX,
} from 'lucide-react';
import type {
  AvailabilityStatus,
  RequestStatus,
  UnitStatus,
  Urgency,
  VerificationStatus,
} from '@bbms/shared';
import type { BadgeTone } from '@/components/ui/Badge';

export interface StatusPresentation {
  label: string;
  tone: BadgeTone;
  icon: ReactNode;
}

const icon = (Icon: typeof Clock) => <Icon className="size-3.5" aria-hidden />;

// Every status has an icon AND a text label, so meaning never depends on colour alone.
export const URGENCY_PRESENTATION: Record<Urgency, StatusPresentation> = {
  EMERGENCY: { label: 'Emergency', tone: 'critical', icon: icon(Siren) },
  URGENT: { label: 'Urgent', tone: 'warning', icon: icon(TriangleAlert) },
  ROUTINE: { label: 'Routine', tone: 'info', icon: icon(Clock) },
};

export const UNIT_STATUS_PRESENTATION: Record<UnitStatus, StatusPresentation> = {
  COLLECTED: { label: 'Collected', tone: 'neutral', icon: icon(CircleDashed) },
  UNDER_TESTING: { label: 'Under testing', tone: 'info', icon: icon(FlaskConical) },
  AVAILABLE: { label: 'Available', tone: 'success', icon: icon(CircleCheck) },
  RESERVED: { label: 'Reserved', tone: 'reserved', icon: icon(Lock) },
  ISSUED: { label: 'Issued', tone: 'info', icon: icon(Truck) },
  RECEIVED: { label: 'Received', tone: 'neutral', icon: icon(PackageCheck) },
  EXPIRED: { label: 'Expired', tone: 'warning', icon: icon(Hourglass) },
  DISCARDED: { label: 'Discarded', tone: 'muted', icon: icon(Ban) },
};

export const REQUEST_STATUS_PRESENTATION: Record<RequestStatus, StatusPresentation> = {
  PENDING: { label: 'Pending review', tone: 'neutral', icon: icon(Clock) },
  APPROVED: { label: 'Approved', tone: 'info', icon: icon(CircleCheck) },
  PARTIALLY_ALLOCATED: { label: 'Partially allocated', tone: 'warning', icon: icon(CircleDashed) },
  ALLOCATED: { label: 'Allocated', tone: 'reserved', icon: icon(Lock) },
  FULFILLED: { label: 'Fulfilled', tone: 'success', icon: icon(Truck) },
  COMPLETED: { label: 'Completed', tone: 'success', icon: icon(PackageCheck) },
  REJECTED: { label: 'Rejected', tone: 'critical', icon: icon(CircleX) },
  CANCELLED: { label: 'Cancelled', tone: 'muted', icon: icon(Ban) },
  EXPIRED: { label: 'Expired', tone: 'muted', icon: icon(Hourglass) },
};

export const AVAILABILITY_PRESENTATION: Record<AvailabilityStatus, StatusPresentation> = {
  AVAILABLE: { label: 'Available', tone: 'success', icon: icon(UserCheck) },
  UNAVAILABLE: { label: 'Unavailable', tone: 'neutral', icon: icon(UserX) },
  TEMPORARILY_UNAVAILABLE: { label: 'Temporarily unavailable', tone: 'warning', icon: icon(Clock) },
  DO_NOT_CONTACT: { label: 'Do not contact', tone: 'muted', icon: icon(Ban) },
};

export const VERIFICATION_PRESENTATION: Record<VerificationStatus, StatusPresentation> = {
  PENDING: { label: 'Verification pending', tone: 'warning', icon: icon(Clock) },
  VERIFIED: { label: 'Verified', tone: 'success', icon: icon(CircleCheck) },
  REJECTED: { label: 'Rejected', tone: 'critical', icon: icon(CircleX) },
  SUSPENDED: { label: 'Suspended', tone: 'muted', icon: icon(Ban) },
};
