import { appLink, sendMail } from '../../infrastructure/mail/mailer.js';

export const EMAIL_VERIFY_TTL_HOURS = 24;
export const PASSWORD_RESET_TTL_MINUTES = 30;

export function sendVerificationEmail(to: string, name: string, token: string) {
  return sendMail({
    to,
    template: 'EMAIL_VERIFY',
    subject: 'Confirm your email address',
    text:
      `Hi ${name},\n\nConfirm your email address by opening this link ` +
      `(valid for ${EMAIL_VERIFY_TTL_HOURS} hours):\n${appLink('/verify-email', token)}\n\n` +
      `If you did not create an account, you can ignore this email.`,
  });
}

export function sendPasswordResetEmail(to: string, name: string, token: string) {
  return sendMail({
    to,
    template: 'PASSWORD_RESET',
    subject: 'Reset your password',
    text:
      `Hi ${name},\n\nReset your password using this link ` +
      `(valid for ${PASSWORD_RESET_TTL_MINUTES} minutes, single use):\n` +
      `${appLink('/reset-password', token)}\n\n` +
      `If you did not request this, you can ignore this email; your password is unchanged.`,
  });
}

export function sendPasswordChangedEmail(to: string, name: string) {
  return sendMail({
    to,
    template: 'PASSWORD_CHANGED',
    subject: 'Your password was changed',
    text:
      `Hi ${name},\n\nYour password was just changed and all other sessions were signed out.\n` +
      `If this was not you, reset your password immediately and contact support.`,
  });
}
