import { Logger } from '@nestjs/common';
import type { MailConfig } from '../../../../config/mail.config';
import type { MailSender } from '../app/ports/mail-sender';
import type { MailAddress, SendMailInput } from '../app/mail.types';

export class LoggerMailSender implements MailSender {
  private readonly logger = new Logger(LoggerMailSender.name);

  constructor(private readonly mailConfig: MailConfig) {}

  async send(input: SendMailInput): Promise<void> {
    // Dev/test fallback: preserve the mail integration contract without delivering
    // real messages when a provider such as Resend is not configured.
    const payload = {
      from: this.formatAddress(input.from ?? this.mailConfig.defaultFrom),
      to: this.formatAddresses(input.to),
      cc: this.formatAddresses(input.cc),
      bcc: this.formatAddresses(input.bcc),
      replyTo: this.formatAddresses(input.replyTo),
      subject: input.subject,
      text: input.text,
      html: input.html,
      tags: input.tags,
      driver: this.mailConfig.driver,
    };

    this.logger.log(
      `Mail queued via logger transport: ${JSON.stringify(payload)}`
    );
  }

  private formatAddresses(
    value?: MailAddress | MailAddress[]
  ): string[] | undefined {
    if (!value) {
      return undefined;
    }

    const addresses = Array.isArray(value) ? value : [value];
    return addresses.map((address) => this.formatAddress(address));
  }

  private formatAddress(address: MailAddress): string {
    return address.name ? `${address.name} <${address.email}>` : address.email;
  }
}
