import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from '../../shared/storage/storage.module';
import { CategoryModule } from '../category/category.module';
import { ShopModule } from '../shop/shop.module';
import { CreateProductDraftUseCase } from './app/use-cases/create-product-draft.use-case';
import { GetProductByIdUseCase } from './app/use-cases/get-product-by-id.use-case';
import { GetPublicProductByIdUseCase } from './app/use-cases/get-public-product-by-id.use-case';
import { ListPublicProductsUseCase } from './app/use-cases/list-public-products.use-case';
import { ListShopProductsUseCase } from './app/use-cases/list-shop-products.use-case';
import { PublishProductUseCase } from './app/use-cases/publish-product.use-case';
import { SetProductImagesUseCase } from './app/use-cases/set-product-images.use-case';
import { SetProductAttributesUseCase } from './app/use-cases/set-product-attributes.use-case';
import { SetProductInventoryUseCase } from './app/use-cases/set-product-inventory.use-case';
import { SetProductShippingUseCase } from './app/use-cases/set-product-shipping.use-case';
import { SetProductVariantsUseCase } from './app/use-cases/set-product-variants.use-case';
import { UpdateProductDetailsUseCase } from './app/use-cases/update-product-details.use-case';
import { ProductRepository } from './app/ports/product.repository';
import { ProductController } from './api/rest/product.controller';
import { ShopProductsController } from '../shop/api/rest/shop-products.controller';
import { MikroOrmProductRepository } from './infra/mikro-orm-product.repository';
import { ProductAttributeValueEntity } from './infra/persistence/entities/product-attribute-value.entity';
import { ProductImageEntity } from './infra/persistence/entities/product-image.entity';
import { ProductInventoryReservationEntity } from './infra/persistence/entities/product-inventory-reservation.entity';
import { ProductInventoryEntity } from './infra/persistence/entities/product-inventory.entity';
import { ProductShippingDestinationEntity } from './infra/persistence/entities/product-shipping-destination.entity';
import { ProductShippingProfileEntity } from './infra/persistence/entities/product-shipping-profile.entity';
import { ProductVariantEntity } from './infra/persistence/entities/product-variant.entity';
import { ProductEntity } from './infra/persistence/entities/product.entity';

@Module({
  imports: [
    ConfigModule,
    ShopModule,
    CategoryModule,
    StorageModule,
    MikroOrmModule.forFeature([
      ProductEntity,
      ProductImageEntity,
      ProductAttributeValueEntity,
      ProductVariantEntity,
      ProductInventoryEntity,
      ProductInventoryReservationEntity,
      ProductShippingProfileEntity,
      ProductShippingDestinationEntity,
    ]),
  ],
  controllers: [ProductController, ShopProductsController],
  providers: [
    {
      provide: ProductRepository,
      useClass: MikroOrmProductRepository,
    },
    CreateProductDraftUseCase,
    GetProductByIdUseCase,
    GetPublicProductByIdUseCase,
    ListPublicProductsUseCase,
    ListShopProductsUseCase,
    PublishProductUseCase,
    SetProductImagesUseCase,
    SetProductAttributesUseCase,
    SetProductInventoryUseCase,
    SetProductShippingUseCase,
    SetProductVariantsUseCase,
    UpdateProductDetailsUseCase,
  ],
  exports: [
    ProductRepository,
    CreateProductDraftUseCase,
    GetProductByIdUseCase,
    GetPublicProductByIdUseCase,
    ListPublicProductsUseCase,
    ListShopProductsUseCase,
    PublishProductUseCase,
    SetProductImagesUseCase,
    SetProductAttributesUseCase,
    SetProductInventoryUseCase,
    SetProductShippingUseCase,
    SetProductVariantsUseCase,
    UpdateProductDetailsUseCase,
  ],
})
export class ProductModule {}
