import { z } from 'zod';

/** bcrypt only uses the first 72 bytes of a password; longer input would be silently ignored. */
const BCRYPT_MAX_BYTES = 72;

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0)!;
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export const PASSWORD_RULES_TEXT =
  'At least 10 characters, including a letter and a number (max 72 bytes).';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .pipe(z.email('Enter a valid email address'));

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .refine((value) => utf8ByteLength(value) <= BCRYPT_MAX_BYTES, {
    message: 'Password is too long',
  })
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
    message: 'Password must contain at least one letter and one number',
  });

export const personNameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name is too long');

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s-]{6,18}[0-9]$/, 'Enter a valid phone number');

export const shortTextSchema = (label: string, max = 100) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

/** Opaque, URL-safe tokens issued by the server (verification, password reset). */
export const tokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{20,200}$/, 'This link is invalid or incomplete');

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
