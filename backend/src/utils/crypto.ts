import { createHash, randomBytes } from 'node:crypto';

/** Unguessable, URL-safe token (256 bits by default). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Tokens are stored only as SHA-256 hashes, so a database leak does not expose usable tokens.
 * (A fast hash is fine here: the input is high-entropy random data, unlike a password.)
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
