import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { CacheModule } from '../../shared/cache/cache.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { AuditModule } from '../../shared/audit/audit.module';
import { ImageTransformModule } from '../../shared/image-transform/image-transform.module';
import { CurrencyModule } from '../../shared/currency/currency.module';
import { QueueModule } from '../../shared/queue/queue.module';
import { SseModule } from '../../shared/sse/sse.module';
import { CategoryModule } from '../category/category.module';
import { ShopModule } from '../shop/shop.module';
import { ProductImageService } from './app/services/product-image.service';
import { ResolvedStorefrontPriceService } from './app/services/resolved-storefront-price.service';
import { CreateProductDraftFacadeUseCase } from './app/use-cases/create-product-draft-facade/create-product-draft-facade.use-case';
import { ConsumeProductImageUploadTicketUseCase } from './app/use-cases/consume-product-image-upload-ticket/consume-product-image-upload-ticket.use-case';
import { CreateProductDraftUseCase } from './app/use-cases/create-product-draft/create-product-draft.use-case';
import { GetProductByIdUseCase } from './app/use-cases/get-product-by-id/get-product-by-id.use-case';
import { GetPublicProductBySlugsUseCase } from './app/use-cases/get-public-product-by-slugs/get-public-product-by-slugs.use-case';
import { IssueProductImageUploadUrlUseCase } from './app/use-cases/issue-product-image-upload-url/issue-product-image-upload-url.use-case';
import { ListPublicProductsUseCase } from './app/use-cases/list-public-products/list-public-products.use-case';
import { ListShopProductsUseCase } from './app/use-cases/list-shop-products/list-shop-products.use-case';
import { PublishProductUseCase } from './app/use-cases/publish-product/publish-product.use-case';
import { SetProductImagesByKeysUseCase } from './app/use-cases/set-product-images-by-keys/set-product-images-by-keys.use-case';
import { SetProductImagesUseCase } from './app/use-cases/set-product-images/set-product-images.use-case';
import { SetProductAttributesUseCase } from './app/use-cases/set-product-attributes/set-product-attributes.use-case';
import { SetProductInventoryUseCase } from './app/use-cases/set-product-inventory/set-product-inventory.use-case';
import { SetProductPricingUseCase } from './app/use-cases/set-product-pricing/set-product-pricing.use-case';
import { SetProductShippingUseCase } from './app/use-cases/set-product-shipping/set-product-shipping.use-case';
import { SetProductVariantsUseCase } from './app/use-cases/set-product-variants/set-product-variants.use-case';
import { UpdateProductDetailsUseCase } from './app/use-cases/update-product-details/update-product-details.use-case';
import { ProductPricingRepository } from './app/ports/product-pricing.repository';
import { ProductRepository } from './app/ports/product.repository';
import { ProductController } from './api/rest/product.controller';
import { ProductInventoryEventsController } from './api/rest/product-inventory-events.controller';
import { ProductUploadController } from './api/rest/product-upload.controller';
import { ForwardProductInventoryUpdatedToSseListener } from './listeners/forward-product-inventory-updated-to-sse.listener';
import { ShopProductsController } from '../shop/api/rest/shop-products.controller';
import { MikroOrmProductRepository } from './infra/mikro-orm-product.repository';
import { ProductAttributeValueEntity } from './infra/persistence/entities/product-attribute-value.entity';
import { ProductImageEntity } from './infra/persistence/entities/product-image.entity';
import { ProductImageVariantEntity } from './infra/persistence/entities/product-image-variant.entity';
import { ProductInventoryReservationEntity } from './infra/persistence/entities/product-inventory-reservation.entity';
import { ProductInventoryEntity } from './infra/persistence/entities/product-inventory.entity';
import { ProductShippingDestinationEntity } from './infra/persistence/entities/product-shipping-destination.entity';
import { ProductShippingProfileEntity } from './infra/persistence/entities/product-shipping-profile.entity';
import { ProductVariantEntity } from './infra/persistence/entities/product-variant.entity';
import { ProductEntity } from './infra/persistence/entities/product.entity';
import { VariantPriceEntity } from './infra/persistence/entities/variant-price.entity';

@Module({
  imports: [
    ConfigModule,
    CacheModule,
    IdempotencyModule,
    ShopModule,
    CategoryModule,
    StorageModule,
    ImageTransformModule,
    CurrencyModule,
    forwardRef(() => QueueModule),
    AuditModule,
    SseModule,
    MikroOrmModule.forFeature([
      ProductEntity,
      ProductImageEntity,
      ProductImageVariantEntity,
      ProductAttributeValueEntity,
      ProductVariantEntity,
      ProductInventoryEntity,
      VariantPriceEntity,
      ProductInventoryReservationEntity,
      ProductShippingProfileEntity,
      ProductShippingDestinationEntity,
    ]),
  ],
  controllers: [
    ProductController,
    ProductInventoryEventsController,
    ProductUploadController,
    ShopProductsController,
  ],
  providers: [
    {
      provide: ProductRepository,
      useClass: MikroOrmProductRepository,
    },
    {
      provide: ProductPricingRepository,
      useExisting: ProductRepository,
    },
    ProductImageService,
    ResolvedStorefrontPriceService,
    ConsumeProductImageUploadTicketUseCase,
    CreateProductDraftFacadeUseCase,
    CreateProductDraftUseCase,
    GetProductByIdUseCase,
    GetPublicProductBySlugsUseCase,
    IssueProductImageUploadUrlUseCase,
    ListPublicProductsUseCase,
    ListShopProductsUseCase,
    PublishProductUseCase,
    SetProductImagesByKeysUseCase,
    SetProductImagesUseCase,
    SetProductAttributesUseCase,
    SetProductInventoryUseCase,
    SetProductPricingUseCase,
    SetProductShippingUseCase,
    SetProductVariantsUseCase,
    UpdateProductDetailsUseCase,
    ForwardProductInventoryUpdatedToSseListener,
  ],
  exports: [
    ProductRepository,
    ProductImageService,
    ResolvedStorefrontPriceService,
    ConsumeProductImageUploadTicketUseCase,
    CreateProductDraftFacadeUseCase,
    CreateProductDraftUseCase,
    GetProductByIdUseCase,
    GetPublicProductBySlugsUseCase,
    IssueProductImageUploadUrlUseCase,
    ListPublicProductsUseCase,
    ListShopProductsUseCase,
    PublishProductUseCase,
    SetProductImagesByKeysUseCase,
    SetProductImagesUseCase,
    SetProductAttributesUseCase,
    SetProductInventoryUseCase,
    SetProductPricingUseCase,
    SetProductShippingUseCase,
    SetProductVariantsUseCase,
    UpdateProductDetailsUseCase,
  ],
})
export class ProductModule {}
