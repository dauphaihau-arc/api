import {
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';

const SENTRY_TEST_SECRET_HEADER = 'x-sentry-test-secret';

@Controller('internal/observability')
@SkipThrottle()
@ApiExcludeController()
export class InternalSentryController {
  constructor(private readonly configService: ConfigService) {}

  @Post('sentry-test')
  @HttpCode(200)
  triggerTestError(
    @Headers(SENTRY_TEST_SECRET_HEADER) providedSecret?: string
  ): never {
    const configuredSecret = this.configService.get<string>(
      'SENTRY_TEST_TRIGGER_SECRET'
    );

    if (!configuredSecret) {
      throw new HttpException(
        'Sentry test trigger is not configured',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    if (!providedSecret || !secretsMatch(configuredSecret, providedSecret)) {
      throw new UnauthorizedException('Invalid sentry test secret');
    }

    throw new Error('Sentry test from internal trigger');
  }
}

function secretsMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
