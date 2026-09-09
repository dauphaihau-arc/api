import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiConsumes,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { FilesInterceptor } from '@nestjs/platform-express';
import { resolveOrThrow } from '~/platform/application/result';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { Idempotent } from '~/platform/decorators/idempotent.decorator';
import { IdempotencyKeyInterceptor } from '~/platform/interceptors/idempotency-key.interceptor';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import { CreateProductDraftFacadeUseCase } from '~/domains/product/app/use-cases/create-product-draft-facade/create-product-draft-facade.use-case';
import {
  CreateProductDraftUseCase,
  type CreateProductDraftInput,
} from '~/domains/product/app/use-cases/create-product-draft/create-product-draft.use-case';
import { GetProductByIdUseCase } from '~/domains/product/app/use-cases/get-product-by-id/get-product-by-id.use-case';
import { GenerateProductDescriptionUseCase } from '~/domains/product/app/use-cases/generate-product-description/generate-product-description.use-case';
import { ListShopProductsUseCase } from '~/domains/product/app/use-cases/list-shop-products/list-shop-products.use-case';
import { PublishProductUseCase } from '~/domains/product/app/use-cases/publish-product/publish-product.use-case';
import {
  SetProductImagesUseCase,
  type UploadedProductImageFile,
} from '~/domains/product/app/use-cases/set-product-images/set-product-images.use-case';
import { SetProductAttributesUseCase } from '~/domains/product/app/use-cases/set-product-attributes/set-product-attributes.use-case';
import { SetProductImagesByKeysUseCase } from '~/domains/product/app/use-cases/set-product-images-by-keys/set-product-images-by-keys.use-case';
import { SetProductShippingUseCase } from '~/domains/product/app/use-cases/set-product-shipping/set-product-shipping.use-case';
import { ConfigureProductVariantConfigurationUseCase } from '~/domains/product/app/use-cases/configure-product-variant-configuration/configure-product-variant-configuration.use-case';
import { UpdateProductDetailsUseCase } from '~/domains/product/app/use-cases/update-product-details/update-product-details.use-case';
import { BulkMutateShopProductsUseCase } from '~/domains/product/app/use-cases/bulk-mutate-shop-products/bulk-mutate-shop-products.use-case';
import type {
  ProductDraftSummary,
} from '~/domains/product/app/product.types';
import { BulkMutateShopProductsDto } from '~/domains/shop/api/rest/dto/bulk-mutate-shop-products.dto';
import { ConfigureProductVariantConfigurationDto } from '~/domains/shop/api/rest/dto/configure-product-variant-configuration.dto';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import { CreateProductDraftFacadeDto } from '~/domains/shop/api/rest/dto/create-product-draft-facade.dto';
import { CreateProductDto } from '~/domains/shop/api/rest/dto/create-product.dto';
import {
  GenerateProductDescriptionDto,
  GenerateProductDescriptionResponseDto,
} from '~/domains/shop/api/rest/dto/generate-product-description.dto';
import { ListShopProductsQueryDto } from '~/domains/shop/api/rest/dto/list-shop-products.query.dto';
import { SetProductAttributesDto } from '~/domains/shop/api/rest/dto/set-product-attributes.dto';
import { SetProductImagesByKeysDto } from '~/domains/shop/api/rest/dto/set-product-images-by-keys.dto';
import { SetProductShippingDto } from '~/domains/shop/api/rest/dto/set-product-shipping.dto';
import { UpdateProductDto } from '~/domains/shop/api/rest/dto/update-product.dto';
import { mapProductAppErrorToHttpException } from '~/domains/shop/api/rest/product-http-error-mapper';
import { toShopProductDetailResponse } from './shop-product-detail.presenter';
import type { ShopProductDetailResponse } from './shop-product-detail.response';
import { toShopProductListResponse } from './shop-product-list.presenter';
import type { ShopProductListResponse } from './shop-product-list.response';

const shopProductRouteRateLimits = {
  generateDescription: {
    limit: 5,
    ttl: 60_000,
    blockDuration: 300_000,
  },
} as const;

