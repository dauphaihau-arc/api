import { Injectable, Logger } from '@nestjs/common';
import { AccountEmailLanguageService } from '~/domains/auth/app/services/account-email-language.service';
import { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';
import { renderPasswordResetEmail } from '../app/outbound-messages/password-reset.message';

type SendPasswordResetEmailPayload =
  AppJobPayloadMap['user.send-password-reset-email'];

@Injectable()
export class SendPasswordResetEmailJob {
  private readonly logger = new Logger(SendPasswordResetEmailJob.name);

  constructor(
    private readonly mailSender: MailSender,
    private readonly accountEmailLanguageService: AccountEmailLanguageService,
  ) {}

  async run(payload: SendPasswordResetEmailPayload): Promise<void> {
    const language = await this.accountEmailLanguageService.resolve(
      payload.userId,
    );

    const rendered = renderPasswordResetEmail(language, {
      displayName: payload.displayName ?? payload.email,
      email: payload.email,
      resetUrl: payload.resetUrl,
    });

    await this.mailSender.send({
      to: { email: payload.email, name: payload.displayName },
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      tags: ['password-reset'],
    });

    this.logger.log(
      `Processed password reset email job for user ${payload.userId} (${payload.email})`,
    );
  }
}
