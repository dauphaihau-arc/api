import { Injectable, Logger } from '@nestjs/common';
import { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import type { AppJobPayloadMap } from '~/integrations/queue/app/app-job.types';

type SendPasswordResetEmailPayload =
  AppJobPayloadMap['user.send-password-reset-email'];

@Injectable()
export class SendPasswordResetEmailJob {
  private readonly logger = new Logger(SendPasswordResetEmailJob.name);

  constructor(private readonly mailSender: MailSender) {}

  async run(payload: SendPasswordResetEmailPayload): Promise<void> {
    await this.mailSender.send({
      to: { email: payload.email, name: payload.displayName },
      subject: 'Reset your password',
      text:
        `Hello ${payload.displayName ?? payload.email}, ` +
        `reset your password using this link: ${payload.resetUrl}`,
      html:
        `<p>Hello ${payload.displayName ?? payload.email},</p>` +
        `<p><a href="${payload.resetUrl}">Reset your password</a></p>`,
      tags: ['password-reset'],
    });

    this.logger.log(
      `Processed password reset email job for user ${payload.userId} (${payload.email})`,
    );
  }
}