@Controller('shops/:shop_id/products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Products')
@ApiCookieAuth('accessCookie')
export class ShopProductsController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly createProductDraftFacadeUseCase: CreateProductDraftFacadeUseCase,
    private readonly createProductDraftUseCase: CreateProductDraftUseCase,
    private readonly getProductByIdUseCase: GetProductByIdUseCase,
    private readonly generateProductDescriptionUseCase: GenerateProductDescriptionUseCase,
    private readonly listShopProductsUseCase: ListShopProductsUseCase,
    private readonly publishProductUseCase: PublishProductUseCase,
    private readonly setProductImagesByKeysUseCase: SetProductImagesByKeysUseCase,
    private readonly setProductImagesUseCase: SetProductImagesUseCase,
    private readonly setProductAttributesUseCase: SetProductAttributesUseCase,
    private readonly configureProductVariantConfigurationUseCase: ConfigureProductVariantConfigurationUseCase,
    private readonly setProductShippingUseCase: SetProductShippingUseCase,
    private readonly updateProductDetailsUseCase: UpdateProductDetailsUseCase,
    private readonly bulkMutateShopProductsUseCase: BulkMutateShopProductsUseCase,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List products for a shop' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Paginated shop product list.',
    schema: { type: 'object' },
  })
  async products(
    @Param('shop_id') shopId: string,
    @Query() query: ListShopProductsQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<ShopProductListResponse> {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    const result = await this.listShopProductsUseCase.execute({
      shopId,
      page: query.page,
      limit: query.limit,
      state: query.state,
      categoryId: query.categoryId,
      search: query.search,
    });

    return toShopProductListResponse(result);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get shop product detail' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({
    description: 'Shop product detail.',
    schema: { type: 'object' },
  })
  async product(
    @Param('shop_id') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<ShopProductDetailResponse> {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    const product = await this.getProductOrThrow(shopId, id);

    return toShopProductDetailResponse(product);
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Create a shop product draft' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Created product draft.',
    schema: { type: 'object' },
  })
  createProductDraft(
    @Param('shop_id') shopId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateProductDto,
  ): Promise<ShopProductDetailResponse> {
    const input: CreateProductDraftInput = {
      ...body,
      shopId,
    };

    return this.createProductDraftUseCase.execute(currentUser, input)
      .then((result) =>
        resolveOrThrow(result, mapProductAppErrorToHttpException),
      )
      .then(toShopProductDetailResponse);
  }

  @Post('drafts')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({
    scope: 'product:create-draft-facade',
  })
  @ApiOperation({ summary: 'Create a shop product draft facade' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Created product draft.',
    schema: { type: 'object' },
  })
  createProductDraftFacade(
    @Param('shop_id') shopId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateProductDraftFacadeDto,
  ): Promise<ShopProductDetailResponse> {
    return this.createProductDraftFacadeUseCase.execute(currentUser, {
      shopId,
      ...body,
    }).then((result) =>
      resolveOrThrow(result, mapProductAppErrorToHttpException),
    ).then(toShopProductDetailResponse);
  }

  @Post('ai/generate-description')
  @Throttle({
    default: shopProductRouteRateLimits.generateDescription,
  })
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Generate a product description with AI' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiResponse({
    status: 200,
    type: GenerateProductDescriptionResponseDto,
  })
  async generateProductDescription(
    @Param('shop_id') shopId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: GenerateProductDescriptionDto,
  ): Promise<GenerateProductDescriptionResponseDto> {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    return {
      description: await this.generateProductDescriptionUseCase.execute(body),
    };
  }

  @Post('bulk-mutate')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'product:bulk-mutate' })
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Bulk mutate shop products' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Bulk mutation result.',
    schema: { type: 'object' },
  })
  async bulkMutateProducts(
    @Param('shop_id') shopId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: BulkMutateShopProductsDto,
  ): Promise<{
    succeeded_ids: string[];
    failed: Array<{ id: string; code: string; reason: string }>;
  }> {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    const result = await this.bulkMutateShopProductsUseCase.execute(currentUser, {
      shopId,
      productIds: body.ids,
      action: body.action,
      idempotencyKey: body.idempotencyKey,
    });

    return {
      succeeded_ids: result.succeededIds,
      failed: result.failed,
    };
  }

  @Patch(':id/details')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'product:update-details' })
  @ApiOperation({ summary: 'Update shop product details' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ description: 'Product details updated.', schema: { type: 'object' } })
  async updateProductDetails(
    @Param('shop_id') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: UpdateProductDto,
  ): Promise<ShopProductDetailResponse> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    return this.updateProductDetailsUseCase.execute(currentUser, id, body)
      .then((result) => resolveOrThrow(result, mapProductAppErrorToHttpException))
      .then(toShopProductDetailResponse);
  }

  @Post(':id/publish')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'product:publish' })
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Publish a shop product' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({
    description: 'Published product draft.',
    schema: { type: 'object' },
  })
  async publishProduct(
    @Param('shop_id') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<ShopProductDetailResponse> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    return this.publishProductUseCase.execute(currentUser, id)
      .then((result) =>
        resolveOrThrow(result, mapProductAppErrorToHttpException),
      )
      .then(toShopProductDetailResponse);
  }

  @Put(':id/images')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(FilesInterceptor('images', 10))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload shop product images' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiNoContentResponse({ description: 'Product images updated.' })
  async setProductImages(
    @Param('shop_id') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @UploadedFiles() imageFiles: UploadedProductImageFile[] = [],
    @Body() _body: unknown,
  ): Promise<void> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);
    this.validateImageFiles(imageFiles);

    const result = await this.setProductImagesUseCase.execute(currentUser, id, {
      files: imageFiles,
    });
    resolveOrThrow(result, mapProductAppErrorToHttpException);
  }

  @Put(':id/images-by-keys')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'product:set-images-by-keys' })
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Assign shop product images by storage keys' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ description: 'Product images updated.', schema: { type: 'object' } })
  async setProductImagesByKeys(
    @Param('shop_id') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: SetProductImagesByKeysDto,
  ): Promise<ShopProductDetailResponse> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    return this.setProductImagesByKeysUseCase.execute(currentUser, id, body)
      .then((result) => resolveOrThrow(result, mapProductAppErrorToHttpException))
      .then(toShopProductDetailResponse);
  }

  @Put(':id/attributes')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'product:set-attributes' })
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Set shop product attributes' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ description: 'Product attributes updated.', schema: { type: 'object' } })
  async setProductAttributes(
    @Param('shop_id') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: SetProductAttributesDto,
  ): Promise<ShopProductDetailResponse> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    return this.setProductAttributesUseCase.execute(currentUser, id, body)
      .then((result) => resolveOrThrow(result, mapProductAppErrorToHttpException))
      .then(toShopProductDetailResponse);
  }

  @Put(':product_id/variant-configuration')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'product:variant-configuration' })
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Configure normalized Product Options and Variants atomically' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ description: 'Product Variant configuration updated.', schema: { type: 'object' } })
  async configureProductVariantConfiguration(
    @Param('shop_id') shopId: string,
    @Param('product_id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: ConfigureProductVariantConfigurationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ShopProductDetailResponse> {
    return this.configureProductVariantConfigurationUseCase.execute(currentUser, id, {
      options: body.options,
      variants: body.variants,
      removedVariantIds: body.removedVariantIds,
      restoreVariantIds: body.restoreVariantIds,
      productVersion: body.productVersion,
      shopId,
      idempotencyKey,
    })
      .then((result) => resolveOrThrow(result, mapProductAppErrorToHttpException))
      .then(toShopProductDetailResponse);
  }

  @Put(':id/shipping')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'product:set-shipping' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Set shop product shipping settings' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiNoContentResponse({ description: 'Product shipping updated.' })
  async setProductShipping(
    @Param('shop_id') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: SetProductShippingDto,
  ): Promise<void> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    const result = await this.setProductShippingUseCase.execute(currentUser, id, body);
    resolveOrThrow(result, mapProductAppErrorToHttpException);
  }

  private async assertActorCanManageProductShop(
    currentUser: AuthenticatedUser,
    shopId: string,
    productId: string,
  ): Promise<void> {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);
    await this.getProductOrThrow(shopId, productId);
  }

  private async getProductOrThrow(
    shopId: string,
    productId: string,
  ): Promise<ProductDraftSummary> {
    const product = await this.getProductByIdUseCase.execute(productId);

    if (!product || product.shopId !== shopId) {
      throw new NotFoundException('Product was not found');
    }

    return product;
  }

  private validateImageFiles(files: UploadedProductImageFile[]): void {
    if (files.length === 0) {
      throw new BadRequestException('At least one image file is required');
    }

    for (const file of files) {
      if (!file.mimetype.startsWith('image/')) {
        throw new BadRequestException('All product image files must be images');
      }

      if (!file.buffer?.byteLength) {
        throw new BadRequestException('Product image file is empty');
      }
    }
  }
}
