import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UseInterceptors,
  UseFilters,
  UseGuards
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Idempotent } from '../../../../../common/decorators/idempotent.decorator';
import { resolveOrThrow } from '../../../../../common/application/result';
import { parseDurationToMilliseconds } from '../../../../../libs/duration';
import type { AuthenticatedUser } from '../../app/auth.types';
import { GetCurrentUserUseCase } from '../../app/use-cases/get-current-user/get-current-user.use-case';
import { LoginUseCase } from '../../app/use-cases/login/login.use-case';
import { LogoutUseCase } from '../../app/use-cases/logout/logout.use-case';
import { RefreshSessionUseCase } from '../../app/use-cases/refresh-session/refresh-session.use-case';
import { RegisterUseCase } from '../../app/use-cases/register/register.use-case';
import { CurrentUser } from '../../../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../guard/jwt-auth.guard';
import { PermissionsGuard } from '../guard/permissions.guard';
import { mapAuthAppErrorToHttpException } from './auth-error-mapper';
import { AuthHttpExceptionFilter } from './auth-http-exception.filter';
import { AuthCookieService } from './auth-cookie.utils';
import { LoginDto } from './dto/login.dto';
import { AuthUserResponseDto, MeResponseDto } from './dto/me-response.dto';
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
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
    private readonly authCookieService: AuthCookieService
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
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthUserResponseDto> {
    const authResponse = resolveOrThrow(
      await this.registerUseCase.execute(body),
      mapAuthAppErrorToHttpException
    );

    this.authCookieService.setAuthCookies(response, authResponse);

    return AuthUserResponseDto.fromUserProfile(authResponse.user);
  }

  @Post('login')
  @Throttle({
    default: authRouteRateLimits.login,
  })
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthUserResponseDto> {
    const authResponse = resolveOrThrow(
      await this.loginUseCase.execute(body),
      mapAuthAppErrorToHttpException
    );

    this.authCookieService.setAuthCookies(response, authResponse);

    return AuthUserResponseDto.fromUserProfile(authResponse.user);
  }

  @Post('refresh')
  @Throttle({
    default: authRouteRateLimits.refresh,
  })
  @Header('Cache-Control', 'no-store')
  @HttpCode(204)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    const authResponse = resolveOrThrow(
      await this.refreshSessionUseCase.execute(
        this.authCookieService.extractRefreshToken(request)
      ),
      mapAuthAppErrorToHttpException
    );

    this.authCookieService.setAuthCookies(response, authResponse);
  }

  @Post('logout')
  @Header('Cache-Control', 'no-store')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  async logout(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    await this.logoutUseCase.execute(currentUser);
    this.authCookieService.clearAuthCookies(response);
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  async me(
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<MeResponseDto> {
    return MeResponseDto.fromUserProfile(
      await this.getCurrentUserUseCase.execute(currentUser)
    );
  }
}
