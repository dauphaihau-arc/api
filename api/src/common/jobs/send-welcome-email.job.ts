import { Injectable, Logger } from '@nestjs/common';
import { MailSender } from '../../modules/shared/mail/app/ports/mail-sender';
import type { AppJobPayloadMap } from './job.types';

type SendWelcomeEmailPayload =
  AppJobPayloadMap['user.send-welcome-email'];

@Injectable()
export class SendWelcomeEmailJob {
  private readonly logger = new Logger(SendWelcomeEmailJob.name);

  constructor(private readonly mailSender: MailSender) {}

  async run(payload: SendWelcomeEmailPayload): Promise<void> {
    await this.mailSender.send({
      to: { email: payload.email, name: payload.displayName },
      subject: 'Welcome',
      text: `Hello ${payload.displayName ?? payload.email}, your account was created.`,
      html: `<p>Hello ${payload.displayName ?? payload.email}, your account was created.</p>`,
      tags: ['user-created'],
    });

    this.logger.log(
      `Processed welcome email job for user ${payload.userId} (${payload.email})`,
    );
  }
}
