import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { CacheModule } from '~/integrations/cache/cache.module';
import { CurrencyModule } from '~/integrations/currency/currency.module';
import { QueueModule } from '~/integrations/queue/queue.module';
import { IdempotencyModule } from '~/platform/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { ProductEntity } from '../product/infra/persistence/mikro-orm/entities/product.entity';
import { ShopModule } from '../shop/shop.module';
import { ShopShippingProfilesController } from './api/rest/shop-shipping-profiles.controller';
import { ProductShippingAssignmentPort } from './app/ports/product-shipping-assignment.port';
import { ShippingProfileRepository } from './app/ports/shipping-profile.repository';
import { ShippingQuoteService } from './app/services/shipping-quote.service';
import { ArchiveShippingProfileUseCase } from './app/use-cases/archive-shipping-profile/archive-shipping-profile.use-case';
import { ClearDefaultShippingProfileUseCase } from './app/use-cases/clear-default-shipping-profile/clear-default-shipping-profile.use-case';
import { CreateShippingProfileUseCase } from './app/use-cases/create-shipping-profile/create-shipping-profile.use-case';
import { GetShippingProfileUseCase } from './app/use-cases/get-shipping-profile/get-shipping-profile.use-case';
import { ListShippingProfilesUseCase } from './app/use-cases/list-shipping-profiles/list-shipping-profiles.use-case';
import { PreviewShippingProfileUseCase } from './app/use-cases/preview-shipping-profile/preview-shipping-profile.use-case';
import { SetDefaultShippingProfileUseCase } from './app/use-cases/set-default-shipping-profile/set-default-shipping-profile.use-case';
import { UpdateShippingProfileUseCase } from './app/use-cases/update-shipping-profile/update-shipping-profile.use-case';
import { ShippingProfileEntity } from './infra/persistence/entities/shipping-profile.entity';
import { ShippingProfileRateEntity } from './infra/persistence/entities/shipping-profile-rate.entity';
import { MikroOrmProductShippingAssignmentAdapter } from './infra/persistence/repositories/mikro-orm-product-shipping-assignment.adapter';
import { MikroOrmShippingProfileRepository } from './infra/persistence/repositories/mikro-orm-shipping-profile.repository';

@Module({
  imports: [
    ShopModule,
    AuthModule,
    CacheModule,
    CurrencyModule,
    IdempotencyModule,
    QueueModule,
    MikroOrmModule.forFeature([
      ShippingProfileEntity,
      ShippingProfileRateEntity,
      ProductEntity,
    ]),
  ],
  controllers: [ShopShippingProfilesController],
  providers: [
    {
      provide: ShippingProfileRepository,
      useClass: MikroOrmShippingProfileRepository,
    },
    {
      provide: ProductShippingAssignmentPort,
      useClass: MikroOrmProductShippingAssignmentAdapter,
    },
    CreateShippingProfileUseCase,
    ListShippingProfilesUseCase,
    GetShippingProfileUseCase,
    UpdateShippingProfileUseCase,
    ArchiveShippingProfileUseCase,
    SetDefaultShippingProfileUseCase,
    ClearDefaultShippingProfileUseCase,
    PreviewShippingProfileUseCase,
    ShippingQuoteService,
  ],
  exports: [
    ShippingProfileRepository,
    ProductShippingAssignmentPort,
    ShippingQuoteService,
  ],
})
export class ShippingModule {}
