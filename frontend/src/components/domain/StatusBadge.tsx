import type {
  AllocationStatus,
  StockLevel,
  AvailabilityStatus,
  OutreachStatus,
  RequestStatus,
  UnitStatus,
  Urgency,
  VerificationStatus,
} from '@bbms/shared';
import { Badge } from '@/components/ui/Badge';
import {
  ALLOCATION_STATUS_PRESENTATION,
  AVAILABILITY_PRESENTATION,
  OUTREACH_STATUS_PRESENTATION,
  STOCK_LEVEL_PRESENTATION,
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
  | { kind: 'allocation'; value: AllocationStatus }
  | { kind: 'outreach'; value: OutreachStatus }
  | { kind: 'stockLevel'; value: StockLevel }
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
    case 'allocation':
      return ALLOCATION_STATUS_PRESENTATION[props.value];
    case 'outreach':
      return OUTREACH_STATUS_PRESENTATION[props.value];
    case 'stockLevel':
      return STOCK_LEVEL_PRESENTATION[props.value];
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
