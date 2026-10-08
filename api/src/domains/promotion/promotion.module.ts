import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CurrencyModule } from '~/integrations/currency/currency.module';
import { PromotionCodeReader } from './app/ports/promotion-code.reader';
import { PromotionRepository } from './app/ports/promotion.repository';
import { SaleProjectionReader } from './app/ports/sale-projection.reader';

import { PromotionPricingService } from './app/services/promotion-pricing.service';
import { PromotionPresentmentService } from './app/services/promotion-presentment.service';
import { PromotionRedemptionService } from './app/services/promotion-redemption.service';
import { PromotionCodeEntity } from './infra/persistence/entities/promotion-code.entity';
import { PromotionProductEntity } from './infra/persistence/entities/promotion-product.entity';
import { PromotionUsageEntity } from './infra/persistence/entities/promotion-usage.entity';
import { PromotionEntity } from './infra/persistence/entities/promotion.entity';
import { MikroOrmPromotionCodeReader } from './infra/persistence/repositories/mikro-orm-promotion-code.reader';
import { MikroOrmPromotionRepository } from './infra/persistence/repositories/mikro-orm-promotion.repository';
import { MikroOrmSaleProjectionReader } from './infra/persistence/repositories/mikro-orm-sale-projection.reader';
import { PromotionLookupService } from './app/services/promotion-lookup.service';
@Module({
  imports: [
    ConfigModule,
    CurrencyModule,
    MikroOrmModule.forFeature([
      PromotionEntity,
      PromotionProductEntity,
      PromotionCodeEntity,
      PromotionUsageEntity,
    ]),
  ],
  providers: [
    PromotionRedemptionService,
    MikroOrmSaleProjectionReader,
    {
      provide: SaleProjectionReader,
      useExisting: MikroOrmSaleProjectionReader,
    },
    MikroOrmPromotionCodeReader,
    {
      provide: PromotionCodeReader,
      useExisting: MikroOrmPromotionCodeReader,
    },
    MikroOrmPromotionRepository,
    {
      provide: PromotionRepository,
      useExisting: MikroOrmPromotionRepository,
    },
    PromotionLookupService,
    PromotionPresentmentService,
    PromotionPricingService,
  ],
  exports: [
    SaleProjectionReader,
    PromotionCodeReader,
    PromotionRepository,
    PromotionLookupService,
    PromotionRedemptionService,
    PromotionPresentmentService,
    PromotionPricingService,
  ],
})
export class PromotionModule {}
