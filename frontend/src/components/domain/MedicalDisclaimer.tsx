import { Info } from 'lucide-react';
import { COMPATIBILITY_DISCLAIMER, MEDICAL_DISCLAIMER } from '@bbms/shared';
import { cn } from '@/utils/cn';

interface MedicalDisclaimerProps {
  variant?: 'general' | 'compatibility';
  className?: string;
}

/** The single, consistent safety notice shown wherever the system makes a recommendation. */
export function MedicalDisclaimer({ variant = 'general', className }: MedicalDisclaimerProps) {
  return (
    <aside
      aria-label="Medical safety notice"
      className={cn(
        'flex gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-sky-900',
        className,
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{variant === 'compatibility' ? COMPATIBILITY_DISCLAIMER : MEDICAL_DISCLAIMER}</p>
    </aside>
  );
}
