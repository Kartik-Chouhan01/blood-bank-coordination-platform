import { useState, useId, type ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  /** Overrides and irreversible actions must record why; the reason is passed to onConfirm. */
  requireReason?: boolean;
  isLoading?: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

const MIN_REASON_LENGTH = 5;

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  requireReason = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const reasonValid = !requireReason || reason.trim().length >= MIN_REASON_LENGTH;

  const close = () => {
    setReason('');
    onCancel();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant={tone}
            isLoading={isLoading}
            disabled={!reasonValid}
            onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>{description}</div>
        {requireReason && (
          <div className="space-y-1.5">
            <label htmlFor={reasonId} className="block text-sm font-medium text-slate-700">
              Reason <span className="text-slate-400">(recorded in the audit log)</span>
            </label>
            <textarea
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
