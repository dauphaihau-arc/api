import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MAIL_CONFIG, buildMailConfig } from '../../../config/mail.config';
import { MailSender } from './app/ports/mail-sender';
import { LoggerMailSender } from './infra/logger-mail.sender';
import { ResendMailSender } from './infra/resend-mail.sender';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MAIL_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildMailConfig(configService),
    },
    {
      provide: MailSender,
      inject: [MAIL_CONFIG],
      useFactory: (mailConfig: ReturnType<typeof buildMailConfig>) =>
        mailConfig.driver === 'resend'
          ? new ResendMailSender(mailConfig)
          : new LoggerMailSender(mailConfig),
    },
  ],
  exports: [MAIL_CONFIG, MailSender],
})
export class MailModule {}
