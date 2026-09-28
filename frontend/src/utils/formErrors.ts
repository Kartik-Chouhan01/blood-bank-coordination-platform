import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toApiClientError } from '@/services/apiError';

/**
 * Puts server-side field errors onto the matching form fields and returns a message for anything
 * that is not tied to a field (or undefined when every error was placed on a field).
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly string[],
): string | undefined {
  const apiError = toApiClientError(error);
  const fieldErrors = apiError.fieldErrors();
  let unplaced = false;

  for (const [field, message] of Object.entries(fieldErrors)) {
    if (knownFields.includes(field)) setError(field as Path<T>, { type: 'server', message });
    else unplaced = true;
  }
  return Object.keys(fieldErrors).length === 0 || unplaced ? apiError.message : undefined;
}
