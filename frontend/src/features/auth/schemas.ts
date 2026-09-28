import { z } from 'zod';
import { registerDonorSchema, registerHospitalSchema, resetPasswordSchema } from '@bbms/shared';

// Client-only "confirm password" on top of the shared API schemas.
const confirmation = { confirmPassword: z.string().min(1, 'Confirm your password') };
const passwordsMatch = (values: { password: string; confirmPassword: string }) =>
  values.password === values.confirmPassword;
const mismatch = { message: 'Passwords do not match', path: ['confirmPassword'] };

export const registerDonorFormSchema = registerDonorSchema
  .extend(confirmation)
  .refine(passwordsMatch, mismatch);

export const registerHospitalFormSchema = registerHospitalSchema
  .extend(confirmation)
  .refine(passwordsMatch, mismatch);

export const resetPasswordFormSchema = resetPasswordSchema
  .omit({ token: true })
  .extend(confirmation)
  .refine(passwordsMatch, mismatch);

export function withoutConfirmation<T extends { confirmPassword: string }>({
  confirmPassword: _confirmPassword,
  ...rest
}: T): Omit<T, 'confirmPassword'> {
  return rest;
}
