import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AUTH_CONFIG } from '../../../../../config/auth.config';
import type { AuthConfig } from '../../../../../config/auth.config';
import { AuthTokenService } from '../../app/ports/auth-token.service';
import {
  AccessTokenPayload,
  AuthenticatedUser,
  RefreshTokenPayload
} from '../../app/auth.types';

@Injectable()
export class JwtAuthTokenService implements AuthTokenService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig
  ) {}

  issueAccessToken(user: AuthenticatedUser): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.userId,
      email: user.email,
      sessionId: user.sessionId,
      roles: user.roles,
      permissions: user.permissions,
      type: 'access',
    };

    return this.jwtService.signAsync(payload);
  }

  issueRefreshToken(input: {
    userId: string;
    sessionId: string;
  }): Promise<string> {
    const payload: RefreshTokenPayload = {
      sub: input.userId,
      sessionId: input.sessionId,
      jti: randomUUID(),
      type: 'refresh',
    };

    return this.jwtService.signAsync(payload, {
      secret: this.authConfig.jwtRefreshSecret,
      expiresIn: this.authConfig.jwtRefreshTtlSeconds,
    });
  }

  async verifyRefreshToken(
    token: string
  ): Promise<(RefreshTokenPayload & { exp: number }) | null> {
    try {
      return await this.jwtService.verifyAsync<
        RefreshTokenPayload & { exp: number }
      >(token, {
        secret: this.authConfig.jwtRefreshSecret,
      });
    }
    catch {
      return null;
    }
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
    try {
      return await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.authConfig.jwtAccessSecret,
      });
    }
    catch {
      return null;
    }
  }
}
