import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import type { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import type { CategoryRepository } from '~/domains/category/app/ports/category.repository';
import type { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import type { ProductCommandRepository } from '../../ports/product-command.repository';
import type { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';
import { UpdateProductDetailsUseCase } from './update-product-details.use-case';

describe('UpdateProductDetailsUseCase', () => {
  const actor: AuthenticatedUser = {
    userId: 'shop-owner-1',
    email: 'owner@example.com',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: [],
    permissions: [],
  };

  const product: ProductDraftSummary = {
    id: 'product-1',
    shopId: 'shop-1',
    categoryId: 'category-1',
    title: 'Handmade Mug',
    slug: 'handmade-mug',
    description: 'Wheel-thrown ceramic mug',
    state: 'draft' as ProductDraftSummary['state'],
    whoMade: 'i_did' as ProductDraftSummary['whoMade'],
    isDigital: false,
    nonTaxable: false,
    variantType: ProductVariantType.SINGLE,
    variantGroupName: 'Color',
    images: [],
    attributes: [],
    variants: [],
    inventory: [],
  };

  function buildDeps(currentProduct = product) {
    const productRepository = {
      findById: jest.fn().mockResolvedValue(currentProduct),
      updateDetails: jest.fn().mockImplementation(async (input) => ({
        ...currentProduct,
        title: input.title,
        slug: input.slug,
        description: input.description,
        whoMade: input.whoMade,
        isDigital: input.isDigital,
        nonTaxable: input.nonTaxable,
        variantGroupName: input.variantGroupName,
        variantSubGroupName: input.variantSubGroupName,
        categoryId: input.categoryId,
      })),
      findByShopIdAndSlug: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<
      SellerProductQueryRepository & ProductCommandRepository
    >;

    const shopRepository: jest.Mocked<ShopRepository> = {
      create: jest.fn(),
      findById: jest.fn(),
      findByOwnerUserId: jest.fn(),
      findByShopName: jest.fn(),
      findBySlug: jest.fn(),
      findOwnedById: jest.fn().mockResolvedValue({
        id: 'shop-1',
        ownerUserId: actor.userId,
        shopName: 'owner-shop',
        slug: 'owner-shop',
        status: 'active',
      }),
    };

    const categoryRepository: jest.Mocked<CategoryRepository> = {
      create: jest.fn(),
      createAttribute: jest.fn(),
      findAllByParentId: jest.fn(),
      findById: jest.fn().mockResolvedValue({
        id: 'category-1',
        name: 'Sneakers',
        attributes: [],
      }),
    } as unknown as jest.Mocked<CategoryRepository>;

    return {
      productRepository,
      categoryRepository,
      shopRepository,
      auditLogService: {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<AuditLogService>,
    };
  }

  it('updates base fields and regenerates the slug from title', async () => {
    const {
      productRepository, shopRepository, categoryRepository, auditLogService,
    } = buildDeps();
    const useCase = new UpdateProductDetailsUseCase(
      productRepository,
      productRepository,
      shopRepository,
      categoryRepository,
      auditLogService,
    );

    const result = await useCase.execute(actor, product.id, {
      title: '  Better Mug  ',
      description: '  Better description  ',
      isDigital: true,
      nonTaxable: true,
      variantGroupName: 'Finish',
    });

    expect(result.isOk).toBe(true);
    expect(productRepository.findByShopIdAndSlug).toHaveBeenCalledWith(
      product.shopId,
      'better-mug',
    );
    expect(productRepository.updateDetails).toHaveBeenCalledWith({
      productId: product.id,
      title: 'Better Mug',
      slug: 'better-mug',
      description: 'Better description',
      whoMade: product.whoMade,
      isDigital: true,
      nonTaxable: true,
      variantGroupName: 'Finish',
      variantSubGroupName: undefined,
      categoryId: product.categoryId,
    });
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product.details.updated',
        entityId: product.id,
      }),
    );
  });

  it('updates the product category', async () => {
    const {
      productRepository, shopRepository, categoryRepository, auditLogService,
    } = buildDeps();
    const useCase = new UpdateProductDetailsUseCase(
      productRepository,
      productRepository,
      shopRepository,
      categoryRepository,
      auditLogService,
    );

    const result = await useCase.execute(actor, product.id, {
      categoryId: 'category-2',
    });

    expect(result.isOk).toBe(true);
    expect(categoryRepository.findById).toHaveBeenCalledWith('category-2');
    expect(productRepository.updateDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: product.id,
        categoryId: 'category-2',
      }),
    );
  });

  it('rejects variant labels for products without variants', async () => {
    const {
      productRepository, shopRepository, categoryRepository, auditLogService,
    } = buildDeps({
      ...product,
      variantType: ProductVariantType.NONE,
      variantGroupName: undefined,
    });
    const useCase = new UpdateProductDetailsUseCase(
      productRepository,
      productRepository,
      shopRepository,
      categoryRepository,
      auditLogService,
    );

    const result = await useCase.execute(actor, product.id, {
      variantGroupName: 'Color',
    });

    expect(result.isOk).toBe(false);
    expect(productRepository.updateDetails).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });
});
