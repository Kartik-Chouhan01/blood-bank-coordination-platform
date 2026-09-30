import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { MailAdapter, MailMessage } from './mailer.js';

/**
 * Sends real email over SMTP (any provider: SES, SendGrid, Postmark, Mailgun, your own server).
 * Configure with MAIL_TRANSPORT=smtp, SMTP_URL (e.g. smtps://user:pass@smtp.example.org:465)
 * and MAIL_FROM. Plain-text messages only: no tracking pixels, no remote content.
 */
export class SmtpMailAdapter implements MailAdapter {
  private readonly transport: Transporter;

  constructor(
    transport: string | SMTPTransport.Options | Transporter,
    private readonly from: string,
  ) {
    this.transport =
      typeof transport === 'object' && 'sendMail' in transport
        ? transport
        : nodemailer.createTransport(transport as string | SMTPTransport.Options);
  }

  async send(message: MailMessage) {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      headers: { 'X-DigiRakt-Template': message.template },
    });
  }
}
