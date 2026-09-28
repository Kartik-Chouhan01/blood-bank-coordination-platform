export const WORKFLOW_STEPS = [
  {
    title: 'Hospital raises a request',
    body: 'A verified hospital specifies blood group, component, units needed, urgency and the time it is required by.',
  },
  {
    title: 'Inventory is checked',
    body: 'Blood-bank staff see potentially compatible, in-date units ranked earliest-expiry-first and reserve them — a unit can never be reserved twice.',
  },
  {
    title: 'Potential donors are contacted',
    body: 'If stock falls short, donors who match system criteria (group, availability, area, time since last donation) are notified. Their contact details stay private.',
  },
  {
    title: 'Units are issued and tracked',
    body: 'Every unit and request has a full, auditable lifecycle from collection to receipt, so nothing happens silently.',
  },
] as const;
