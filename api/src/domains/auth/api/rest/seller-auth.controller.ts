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
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { sellerAuthControllerErrorResponses } from './errors/auth-error-responses';
import { Idempotent } from '~/platform/idempotency/idempotent.decorator';
import { resolveOrThrow } from '~/platform/application/result';
import { parseDurationToMilliseconds } from '~/shared/libs/duration';
import { IdempotencyKeyInterceptor } from '~/platform/idempotency/idempotency-key.interceptor';
import { RegisterSellerUseCase } from '../../app/use-cases/register-seller/register-seller.use-case';
import {
  isAuthAppError,
  mapAuthAppErrorToHttpException,
} from './errors/auth-error-mapper';
import { AuthHttpExceptionFilter } from './errors/auth-http-exception.filter';
import { AuthCookieService } from './cookies/auth-cookie.utils';
import { AuthUserResponseDto } from './dto/me-response.dto';
import { SellerRegisterDto } from './dto/seller-register.dto';
import type { ShopAppError } from '~/domains/shop/app/errors/shop-app.error';
import { mapShopAppErrorToHttpException } from '~/domains/shop/api/rest/errors/shop-http-error-mapper';

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
@ApiErrorResponses(sellerAuthControllerErrorResponses.controller)
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
  @ApiOperation({
    summary: 'Register seller',
    description: 'Creates a seller account, starts a session, and sets authentication cookies.',
  })
  @ApiCreatedResponse({
    type: AuthUserResponseDto,
  })
  @ApiErrorResponses(sellerAuthControllerErrorResponses.register)
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
