import { Inject, Injectable } from '@nestjs/common';
import { MAIL_CONFIG } from '../../../../config/mail.config';
import type { MailConfig } from '../../../../config/mail.config';
import { MailSender } from '../app/ports/mail-sender';
import { MailAddress, SendMailInput } from '../app/mail.types';

interface ResendSendEmailPayload {
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  reply_to?: string[];
  cc?: string[];
  bcc?: string[];
  tags?: Array<{ name: string; value: string }>;
}

@Injectable()
export class ResendMailSender implements MailSender {
  constructor(@Inject(MAIL_CONFIG) private readonly mailConfig: MailConfig) {}

  async send(input: SendMailInput): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.mailConfig.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.buildPayload(input)),
    });

    if (response.ok) {
      return;
    }

    const responseBody = await response.text();

    throw new Error(
      `Resend mail request failed with status ${response.status}: ${responseBody}`
    );
  }

  private buildPayload(input: SendMailInput): ResendSendEmailPayload {
    return {
      from: this.formatAddress(input.from ?? this.mailConfig.defaultFrom),
      to: this.formatRequiredAddresses(input.to),
      cc: this.formatAddresses(input.cc),
      bcc: this.formatAddresses(input.bcc),
      reply_to: this.formatAddresses(input.replyTo),
      subject: input.subject,
      text: input.text,
      html: input.html,
      tags: input.tags?.map((tag) => ({
        name: 'tag',
        value: tag,
      })),
    };
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

  private formatRequiredAddresses(value: MailAddress | MailAddress[]): string[] {
    const formattedAddresses = this.formatAddresses(value);

    if (!formattedAddresses || formattedAddresses.length === 0) {
      throw new Error('At least one recipient is required to send mail.');
    }

    return formattedAddresses;
  }

  private formatAddress(address: MailAddress): string {
    return address.name ? `${address.name} <${address.email}>` : address.email;
  }
}
