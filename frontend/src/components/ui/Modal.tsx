import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** `wide` for dialogs that hold a table. */
  size?: 'default' | 'wide';
}

/** Built on native <dialog>: focus trapping, Escape-to-close and inert background come for free. */
export function Modal({ open, onClose, title, children, footer, size = 'default' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={cn(
        'm-auto w-full rounded-xl bg-white p-0 shadow-xl backdrop:bg-slate-900/50',
        size === 'wide' ? 'max-w-4xl' : 'max-w-lg',
      )}
    >
      {open && (
        <>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Close dialog"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="px-5 py-4 text-sm text-slate-700">{children}</div>
          {footer && (
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
              {footer}
            </div>
          )}
        </>
      )}
    </dialog>
  );
}
