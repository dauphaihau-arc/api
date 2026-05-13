import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { resolveOrThrow } from '../../../../common/application/result';
import { RequestContextService } from '../../../shared/request-context/request-context.service';
import { AUTH_CONFIG } from '../../../../config/auth.config';
import type { AuthConfig } from '../../../../config/auth.config';
import { mapAuthAppErrorToHttpException } from '../api/rest/auth-error-mapper';
import { LoadAuthenticatedUserUseCase } from '../app/use-cases/load-authenticated-user.use-case';
import { AccessTokenPayload, AuthenticatedUser } from '../app/auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(AUTH_CONFIG) authConfig: AuthConfig,
    private readonly loadAuthenticatedUserUseCase: LoadAuthenticatedUserUseCase,
    private readonly requestContextService: RequestContextService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: authConfig.jwtAccessSecret,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const authenticatedUser = resolveOrThrow(
      await this.loadAuthenticatedUserUseCase.execute(
        payload.sub,
        payload.sessionId
      ),
      mapAuthAppErrorToHttpException
    );

    this.requestContextService.setAuthenticatedUser(authenticatedUser);

    return authenticatedUser;
  }
}
