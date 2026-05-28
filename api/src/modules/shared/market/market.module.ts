import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  buildFxRateSyncConfig,
  FX_RATE_SYNC_CONFIG,
} from '~/config/fx-rate-sync.config';
import { MarketController } from './market.controller';
import { EXCHANGE_RATE_PROVIDER } from './exchange-rate-provider';
import { ExchangeRateEntity } from './infra/persistence/entities/exchange-rate.entity';
import { ExchangeRateSyncService } from './exchange-rate-sync.service';
import { FxRateService } from './fx-rate.service';
import { MarketService } from './market.service';
import { OpenExchangeRatesProvider } from './open-exchange-rates.provider';
import { RoundingPolicyService } from './rounding-policy.service';

@Module({
  imports: [ConfigModule, MikroOrmModule.forFeature([ExchangeRateEntity])],
  controllers: [MarketController],
  providers: [
    {
      provide: FX_RATE_SYNC_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildFxRateSyncConfig(configService),
    },
    {
      provide: EXCHANGE_RATE_PROVIDER,
      inject: [FX_RATE_SYNC_CONFIG, OpenExchangeRatesProvider],
      useFactory: (
        fxRateSyncConfig: ReturnType<typeof buildFxRateSyncConfig>,
        openExchangeRatesProvider: OpenExchangeRatesProvider
      ) => {
        if (fxRateSyncConfig.provider === 'disabled') {
          return {
            async getLatestRates() {
              throw new Error('FX rate sync provider is disabled.');
            },
          };
        }

        return openExchangeRatesProvider;
      },
    },
    MarketService,
    FxRateService,
    RoundingPolicyService,
    OpenExchangeRatesProvider,
    ExchangeRateSyncService,
  ],
  exports: [
    FX_RATE_SYNC_CONFIG,
    MarketService,
    FxRateService,
    RoundingPolicyService,
    ExchangeRateSyncService,
  ],
})
export class MarketModule {}
