import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { resolveOrThrow } from '~/platform/application/result';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { AUTH_CONFIG } from '~/platform/config/auth.config';
import type { AuthConfig } from '~/platform/config/auth.config';
import { mapAuthAppErrorToHttpException } from '../api/rest/auth-error-mapper';
import { extractCookieValue } from '../api/rest/auth-cookie.utils';
import { LoadAuthenticatedUserUseCase } from '../app/use-cases/load-authenticated-user/load-authenticated-user.use-case';
import { AccessTokenPayload, AuthenticatedUser } from '../app/auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(AUTH_CONFIG) authConfig: AuthConfig,
    private readonly loadAuthenticatedUserUseCase: LoadAuthenticatedUserUseCase,
    private readonly requestContextService: RequestContextService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request | undefined) =>
          request
            ? extractCookieValue(request, authConfig.accessCookieName)
            : null,
      ]),
      ignoreExpiration: false,
      secretOrKey: authConfig.jwtAccessSecret,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const authenticatedUser = resolveOrThrow(
      await this.loadAuthenticatedUserUseCase.execute(
        payload.sub,
        payload.sessionId,
      ),
      mapAuthAppErrorToHttpException,
    );

    this.requestContextService.setAuthenticatedUser(authenticatedUser);

    return authenticatedUser;
  }
}
