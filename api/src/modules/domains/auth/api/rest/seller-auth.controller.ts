import {
  Body,
  Controller,
  Header,
  Post,
  Res,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Idempotent } from '~/common/decorators/idempotent.decorator';
import { resolveOrThrow } from '~/common/application/result';
import { parseDurationToMilliseconds } from '~/libs/duration';
import { IdempotencyKeyInterceptor } from '~/common/interceptors/idempotency-key.interceptor';
import { RegisterSellerUseCase } from '../../app/use-cases/register-seller/register-seller.use-case';
import {
  isAuthAppError,
  mapAuthAppErrorToHttpException,
} from './auth-error-mapper';
import { AuthHttpExceptionFilter } from './auth-http-exception.filter';
import { AuthCookieService } from './auth-cookie.utils';
import { AuthUserResponseDto } from './dto/me-response.dto';
import { SellerRegisterDto } from './dto/seller-register.dto';
import type { ShopAppError } from '~/modules/domains/shop/app/errors/shop-app.error';
import { mapShopAppErrorToHttpException } from '~/modules/domains/shop/api/rest/shop-http-error-mapper';

const sellerAuthRouteRateLimits = {
  register: {
    limit: 3,
    ttl: parseDurationToMilliseconds('10m', 600_000),
    blockDuration: parseDurationToMilliseconds('30m', 1_800_000),
  },
} as const;

@Controller('seller/auth')
@UseFilters(AuthHttpExceptionFilter)
@ApiTags('Seller Auth')
export class SellerAuthController {
  constructor(
    private readonly registerSellerUseCase: RegisterSellerUseCase,
    private readonly authCookieService: AuthCookieService,
  ) {}

  @Post('register')
  @Throttle({
    default: sellerAuthRouteRateLimits.register,
  })
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({
    scope: 'seller-auth:register',
  })
  @ApiOperation({ summary: 'Register a seller account and session' })
  @ApiCreatedResponse({
    type: AuthUserResponseDto,
  })
  async register(
    @Body() body: SellerRegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponseDto> {
    const authResponse = resolveOrThrow(
      await this.registerSellerUseCase.execute(body),
      mapSellerRegisterErrorToHttpException,
    );

    this.authCookieService.setAuthCookies(response, authResponse);

    return AuthUserResponseDto.fromUserProfile(authResponse.user);
  }
}

function mapSellerRegisterErrorToHttpException(error: Error) {
  if (isAuthAppError(error)) {
    return mapAuthAppErrorToHttpException(error);
  }

  return mapShopAppErrorToHttpException(error as ShopAppError);
}
