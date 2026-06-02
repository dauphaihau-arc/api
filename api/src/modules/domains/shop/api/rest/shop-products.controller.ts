import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
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
  UseInterceptors
} from '@nestjs/common';
import {
  ApiConsumes,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '~/common/decorators/require-permissions.decorator';
import { FilesInterceptor } from '@nestjs/platform-express';
import { resolveOrThrow } from '~/common/application/result';
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import { Idempotent } from '~/common/decorators/idempotent.decorator';
import { IdempotencyKeyInterceptor } from '~/common/interceptors/idempotency-key.interceptor';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import { CreateProductDraftFacadeUseCase } from '~/modules/domains/product/app/use-cases/create-product-draft-facade/create-product-draft-facade.use-case';
import {
  CreateProductDraftUseCase,
  type CreateProductDraftInput
} from '~/modules/domains/product/app/use-cases/create-product-draft/create-product-draft.use-case';
import { GetProductByIdUseCase } from '~/modules/domains/product/app/use-cases/get-product-by-id/get-product-by-id.use-case';
import { ListShopProductsUseCase } from '~/modules/domains/product/app/use-cases/list-shop-products/list-shop-products.use-case';
import { PublishProductUseCase } from '~/modules/domains/product/app/use-cases/publish-product/publish-product.use-case';
import {
  SetProductImagesUseCase,
  type UploadedProductImageFile
} from '~/modules/domains/product/app/use-cases/set-product-images/set-product-images.use-case';
import { SetProductAttributesUseCase } from '~/modules/domains/product/app/use-cases/set-product-attributes/set-product-attributes.use-case';
import { SetProductImagesByKeysUseCase } from '~/modules/domains/product/app/use-cases/set-product-images-by-keys/set-product-images-by-keys.use-case';
import { SetProductInventoryUseCase } from '~/modules/domains/product/app/use-cases/set-product-inventory/set-product-inventory.use-case';
import { SetProductPricingUseCase } from '~/modules/domains/product/app/use-cases/set-product-pricing/set-product-pricing.use-case';
import { SetProductShippingUseCase } from '~/modules/domains/product/app/use-cases/set-product-shipping/set-product-shipping.use-case';
import { SetProductVariantsUseCase } from '~/modules/domains/product/app/use-cases/set-product-variants/set-product-variants.use-case';
import { UpdateProductDetailsUseCase } from '~/modules/domains/product/app/use-cases/update-product-details/update-product-details.use-case';
import { BulkMutateShopProductsUseCase } from '~/modules/domains/product/app/use-cases/bulk-mutate-shop-products/bulk-mutate-shop-products.use-case';
import type {
  ProductDraftSummary
} from '~/modules/domains/product/app/product.types';
import { BulkMutateShopProductsDto } from '~/modules/domains/product/api/rest/dto/bulk-mutate-shop-products.dto';
import { CreateProductDraftFacadeDto } from '~/modules/domains/product/api/rest/dto/create-product-draft-facade.dto';
import { CreateProductDto } from '~/modules/domains/product/api/rest/dto/create-product.dto';
import { ListShopProductsQueryDto } from '~/modules/domains/product/api/rest/dto/list-shop-products.query.dto';
import { SetProductAttributesDto } from '~/modules/domains/product/api/rest/dto/set-product-attributes.dto';
import { SetProductImagesByKeysDto } from '~/modules/domains/product/api/rest/dto/set-product-images-by-keys.dto';
import { SetProductInventoryDto } from '~/modules/domains/product/api/rest/dto/set-product-inventory.dto';
import { SetProductPricingDto } from '~/modules/domains/product/api/rest/dto/set-product-pricing.dto';
import { SetProductShippingDto } from '~/modules/domains/product/api/rest/dto/set-product-shipping.dto';
import { SetProductVariantsDto } from '~/modules/domains/product/api/rest/dto/set-product-variants.dto';
import { UpdateProductDto } from '~/modules/domains/product/api/rest/dto/update-product.dto';
import { mapProductAppErrorToHttpException } from '~/modules/domains/product/api/rest/product-http-error-mapper';
import { ShopRepository } from '../../app/ports/shop.repository';
import { toShopProductDetailResponse } from './shop-product-detail.presenter';
import type { ShopProductDetailResponse } from './shop-product-detail.response';
import { toShopProductListResponse } from './shop-product-list.presenter';
import type { ShopProductListResponse } from './shop-product-list.response';

@Controller('shops/:shop_id/products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Products')
@ApiCookieAuth('accessCookie')
export class ShopProductsController {
  constructor(
    private readonly shopRepository: ShopRepository,
    private readonly createProductDraftFacadeUseCase: CreateProductDraftFacadeUseCase,
    private readonly createProductDraftUseCase: CreateProductDraftUseCase,
    private readonly getProductByIdUseCase: GetProductByIdUseCase,
    private readonly listShopProductsUseCase: ListShopProductsUseCase,
    private readonly publishProductUseCase: PublishProductUseCase,
    private readonly setProductImagesByKeysUseCase: SetProductImagesByKeysUseCase,
    private readonly setProductImagesUseCase: SetProductImagesUseCase,
    private readonly setProductAttributesUseCase: SetProductAttributesUseCase,
    private readonly setProductVariantsUseCase: SetProductVariantsUseCase,
    private readonly setProductInventoryUseCase: SetProductInventoryUseCase,
    private readonly setProductPricingUseCase: SetProductPricingUseCase,
    private readonly setProductShippingUseCase: SetProductShippingUseCase,
    private readonly updateProductDetailsUseCase: UpdateProductDetailsUseCase,
    private readonly bulkMutateShopProductsUseCase: BulkMutateShopProductsUseCase
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
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<ShopProductListResponse> {
    await this.assertActorCanManageShop(currentUser, shopId);

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
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<ShopProductDetailResponse> {
    await this.assertActorCanManageShop(currentUser, shopId);

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
    @Body() body: CreateProductDto
  ): Promise<ShopProductDetailResponse> {
    const input: CreateProductDraftInput = {
      ...body,
      shopId,
    };

    return this.createProductDraftUseCase.execute(currentUser, input)
      .then((result) =>
        resolveOrThrow(result, mapProductAppErrorToHttpException)
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
    @Body() body: CreateProductDraftFacadeDto
  ): Promise<ShopProductDetailResponse> {
    return this.createProductDraftFacadeUseCase.execute(currentUser, {
      shopId,
      ...body,
    }).then((result) =>
      resolveOrThrow(result, mapProductAppErrorToHttpException)
    ).then(toShopProductDetailResponse);
  }

  @Post('bulk-mutate')
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
    @Body() body: BulkMutateShopProductsDto
  ): Promise<{
    succeeded_ids: string[];
    failed: Array<{ id: string; code: string; reason: string }>;
  }> {
    await this.assertActorCanManageShop(currentUser, shopId);

    const result = await this.bulkMutateShopProductsUseCase.execute(currentUser, {
      shopId,
      productIds: body.ids,
      action: body.action,
    });

    return {
      succeeded_ids: result.succeededIds,
      failed: result.failed,
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Update shop product details' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiNoContentResponse({ description: 'Product updated.' })
  async updateProduct(
    @Param('shop_id') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: UpdateProductDto
  ): Promise<void> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    const result = await this.updateProductDetailsUseCase.execute(currentUser, id, body);
    resolveOrThrow(result, mapProductAppErrorToHttpException);
  }

  @Post(':id/publish')
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
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<ShopProductDetailResponse> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    return this.publishProductUseCase.execute(currentUser, id)
      .then((result) =>
        resolveOrThrow(result, mapProductAppErrorToHttpException)
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
    @Body() _body: unknown
  ): Promise<void> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);
    this.validateImageFiles(imageFiles);

    const result = await this.setProductImagesUseCase.execute(currentUser, id, {
      files: imageFiles,
    });
    resolveOrThrow(result, mapProductAppErrorToHttpException);
  }

  @Put(':id/images-by-keys')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Assign shop product images by storage keys' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiNoContentResponse({ description: 'Product images updated.' })
  async setProductImagesByKeys(
    @Param('shop_id') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: SetProductImagesByKeysDto
  ): Promise<void> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    const result = await this.setProductImagesByKeysUseCase.execute(currentUser, id, body);
    resolveOrThrow(result, mapProductAppErrorToHttpException);
  }

  @Put(':id/attributes')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Set shop product attributes' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiNoContentResponse({ description: 'Product attributes updated.' })
  async setProductAttributes(
    @Param('shop_id') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: SetProductAttributesDto
  ): Promise<void> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    const result = await this.setProductAttributesUseCase.execute(currentUser, id, body);
    resolveOrThrow(result, mapProductAppErrorToHttpException);
  }

  @Put(':id/variants')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Set shop product variants' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiNoContentResponse({ description: 'Product variants updated.' })
  async setProductVariants(
    @Param('shop_id') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: SetProductVariantsDto
  ): Promise<void> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    const result = await this.setProductVariantsUseCase.execute(currentUser, id, body);
    resolveOrThrow(result, mapProductAppErrorToHttpException);
  }

  @Put(':id/inventory')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Set shop product inventory' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiNoContentResponse({ description: 'Product inventory updated.' })
  async setProductInventory(
    @Param('shop_id') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: SetProductInventoryDto
  ): Promise<void> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    const result = await this.setProductInventoryUseCase.execute(currentUser, id, body);
    resolveOrThrow(result, mapProductAppErrorToHttpException);
  }

  @Put(':id/pricing')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Set shop product pricing' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiNoContentResponse({ description: 'Product pricing updated.' })
  async setProductPricing(
    @Param('shop_id') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: SetProductPricingDto
  ): Promise<void> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    const result = await this.setProductPricingUseCase.execute(currentUser, id, body);
    resolveOrThrow(result, mapProductAppErrorToHttpException);
  }

  @Put(':id/shipping')
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
    @Body() body: SetProductShippingDto
  ): Promise<void> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    const result = await this.setProductShippingUseCase.execute(currentUser, id, body);
    resolveOrThrow(result, mapProductAppErrorToHttpException);
  }

  private async assertActorCanManageProductShop(
    currentUser: AuthenticatedUser,
    shopId: string,
    productId: string
  ): Promise<void> {
    await this.assertActorCanManageShop(currentUser, shopId);
    await this.getProductOrThrow(shopId, productId);
  }

  private async assertActorCanManageShop(
    currentUser: AuthenticatedUser,
    shopId: string
  ): Promise<void> {
    if (currentUser.roles.includes('admin')) {
      const shop = await this.shopRepository.findById(shopId);

      if (!shop) {
        throw new NotFoundException('Shop was not found');
      }

      return;
    }

    const shop = await this.shopRepository.findOwnedById(shopId, currentUser.userId);

    if (shop) {
      return;
    }

    const existingShop = await this.shopRepository.findById(shopId);

    if (!existingShop) {
      throw new NotFoundException('Shop was not found');
    }

    throw new ForbiddenException('You do not own this shop');
  }

  private async getProductOrThrow(
    shopId: string,
    productId: string
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
