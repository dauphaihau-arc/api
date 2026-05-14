import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
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
import { SetProductShippingUseCase } from '~/modules/domains/product/app/use-cases/set-product-shipping/set-product-shipping.use-case';
import { SetProductVariantsUseCase } from '~/modules/domains/product/app/use-cases/set-product-variants/set-product-variants.use-case';
import { UpdateProductDetailsUseCase } from '~/modules/domains/product/app/use-cases/update-product-details/update-product-details.use-case';
import type {
  ProductDraftSummary,
  ShopProductListResult
} from '~/modules/domains/product/app/product.types';
import { CreateProductDraftFacadeDto } from '~/modules/domains/product/api/rest/dto/create-product-draft-facade.dto';
import { CreateProductDto } from '~/modules/domains/product/api/rest/dto/create-product.dto';
import { ListShopProductsQueryDto } from '~/modules/domains/product/api/rest/dto/list-shop-products.query.dto';
import { SetProductAttributesDto } from '~/modules/domains/product/api/rest/dto/set-product-attributes.dto';
import { SetProductImagesByKeysDto } from '~/modules/domains/product/api/rest/dto/set-product-images-by-keys.dto';
import { SetProductInventoryDto } from '~/modules/domains/product/api/rest/dto/set-product-inventory.dto';
import { SetProductShippingDto } from '~/modules/domains/product/api/rest/dto/set-product-shipping.dto';
import { SetProductVariantsDto } from '~/modules/domains/product/api/rest/dto/set-product-variants.dto';
import { UpdateProductDto } from '~/modules/domains/product/api/rest/dto/update-product.dto';
import { mapProductAppErrorToHttpException } from '~/modules/domains/product/api/rest/product-http-error-mapper';
import { ShopRepository } from '../../app/ports/shop.repository';

@Controller('shops/:shopId/products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
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
    private readonly setProductShippingUseCase: SetProductShippingUseCase,
    private readonly updateProductDetailsUseCase: UpdateProductDetailsUseCase
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  async products(
    @Param('shopId') shopId: string,
    @Query() query: ListShopProductsQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<ShopProductListResult> {
    await this.assertActorCanManageShop(currentUser, shopId);

    return this.listShopProductsUseCase.execute({
      shopId,
      page: query.page,
      limit: query.limit,
      state: query.state,
      categoryId: query.categoryId,
      search: query.search,
    });
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-cache')
  async product(
    @Param('shopId') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<ProductDraftSummary> {
    await this.assertActorCanManageShop(currentUser, shopId);

    const product = await this.getProductOrThrow(shopId, id);

    return product;
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  createProductDraft(
    @Param('shopId') shopId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateProductDto
  ): Promise<ProductDraftSummary> {
    const input: CreateProductDraftInput = {
      ...body,
      shopId,
    };

    return this.createProductDraftUseCase.execute(currentUser, input)
      .then((result) =>
        resolveOrThrow(result, mapProductAppErrorToHttpException)
      );
  }

  @Post('drafts')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({
    scope: 'product:create-draft-facade',
  })
  createProductDraftFacade(
    @Param('shopId') shopId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateProductDraftFacadeDto
  ): Promise<ProductDraftSummary> {
    return this.createProductDraftFacadeUseCase.execute(currentUser, {
      shopId,
      ...body,
    }).then((result) =>
      resolveOrThrow(result, mapProductAppErrorToHttpException)
    );
  }

  @Patch(':id')
  @Header('Cache-Control', 'private, no-store')
  async updateProduct(
    @Param('shopId') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: UpdateProductDto
  ): Promise<ProductDraftSummary> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    return this.updateProductDetailsUseCase.execute(currentUser, id, body)
      .then((result) =>
        resolveOrThrow(result, mapProductAppErrorToHttpException)
      );
  }

  @Post(':id/publish')
  @Header('Cache-Control', 'private, no-store')
  async publishProduct(
    @Param('shopId') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<ProductDraftSummary> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    return this.publishProductUseCase.execute(currentUser, id)
      .then((result) =>
        resolveOrThrow(result, mapProductAppErrorToHttpException)
      );
  }

  @Put(':id/images')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(FilesInterceptor('images', 10))
  async setProductImages(
    @Param('shopId') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @UploadedFiles() imageFiles: UploadedProductImageFile[] = [],
    @Body() _body: unknown
  ): Promise<ProductDraftSummary> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);
    this.validateImageFiles(imageFiles);

    return this.setProductImagesUseCase.execute(currentUser, id, {
      files: imageFiles,
    }).then((result) =>
      resolveOrThrow(result, mapProductAppErrorToHttpException)
    );
  }

  @Put(':id/images-by-keys')
  @Header('Cache-Control', 'private, no-store')
  async setProductImagesByKeys(
    @Param('shopId') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: SetProductImagesByKeysDto
  ): Promise<ProductDraftSummary> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    return this.setProductImagesByKeysUseCase.execute(currentUser, id, body)
      .then((result) =>
        resolveOrThrow(result, mapProductAppErrorToHttpException)
      );
  }

  @Put(':id/attributes')
  @Header('Cache-Control', 'private, no-store')
  async setProductAttributes(
    @Param('shopId') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: SetProductAttributesDto
  ): Promise<ProductDraftSummary> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    return this.setProductAttributesUseCase.execute(currentUser, id, body)
      .then((result) =>
        resolveOrThrow(result, mapProductAppErrorToHttpException)
      );
  }

  @Put(':id/variants')
  @Header('Cache-Control', 'private, no-store')
  async setProductVariants(
    @Param('shopId') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: SetProductVariantsDto
  ): Promise<ProductDraftSummary> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    return this.setProductVariantsUseCase.execute(currentUser, id, body)
      .then((result) =>
        resolveOrThrow(result, mapProductAppErrorToHttpException)
      );
  }

  @Put(':id/inventory')
  @Header('Cache-Control', 'private, no-store')
  async setProductInventory(
    @Param('shopId') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: SetProductInventoryDto
  ): Promise<ProductDraftSummary> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    return this.setProductInventoryUseCase.execute(currentUser, id, body)
      .then((result) =>
        resolveOrThrow(result, mapProductAppErrorToHttpException)
      );
  }

  @Put(':id/shipping')
  @Header('Cache-Control', 'private, no-store')
  async setProductShipping(
    @Param('shopId') shopId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: SetProductShippingDto
  ): Promise<ProductDraftSummary> {
    await this.assertActorCanManageProductShop(currentUser, shopId, id);

    return this.setProductShippingUseCase.execute(currentUser, id, body)
      .then((result) =>
        resolveOrThrow(result, mapProductAppErrorToHttpException)
      );
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

    if (!shop) {
      throw new NotFoundException('Shop was not found');
    }
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
