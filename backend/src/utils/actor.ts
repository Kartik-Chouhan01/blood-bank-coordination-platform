import type { Request } from 'express';
import { Types } from 'mongoose';
import type { Role } from '@bbms/shared';
import { truncateIp } from './ip.js';

/** Who is performing an action. Passed into services so authorization and auditing never guess. */
export interface Actor {
  userId: Types.ObjectId | null;
  role: Role | 'SYSTEM';
  /** The blood bank a staff member belongs to (staff may only change their own bank's records). */
  bloodBankId?: Types.ObjectId | null;
  requestId?: string;
  ipTruncated?: string;
  userAgent?: string;
}

export const SYSTEM_ACTOR: Actor = { userId: null, role: 'SYSTEM' };

export function requestContext(req: Request): Omit<Actor, 'userId' | 'role'> {
  const userAgent = req.get('user-agent')?.slice(0, 300);
  return {
    ...(typeof req.id === 'string' && { requestId: req.id }),
    ...(truncateIp(req.ip) && { ipTruncated: truncateIp(req.ip) }),
    ...(userAgent && { userAgent }),
  };
}

/** Actor for an authenticated request (requires the `authenticate` middleware). */
export function actorFromRequest(req: Request): Actor {
  if (!req.auth) throw new Error('actorFromRequest called on an unauthenticated route');
  return {
    userId: new Types.ObjectId(req.auth.userId),
    role: req.auth.role,
    bloodBankId: req.auth.bloodBankId ? new Types.ObjectId(req.auth.bloodBankId) : null,
    ...requestContext(req),
  };
}
