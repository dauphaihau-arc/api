import { Injectable, Logger } from '@nestjs/common';
import { AccountEmailLanguageService } from '~/domains/auth/app/services/account-email-language.service';
import { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';
import { renderWelcomeEmail } from '../app/outbound-messages/welcome.message';

type SendWelcomeEmailPayload =
  AppJobPayloadMap['user.send-welcome-email'];

@Injectable()
export class SendWelcomeEmailJob {
  private readonly logger = new Logger(SendWelcomeEmailJob.name);

  constructor(
    private readonly mailSender: MailSender,
    private readonly accountEmailLanguageService: AccountEmailLanguageService,
  ) {}

  async run(payload: SendWelcomeEmailPayload): Promise<void> {
    const language = await this.accountEmailLanguageService.resolve(
      payload.userId,
    );
    const rendered = renderWelcomeEmail(language, {
      displayName: payload.displayName ?? payload.email,
      email: payload.email,
    });

    await this.mailSender.send({
      to: { email: payload.email, name: payload.displayName },
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      tags: ['user-created'],
    });

    this.logger.log(
      `Processed welcome email job for user ${payload.userId} (${payload.email})`,
    );
  }
}
