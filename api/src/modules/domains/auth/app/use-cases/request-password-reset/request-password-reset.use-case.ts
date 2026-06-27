import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ms from 'ms';
import { appJobName } from '~/common/jobs/job.types';
import { Email } from '../../../domain/value-objects/email';
import { AuthUserRepository } from '../../ports/auth-user.repository';
import { PasswordResetTokenRepository } from '../../ports/password-reset-token.repository';
import { TokenHasher } from '../../ports/token-hasher';
import { JobDispatcher } from '~/modules/shared/queue/app/ports/job-dispatcher';

const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_TOKEN_TTL_MS = ms('1h');

type PasswordResetApp = 'storefront' | 'seller';

@Injectable()
export class RequestPasswordResetUseCase {
  private readonly logger = new Logger(RequestPasswordResetUseCase.name);

  constructor(
    private readonly authUserRepository: AuthUserRepository,
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
    private readonly tokenHasher: TokenHasher,
    private readonly jobDispatcher: JobDispatcher,
    private readonly configService: ConfigService,
  ) {}

  async execute(emailRaw: string, app: PasswordResetApp): Promise<void> {
    const email = Email.create(emailRaw);
    const user = await this.authUserRepository.findByEmail(email);

    if (!user) {
      this.logger.log(
        `Password reset requested for unknown email ${email.toString()}`,
      );
      return;
    }

    const rawToken = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

    await this.passwordResetTokenRepository.invalidateActiveTokensForUser(user.id);
    await this.passwordResetTokenRepository.create({
      userId: user.id,
      tokenHash: this.tokenHasher.hash(rawToken),
      expiresAt,
    });

    await this.jobDispatcher.dispatch(
      appJobName.sendPasswordResetEmail,
      {
        userId: user.id,
        email: user.email.toString(),
        displayName: user.displayName,
        resetUrl: this.buildResetUrl(rawToken, app),
      },
    );

    this.logger.log(
      `Queued password reset email for user ${user.id} (${user.email.toString()})`,
    );
  }

  private buildResetUrl(token: string, app: PasswordResetApp): string {
    const configKey = app === 'seller' ? 'SELLER_APP_BASE_URL' : 'APP_BASE_URL';
    const appBaseUrl = this.configService.get<string>(configKey)?.trim();
    const baseUrl = appBaseUrl?.replace(/\/$/, '');

    if (!baseUrl) {
      throw new Error(`${configKey} must be configured for password reset`);
    }

    return `${baseUrl}/reset?t=${encodeURIComponent(token)}`;
  }
}
