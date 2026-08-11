import { Inject, Injectable } from '@nestjs/common';
import { err, ok, Result } from '~/platform/application/result';
import { AUTH_CONFIG } from '~/platform/config/auth.config';
import type { AuthConfig } from '~/platform/config/auth.config';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import {
  AuthResponse,
  AuthenticatedUser,
} from '../../auth.types';
import {
  InactiveUserError,
  UserNotFoundError,
} from '../../errors/auth-app.error';
import { UserStatus } from '../../../domain/enums/user-status.enum';
import type { UserSession } from '../../../domain/models/user-session';
import { AuthSessionRepository } from '../../ports/auth-session.repository';
import { AuthTokenService } from '../../ports/auth-token.service';
import { TokenHasher } from '../../ports/token-hasher';
import { AuthUserRepository } from '../../ports/auth-user.repository';
import { UserPreferenceRepository } from '../../ports/user-preference.repository';
import type { UserAccount } from '../../../domain/models/user-account';

@Injectable()
export class IssueSessionUseCase {
  constructor(
    private readonly authUserRepository: AuthUserRepository,
    private readonly authSessionRepository: AuthSessionRepository,
    private readonly authTokenService: AuthTokenService,
    private readonly tokenHasher: TokenHasher,
    private readonly userPreferenceRepository: UserPreferenceRepository,
    private readonly requestContextService: RequestContextService,
    @Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig,
  ) {}

  async execute(
    userId: string,
    existingSession?: UserSession,
    existingUser?: UserAccount,
  ): Promise<Result<AuthResponse, InactiveUserError | UserNotFoundError>> {
    const user = existingUser ?? await this.authUserRepository.findById(userId);

    if (!user) {
      return err(new UserNotFoundError());
    }

    if (user.status !== UserStatus.ACTIVE) {
      return err(new InactiveUserError());
    }

    const preferences = await this.userPreferenceRepository.findByUserId(user.id);
    const requestContext = this.requestContextService.get();

    const session =
      existingSession ??
      (await this.authSessionRepository.create({
        userId: user.id,
        refreshTokenHash: '',
        expiresAt: new Date(),
        userAgent: requestContext.userAgent,
        ipAddress: requestContext.ipAddress,
      }));

    const authenticatedUser: AuthenticatedUser = {
      userId: user.id,
      email: user.email.toString(),
      displayName: user.displayName,
      status: user.status,
      sessionId: session.id,
      roles: user.roles.map((role) => role.toString()),
      permissions: user.permissions.map((permission) => permission.toString()),
    };

    this.requestContextService.setAuthenticatedUser(authenticatedUser);

    const accessToken =
      await this.authTokenService.issueAccessToken(authenticatedUser);
    const refreshToken = await this.authTokenService.issueRefreshToken({
      userId: user.id,
      sessionId: session.id,
    });

    session.refreshTokenHash = this.tokenHasher.hash(refreshToken);
    session.expiresAt = new Date(
      Date.now() + (this.authConfig.jwtRefreshTtlSeconds * 1000),
    );
    session.revokedAt = undefined;
    session.userAgent = requestContext.userAgent;
    session.ipAddress = requestContext.ipAddress;
    await this.authSessionRepository.save(session);

    return ok({
      accessToken,
      refreshToken,
      user: {
        id: authenticatedUser.userId,
        email: authenticatedUser.email,
        displayName: authenticatedUser.displayName,
        status: authenticatedUser.status,
        sessionId: authenticatedUser.sessionId,
        roles: authenticatedUser.roles,
        permissions: authenticatedUser.permissions,
        ...(preferences ? { preferences } : {}),
      },
    });
  }
}
