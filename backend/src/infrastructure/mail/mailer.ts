import { env, isProduction } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { SmtpMailAdapter } from './smtpAdapter.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Tag for tests and metrics, e.g. EMAIL_VERIFY. */
  template: string;
}

export interface MailAdapter {
  send(message: MailMessage): Promise<void>;
}

/**
 * Development transport: prints the email to the server log so links can be clicked locally.
 * In production it refuses to print content (which contains single-use tokens).
 */
class ConsoleMailAdapter implements MailAdapter {
  async send(message: MailMessage) {
    if (isProduction) {
      logger.error(
        { template: message.template },
        'No email transport configured; email NOT sent. Configure an SMTP/API adapter.',
      );
      return;
    }
    logger.info(`\n📧 [dev mail] ${message.subject}\n${message.text}\n`);
  }
}

/** Captures emails in memory; used by tests to read verification / reset links. */
export class InMemoryMailAdapter implements MailAdapter {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
  }
  lastTo(to: string, template?: string) {
    return [...this.sent]
      .reverse()
      .find((m) => m.to === to && (!template || m.template === template));
  }
}

let adapter: MailAdapter =
  env.MAIL_TRANSPORT === 'smtp' && env.SMTP_URL
    ? new SmtpMailAdapter(env.SMTP_URL, env.MAIL_FROM)
    : new ConsoleMailAdapter();

export function setMailAdapter(next: MailAdapter) {
  adapter = next;
}

/**
 * Email failures are logged, never thrown: they must not roll back the action that triggered them.
 * Resolves to whether the message was handed to the transport.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  try {
    await adapter.send(message);
    return true;
  } catch (err) {
    logger.error({ err, template: message.template }, 'Failed to send email');
    return false;
  }
}

/** Tokens travel in the URL fragment, which browsers never send to servers or in Referer headers. */
export function appLink(path: string, token: string) {
  return `${env.APP_URL}${path}#token=${encodeURIComponent(token)}`;
}
