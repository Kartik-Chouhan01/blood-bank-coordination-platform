import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmationDialog } from './ConfirmationDialog';

describe('ConfirmationDialog', () => {
  it('requires a reason before an override can be confirmed', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmationDialog
        open
        title="Override status"
        description="This bypasses the normal workflow."
        requireReason
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/reason/i), 'Unit damaged in transit');
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('Unit damaged in transit');
  });

  it('confirms without a reason when none is required', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmationDialog
        open
        title="Reserve units"
        description="Reserve 2 units?"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });
});
