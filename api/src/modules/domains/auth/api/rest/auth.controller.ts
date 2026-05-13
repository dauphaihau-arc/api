import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  UseInterceptors,
  UseFilters,
  UseGuards
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Idempotent } from '../../../../../common/decorators/idempotent.decorator';
import { resolveOrThrow } from '../../../../../common/application/result';
import { parseDurationToMilliseconds } from '../../../../../libs/duration';
import type {
  AuthResponse,
  AuthenticatedUser,
  UserProfile
} from '../../app/auth.types';
import { GetCurrentUserUseCase } from '../../app/use-cases/get-current-user.use-case';
import { LoginUseCase } from '../../app/use-cases/login.use-case';
import { LogoutUseCase } from '../../app/use-cases/logout.use-case';
import { RefreshSessionUseCase } from '../../app/use-cases/refresh-session.use-case';
import { RegisterUseCase } from '../../app/use-cases/register.use-case';
import { CurrentUser } from '../../../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../guard/jwt-auth.guard';
import { PermissionsGuard } from '../guard/permissions.guard';
import { mapAuthAppErrorToHttpException } from './auth-error-mapper';
import { AuthHttpExceptionFilter } from './auth-http-exception.filter';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { IdempotencyKeyInterceptor } from '../../../../../common/interceptors/idempotency-key.interceptor';

const authRouteRateLimits = {
  register: {
    limit: 3,
    ttl: parseDurationToMilliseconds('10m', 600_000),
    blockDuration: parseDurationToMilliseconds('30m', 1_800_000),
  },
  login: {
    limit: 5,
    ttl: parseDurationToMilliseconds('1m', 60_000),
    blockDuration: parseDurationToMilliseconds('5m', 300_000),
  },
  refresh: {
    limit: 10,
    ttl: parseDurationToMilliseconds('1m', 60_000),
    blockDuration: parseDurationToMilliseconds('5m', 300_000),
  },
} as const;

@Controller('auth')
@UseFilters(AuthHttpExceptionFilter)
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase
  ) {}

  @Post('register')
  @Throttle({
    default: authRouteRateLimits.register,
  })
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({
    scope: 'auth:register',
  })
  async register(@Body() body: RegisterDto): Promise<AuthResponse> {
    return resolveOrThrow(
      await this.registerUseCase.execute(body),
      mapAuthAppErrorToHttpException
    );
  }

  @Post('login')
  @Throttle({
    default: authRouteRateLimits.login,
  })
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async login(@Body() body: LoginDto): Promise<AuthResponse> {
    return resolveOrThrow(
      await this.loginUseCase.execute(body),
      mapAuthAppErrorToHttpException
    );
  }

  @Post('refresh')
  @Throttle({
    default: authRouteRateLimits.refresh,
  })
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async refresh(@Body() body: RefreshTokenDto): Promise<AuthResponse> {
    return resolveOrThrow(
      await this.refreshSessionUseCase.execute(body.refreshToken),
      mapAuthAppErrorToHttpException
    );
  }

  @Post('logout')
  @Header('Cache-Control', 'no-store')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  async logout(@CurrentUser() currentUser: AuthenticatedUser): Promise<void> {
    await this.logoutUseCase.execute(currentUser);
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  async me(
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<UserProfile> {
    return this.getCurrentUserUseCase.execute(currentUser);
  }
}
