import { Link } from 'react-router';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { CheckboxField } from '@/components/ui/fields';

export function ConsentField({
  registration,
  error,
}: {
  registration: UseFormRegisterReturn;
  error?: string;
}) {
  return (
    <CheckboxField registration={registration} error={error}>
      I agree to the processing of my information for blood coordination as described in the{' '}
      <Link to="/help" target="_blank" className="font-medium text-brand-700 underline">
        privacy notice
      </Link>
      . My contact details are never shown publicly.
    </CheckboxField>
  );
}
