import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
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
import { RequestPasswordResetUseCase } from '../../app/use-cases/request-password-reset/request-password-reset.use-case';
import { RefreshSessionUseCase } from '../../app/use-cases/refresh-session/refresh-session.use-case';
import { ResetPasswordUseCase } from '../../app/use-cases/reset-password/reset-password.use-case';
import { RegisterUseCase } from '../../app/use-cases/register/register.use-case';
import { VerifyResetPasswordTokenUseCase } from '../../app/use-cases/verify-reset-password-token/verify-reset-password-token.use-case';
import { CurrentUser } from '../../../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../guard/jwt-auth.guard';
import { PermissionsGuard } from '../guard/permissions.guard';
import { mapAuthAppErrorToHttpException } from './auth-error-mapper';
import { AuthHttpExceptionFilter } from './auth-http-exception.filter';
import { AuthCookieService } from './auth-cookie.utils';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { AuthUserResponseDto, MeResponseDto } from './dto/me-response.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RegisterDto } from './dto/register.dto';
import { IdempotencyKeyInterceptor } from '../../../../../common/interceptors/idempotency-key.interceptor';
import { TokenQueryDto } from './dto/token-query.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';

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
  passwordReset: {
    limit: 5,
    ttl: parseDurationToMilliseconds('10m', 600_000),
    blockDuration: parseDurationToMilliseconds('15m', 900_000),
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
    private readonly requestPasswordResetUseCase: RequestPasswordResetUseCase,
    private readonly verifyResetPasswordTokenUseCase: VerifyResetPasswordTokenUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
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

  @Post('forgot-password')
  @Throttle({
    default: authRouteRateLimits.passwordReset,
  })
  @Header('Cache-Control', 'no-store')
  @HttpCode(204)
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<void> {
    await this.requestPasswordResetUseCase.execute(body.email);
  }

  @Get('verify-token')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async verifyToken(@Query() query: VerifyTokenDto): Promise<void> {
    resolveOrThrow(
      await this.verifyResetPasswordTokenUseCase.execute(query.token),
      mapAuthAppErrorToHttpException
    );
  }

  @Post('reset-password')
  @Throttle({
    default: authRouteRateLimits.passwordReset,
  })
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async resetPassword(
    @Query() query: TokenQueryDto,
    @Body() body: ResetPasswordDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthUserResponseDto> {
    const authResponse = resolveOrThrow(
      await this.resetPasswordUseCase.execute({
        token: query.token,
        password: body.password,
      }),
      mapAuthAppErrorToHttpException
    );

    this.authCookieService.setAuthCookies(response, authResponse);

    return AuthUserResponseDto.fromUserProfile(authResponse.user);
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
