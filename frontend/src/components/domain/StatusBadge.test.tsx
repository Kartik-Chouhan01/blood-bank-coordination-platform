import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { REQUEST_STATUSES, UNIT_STATUSES, URGENCY_LEVELS } from '@bbms/shared';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders a readable text label, not colour alone', () => {
    render(<StatusBadge kind="urgency" value="EMERGENCY" />);
    expect(screen.getByText('Emergency')).toBeInTheDocument();
  });

  it('marks the icon as decorative so screen readers read only the label', () => {
    const { container } = render(<StatusBadge kind="unit" value="RESERVED" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it.each([
    ['urgency', URGENCY_LEVELS],
    ['unit', UNIT_STATUSES],
    ['request', REQUEST_STATUSES],
  ] as const)('has a presentation for every %s value', (kind, values) => {
    for (const value of values) {
      // @ts-expect-error -- iterating a union of kinds; each pairing is valid at runtime
      const { container, unmount } = render(<StatusBadge kind={kind} value={value} />);
      expect(container.textContent?.trim()).not.toBe('');
      unmount();
    }
  });
});
