import type {
  AvailabilityStatus,
  RequestStatus,
  UnitStatus,
  Urgency,
  VerificationStatus,
} from '@bbms/shared';
import { Badge } from '@/components/ui/Badge';
import {
  AVAILABILITY_PRESENTATION,
  REQUEST_STATUS_PRESENTATION,
  UNIT_STATUS_PRESENTATION,
  URGENCY_PRESENTATION,
  VERIFICATION_PRESENTATION,
  type StatusPresentation,
} from '@/constants/statusPresentation';

type StatusBadgeProps =
  | { kind: 'urgency'; value: Urgency }
  | { kind: 'unit'; value: UnitStatus }
  | { kind: 'request'; value: RequestStatus }
  | { kind: 'availability'; value: AvailabilityStatus }
  | { kind: 'verification'; value: VerificationStatus };

function presentationFor(props: StatusBadgeProps): StatusPresentation {
  switch (props.kind) {
    case 'urgency':
      return URGENCY_PRESENTATION[props.value];
    case 'unit':
      return UNIT_STATUS_PRESENTATION[props.value];
    case 'request':
      return REQUEST_STATUS_PRESENTATION[props.value];
    case 'availability':
      return AVAILABILITY_PRESENTATION[props.value];
    case 'verification':
      return VERIFICATION_PRESENTATION[props.value];
  }
}

export function StatusBadge(props: StatusBadgeProps) {
  const { label, tone, icon } = presentationFor(props);
  return (
    <Badge tone={tone} icon={icon}>
      {label}
    </Badge>
  );
}
