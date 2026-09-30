import nodemailer from 'nodemailer';
import { describe, expect, it } from 'vitest';
import { SmtpMailAdapter } from '../../src/infrastructure/mail/smtpAdapter.js';

describe('SmtpMailAdapter', () => {
  it('sends a plain-text message from the configured sender', async () => {
    // nodemailer's JSON transport renders the message without any network access.
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const sent: string[] = [];
    const original = transport.sendMail.bind(transport);
    transport.sendMail = (async (mail: Parameters<typeof original>[0]) => {
      const info = await original(mail);
      sent.push(String(info.message));
      return info;
    }) as typeof transport.sendMail;

    await new SmtpMailAdapter(transport, 'DigiRakt <no-reply@digirakt.example>').send({
      to: 'donor@example.test',
      subject: 'Confirm your email address',
      text: 'Hello',
      template: 'EMAIL_VERIFY',
    });

    const message = JSON.parse(sent[0]!);
    expect(message).toMatchObject({
      subject: 'Confirm your email address',
      text: 'Hello',
      from: { address: 'no-reply@digirakt.example', name: 'DigiRakt' },
      to: [{ address: 'donor@example.test' }],
    });
    expect(message.headers['X-DigiRakt-Template']).toBe('EMAIL_VERIFY');
    expect(message.html).toBeUndefined();
  });
});
