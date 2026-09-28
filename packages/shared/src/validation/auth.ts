import { z } from 'zod';
import { BLOOD_GROUPS } from '../constants/blood.js';
import {
  emailSchema,
  passwordSchema,
  personNameSchema,
  phoneSchema,
  shortTextSchema,
  tokenSchema,
} from './common.js';

/** Platform account policy (not a medical eligibility rule). */
export const MIN_ACCOUNT_AGE_YEARS = 18;

export function ageInYears(dateOfBirth: Date, today = new Date()): number {
  let age = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (today.getUTCMonth() === dateOfBirth.getUTCMonth() &&
      today.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

const consentSchema = z.literal(true, {
  error: 'You must accept the terms and privacy notice to continue',
});

const accountFields = {
  name: personNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  consent: consentSchema,
};

export const registerDonorSchema = z.object({
  ...accountFields,
  bloodGroup: z.enum(BLOOD_GROUPS, { error: 'Select your blood group' }),
  dateOfBirth: z.iso
    .date('Enter a valid date of birth')
    .refine((value) => ageInYears(new Date(value)) >= MIN_ACCOUNT_AGE_YEARS, {
      message: `You must be at least ${MIN_ACCOUNT_AGE_YEARS} to register`,
    })
    .refine((value) => ageInYears(new Date(value)) <= 120, {
      message: 'Enter a valid date of birth',
    }),
  city: shortTextSchema('City', 80),
  area: shortTextSchema('Area', 80),
});
export type RegisterDonorInput = z.infer<typeof registerDonorSchema>;

export const hospitalAddressSchema = z.object({
  line1: shortTextSchema('Address', 200),
  city: shortTextSchema('City', 80),
  state: shortTextSchema('State', 80),
  postalCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9\s-]{3,10}$/, 'Enter a valid postal code'),
});

export const registerHospitalSchema = z.object({
  ...accountFields,
  hospitalName: shortTextSchema('Hospital name', 150),
  registrationNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9/-]{3,40}$/, 'Enter a valid registration number'),
  address: hospitalAddressSchema,
});
export type RegisterHospitalInput = z.infer<typeof registerHospitalSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ token: tokenSchema, password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: tokenSchema });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(200),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'New password must be different from the current one',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
