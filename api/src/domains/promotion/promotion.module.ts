import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PromotionCodeReader } from './app/ports/promotion-code.reader';
import { SaleProjectionReader } from './app/ports/sale-projection.reader';
import { PromotionRedemptionService } from './app/services/promotion-redemption.service';
import { PromotionCodeEntity } from './infra/persistence/entities/promotion-code.entity';
import { PromotionProductEntity } from './infra/persistence/entities/promotion-product.entity';
import { PromotionUsageEntity } from './infra/persistence/entities/promotion-usage.entity';
import { PromotionEntity } from './infra/persistence/entities/promotion.entity';
import { MikroOrmPromotionCodeReader } from './infra/persistence/repositories/mikro-orm-promotion-code.reader';
import { MikroOrmSaleProjectionReader } from './infra/persistence/repositories/mikro-orm-sale-projection.reader';

@Module({
  imports: [
    ConfigModule,
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
  ],
  exports: [SaleProjectionReader, PromotionCodeReader, PromotionRedemptionService],
})
export class PromotionModule {}
