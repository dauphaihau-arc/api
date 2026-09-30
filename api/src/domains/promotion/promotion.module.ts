import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SaleProjectionReader } from './app/ports/sale-projection.reader';
import { PromotionCodeEntity } from './infra/persistence/entities/promotion-code.entity';
import { PromotionProductEntity } from './infra/persistence/entities/promotion-product.entity';
import { PromotionUsageEntity } from './infra/persistence/entities/promotion-usage.entity';
import { PromotionEntity } from './infra/persistence/entities/promotion.entity';
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
    MikroOrmSaleProjectionReader,
    {
      provide: SaleProjectionReader,
      useExisting: MikroOrmSaleProjectionReader,
    },
  ],
  exports: [SaleProjectionReader],
})
export class PromotionModule {}
