import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ShopRepository } from './app/ports/shop.repository';
import { CreateShopUseCase } from './app/use-cases/create-shop.use-case';
import { GetMyShopUseCase } from './app/use-cases/get-my-shop.use-case';
import { ShopController } from './api/rest/shop.controller';
import { MikroOrmShopRepository } from './infra/mikro-orm-shop.repository';
import { ShopEntity } from './infra/persistence/entities/shop.entity';

@Module({
  imports: [
    ConfigModule,
    MikroOrmModule.forFeature([ShopEntity]),
  ],
  controllers: [ShopController],
  providers: [
    {
      provide: ShopRepository,
      useClass: MikroOrmShopRepository,
    },
    CreateShopUseCase,
    GetMyShopUseCase,
  ],
  exports: [ShopRepository, CreateShopUseCase, GetMyShopUseCase],
})
export class ShopModule {}
