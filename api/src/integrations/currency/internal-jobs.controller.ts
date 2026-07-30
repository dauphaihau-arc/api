import {
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import {
  ExchangeRateSyncService,
  type ExchangeRateSyncResult,
} from './exchange-rate-sync.service';

const FX_SYNC_SECRET_HEADER = 'x-cron-secret';

export interface InternalFxSyncResponse {
  ok: true;
  fetchedAt: string;
  pairsRequested: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
}

@Controller('internal/jobs')
@SkipThrottle()
@ApiExcludeController()
export class InternalJobsController {
  constructor(
    private readonly exchangeRateSyncService: ExchangeRateSyncService,
    private readonly configService: ConfigService,
  ) {}

  @Post('fx-sync')
  @HttpCode(200)
  async syncFxRates(
    @Headers(FX_SYNC_SECRET_HEADER) providedSecret?: string,
  ): Promise<InternalFxSyncResponse> {
    const configuredSecret = this.configService.get<string>(
      'FX_SYNC_TRIGGER_SECRET',
    );

    if (!configuredSecret) {
      throw new HttpException(
        'FX sync trigger is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!providedSecret || !secretsMatch(configuredSecret, providedSecret)) {
      throw new UnauthorizedException('Invalid cron secret');
    }

    const result = await this.exchangeRateSyncService.syncLatestRates();
    return mapSyncResult(result);
  }
}

function mapSyncResult(result: ExchangeRateSyncResult): InternalFxSyncResponse {
  return {
    ok: true,
    fetchedAt: result.fetchedAt.toISOString(),
    pairsRequested: result.pairsRequested,
    createdCount: result.createdCount,
    updatedCount: result.updatedCount,
    skippedCount: result.skippedCount,
  };
}

function secretsMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
