import type { VerificationStatus } from '@bbms/shared';
import { env } from '../../config/env.js';
import { sendMail } from '../../infrastructure/mail/mailer.js';

const SUBJECTS: Partial<Record<VerificationStatus, string>> = {
  VERIFIED: 'Your hospital has been verified',
  REJECTED: 'Your hospital registration needs attention',
  SUSPENDED: 'Your hospital account has been suspended',
};

export function sendHospitalVerificationEmail(
  to: string,
  contactName: string,
  hospitalName: string,
  status: VerificationStatus,
  reason: string | null,
) {
  const subject = SUBJECTS[status];
  if (!subject) return Promise.resolve();

  const body =
    status === 'VERIFIED'
      ? `${hospitalName} is now verified. You can raise blood requests from your dashboard.`
      : status === 'REJECTED'
        ? `We could not verify ${hospitalName}.\nReason: ${reason}\n\n` +
          'You can correct your hospital details from your dashboard; this resubmits them for review.'
        : `${hospitalName} has been suspended and cannot raise new requests.\nReason: ${reason}`;

  return sendMail({
    to,
    template: `HOSPITAL_${status}`,
    subject,
    text: `Hi ${contactName},\n\n${body}\n\n${env.APP_URL}/hospital`,
  });
}
