import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { CART_CONFIG } from '~/platform/config/cart.config';
import type { CartConfig } from '~/platform/config/cart.config';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { ResolvedStorefrontPriceService } from '~/domains/product/app/services/resolved-storefront-price.service';
import { ProductImageEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-image.entity';
import { ProductInventoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { ProductVariantType } from '~/domains/product/domain/enums/product-variant-type.enum';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import {
  CartRepository,
  type DeleteOwnedCartItemInput,
  type UpdateOwnedCartItemInput,
} from '../app/ports/cart.repository';
import type {
  CartActor,
  CartInventoryCandidate,
  CartInventorySnapshot,
  CartItemSnapshot,
  CartSnapshot,
} from '../app/cart.types';
import { CartKind } from '../domain/enums/cart-kind.enum';
import { CartEntity } from './persistence/entities/cart.entity';
import { CartItemEntity } from './persistence/entities/cart-item.entity';

@Injectable()
export class MikroOrmCartRepository implements CartRepository {
  private static readonly cartPopulate = [
    'items.shop',
    'items.product',
    'items.product.images',
    'items.productInventory',
    'items.productInventory.prices',
    'items.productInventory.productVariant',
  ] as const;

  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
    private readonly resolvedStorefrontPriceService: ResolvedStorefrontPriceService,
    @Inject(CART_CONFIG) private readonly cartConfig: CartConfig,
  ) {}

  async findInventoryCandidateById(
    inventoryId: string,
  ): Promise<CartInventoryCandidate | null> {
    const repository = this.entityManager.fork().getRepository(ProductInventoryEntity);
    const inventory = await repository.findOne(
      { id: inventoryId },
      {
        populate: ['shop', 'product', 'product.images', 'productVariant', 'prices'],
      },
    );

    return inventory ? this.toInventoryCandidate(inventory) : null;
  }

  async findCartByIdForActor(
    actor: CartActor,
    cartId: string,
  ): Promise<CartSnapshot | null> {
    const repository = this.entityManager.fork().getRepository(CartEntity);
    const cart = await repository.findOne(
      { id: cartId, ...this.actorFilter(actor), mergedAt: null },
      {
        populate: [...MikroOrmCartRepository.cartPopulate],
      },
    );

    return cart ? this.toCartSnapshot(cart) : null;
  }

  async findActiveCart(actor: CartActor): Promise<CartSnapshot | null> {
    const repository = this.entityManager.fork().getRepository(CartEntity);
    const cart = await repository.findOne(
      { ...this.actorFilter(actor), kind: CartKind.ACTIVE, mergedAt: null },
      {
        populate: [...MikroOrmCartRepository.cartPopulate],
        orderBy: {
          updatedAt: 'desc',
        },
      },
    );

    return cart ? this.toCartSnapshot(cart) : null;
  }

  async addItemToActiveCart(
    actor: CartActor,
    inventoryId: string,
    quantity: number,
  ): Promise<CartSnapshot> {
    const entityManager = this.entityManager.fork();
    const cartRepository = entityManager.getRepository(CartEntity);
    const itemRepository = entityManager.getRepository(CartItemEntity);
    const inventoryRepository = entityManager.getRepository(ProductInventoryEntity);

    const inventory = await inventoryRepository.findOneOrFail(
      { id: inventoryId },
      {
        populate: ['shop', 'product'],
      },
    );

    const existingCart = await cartRepository.findOne(
      { ...this.actorFilter(actor), kind: CartKind.ACTIVE, mergedAt: null },
      {
        populate: ['items'],
      },
    );
    const cart = existingCart ?? cartRepository.create(
      this.createCartOwner(actor, entityManager, CartKind.ACTIVE),
    );

    if (!existingCart) {
      entityManager.persist(cart);
    }

    const existingItem = await itemRepository.findOne({
      cart: cart.id,
      productInventory: inventory.id,
    });

    if (existingItem) {
      existingItem.quantity += quantity;
      existingItem.isSelectOrder = true;
      await entityManager.persistAndFlush(existingItem);
    }
    else {
      const item = itemRepository.create({
        cart,
        shop: inventory.shop,
        product: inventory.product,
        productInventory: inventory,
        quantity,
        isSelectOrder: true,
      });
      cart.items.add(item);
      entityManager.persist(item);
      await entityManager.persistAndFlush(cart);
    }

    const hydratedCart = await cartRepository.findOneOrFail(
      { id: cart.id },
      {
        populate: [...MikroOrmCartRepository.cartPopulate],
      },
    );

    return this.toCartSnapshot(hydratedCart);
  }

  async createBuyNowCart(
    actor: CartActor,
    inventoryId: string,
    quantity: number,
  ): Promise<CartSnapshot> {
    const entityManager = this.entityManager.fork();
    const cartRepository = entityManager.getRepository(CartEntity);
    const itemRepository = entityManager.getRepository(CartItemEntity);
    const inventoryRepository = entityManager.getRepository(ProductInventoryEntity);
    const inventory = await inventoryRepository.findOneOrFail(
      { id: inventoryId },
      {
        populate: ['shop', 'product'],
      },
    );

    const cart = cartRepository.create(
      this.createCartOwner(actor, entityManager, CartKind.BUY_NOW),
    );
    const item = itemRepository.create({
      cart,
      shop: inventory.shop,
      product: inventory.product,
      productInventory: inventory,
      quantity,
      isSelectOrder: true,
    });

    cart.items.add(item);
    entityManager.persist(cart);
    entityManager.persist(item);
    await entityManager.persistAndFlush(cart);

    const hydratedCart = await cartRepository.findOneOrFail(
      { id: cart.id },
      {
        populate: [...MikroOrmCartRepository.cartPopulate],
      },
    );

    return this.toCartSnapshot(hydratedCart);
  }

  async updateCartItem(
    input: UpdateOwnedCartItemInput,
  ): Promise<CartSnapshot | null> {
    const entityManager = this.entityManager.fork();
    const cartRepository = entityManager.getRepository(CartEntity);
    const itemRepository = entityManager.getRepository(CartItemEntity);

    const cart = await this.findCartForMutation(entityManager, input.actor, input.cartId);

    if (!cart) {
      return null;
    }

    const item = await itemRepository.findOne({
      cart: cart.id,
      productInventory: input.inventoryId,
    });

    if (!item) {
      return this.toCartSnapshot(
        await cartRepository.findOneOrFail(
          { id: cart.id },
          { populate: [...MikroOrmCartRepository.cartPopulate] },
        ),
      );
    }

    if (input.quantity !== undefined) {
      if (input.quantity <= 0) {
        entityManager.remove(item);
        cart.items.remove(item);
      }
      else {
        item.quantity = input.quantity;
      }
    }

    if (input.isSelectOrder !== undefined && input.quantity !== 0) {
      item.isSelectOrder = input.isSelectOrder;
    }

    await entityManager.flush();

    if (cart.items.isInitialized() && cart.items.length === 0) {
      entityManager.remove(cart);
      await entityManager.flush();
      return null;
    }

    const remainingItems = await itemRepository.count({ cart: cart.id });

    if (remainingItems === 0) {
      entityManager.remove(cart);
      await entityManager.flush();
      return null;
    }

    const hydratedCart = await cartRepository.findOneOrFail(
      { id: cart.id },
      {
        populate: [...MikroOrmCartRepository.cartPopulate],
      },
    );

    return this.toCartSnapshot(hydratedCart);
  }

  async deleteCartItem(
    input: DeleteOwnedCartItemInput,
  ): Promise<CartSnapshot | null> {
    const entityManager = this.entityManager.fork();
    const cartRepository = entityManager.getRepository(CartEntity);
    const itemRepository = entityManager.getRepository(CartItemEntity);
    const cart = await this.findCartForMutation(entityManager, input.actor, input.cartId);

    if (!cart) {
      return null;
    }

    const item = await itemRepository.findOne({
      cart: cart.id,
      productInventory: input.inventoryId,
    });

    if (!item) {
      return this.toCartSnapshot(
        await cartRepository.findOneOrFail(
          { id: cart.id },
          { populate: [...MikroOrmCartRepository.cartPopulate] },
        ),
      );
    }

    entityManager.remove(item);
    await entityManager.flush();

    const remainingItems = await itemRepository.count({ cart: cart.id });

    if (remainingItems === 0) {
      entityManager.remove(cart);
      await entityManager.flush();
      return null;
    }

    const hydratedCart = await cartRepository.findOneOrFail(
      { id: cart.id },
      {
        populate: [...MikroOrmCartRepository.cartPopulate],
      },
    );

    return this.toCartSnapshot(hydratedCart);
  }

  async mergeGuestCartIntoUser(
    guestSessionId: string,
    userId: string,
  ): Promise<CartSnapshot | null> {
    const entityManager = this.entityManager.fork();
    const cartRepository = entityManager.getRepository(CartEntity);
    const itemRepository = entityManager.getRepository(CartItemEntity);

    const guestCart = await cartRepository.findOne(
      {
        guestSessionId,
        kind: CartKind.ACTIVE,
        mergedAt: null,
      },
      {
        populate: [...MikroOrmCartRepository.cartPopulate, 'items.shop', 'items.product'],
      },
    );

    if (!guestCart) {
      return this.findActiveCart({ type: 'user', userId });
    }

    const userCart = await cartRepository.findOne(
      {
        user: userId,
        kind: CartKind.ACTIVE,
        mergedAt: null,
      },
      {
        populate: [...MikroOrmCartRepository.cartPopulate, 'items.shop', 'items.product'],
      },
    );

    if (!userCart) {
      guestCart.user = entityManager.getReference(UserEntity, userId);
      guestCart.guestSessionId = undefined;
      guestCart.expiresAt = undefined;
      await entityManager.flush();

      const hydratedTransferredCart = await cartRepository.findOneOrFail(
        { id: guestCart.id },
        { populate: [...MikroOrmCartRepository.cartPopulate] },
      );

      return this.toCartSnapshot(hydratedTransferredCart);
    }

    for (const guestItem of guestCart.items.getItems()) {
      const existingUserItem = userCart.items
        .getItems()
        .find(item => item.productInventory.id === guestItem.productInventory.id);

      const cappedQuantity = Math.min(
        guestItem.quantity,
        guestItem.productInventory.stock,
      );

      if (cappedQuantity <= 0 || guestItem.product.state !== 'active') {
        continue;
      }

      if (existingUserItem) {
        existingUserItem.quantity = Math.min(
          existingUserItem.quantity + cappedQuantity,
          existingUserItem.productInventory.stock,
        );
        existingUserItem.isSelectOrder = existingUserItem.isSelectOrder || guestItem.isSelectOrder;
        entityManager.persist(existingUserItem);
        continue;
      }

      const item = itemRepository.create({
        cart: userCart,
        shop: guestItem.shop,
        product: guestItem.product,
        productInventory: guestItem.productInventory,
        quantity: cappedQuantity,
        isSelectOrder: guestItem.isSelectOrder,
      });
      userCart.items.add(item);
      entityManager.persist(item);
    }

    guestCart.mergedAt = new Date();
    guestCart.expiresAt = new Date();
    await entityManager.flush();

    const hydratedUserCart = await cartRepository.findOneOrFail(
      { id: userCart.id },
      { populate: [...MikroOrmCartRepository.cartPopulate] },
    );

    return this.toCartSnapshot(hydratedUserCart);
  }

  private async findCartForMutation(
    entityManager: EntityManager,
    actor: CartActor,
    cartId?: string,
  ): Promise<CartEntity | null> {
    const cartRepository = entityManager.getRepository(CartEntity);

    if (cartId) {
      return cartRepository.findOne(
        { id: cartId, ...this.actorFilter(actor), mergedAt: null },
        { populate: ['items'] },
      );
    }

    return cartRepository.findOne(
      { ...this.actorFilter(actor), kind: CartKind.ACTIVE, mergedAt: null },
      { populate: ['items'] },
    );
  }

  private async toCartSnapshot(cart: CartEntity): Promise<CartSnapshot> {
    return {
      id: cart.id,
      userId: cart.user?.id ?? null,
      guestSessionId: cart.guestSessionId ?? null,
      kind: cart.kind,
      items: (await Promise.all(
        cart.items.getItems().map((item) => this.toCartItemSnapshot(item)),
      )).sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()),
    };
  }

  private async toCartItemSnapshot(item: CartItemEntity): Promise<CartItemSnapshot> {
    return {
      id: item.id,
      quantity: item.quantity,
      isSelectOrder: item.isSelectOrder,
      updatedAt: item.updatedAt,
      inventory: await this.toInventoryCandidate(
        item.productInventory,
        item.product.images.getItems()[0],
        item.product.title,
        item.product.variantType ?? ProductVariantType.NONE,
        item.product.variantGroupName,
        item.product.variantSubGroupName,
        item.shop.shopName,
        item.product.slug,
        item.shop.slug,
      ),
    };
  }

  private async toInventoryCandidate(
    inventory: ProductInventoryEntity,
    image?: ProductImageEntity,
    title?: string,
    variantType?: string,
    variantGroupName?: string,
    variantSubGroupName?: string,
    shopName?: string,
    productSlug?: string,
    shopSlug?: string,
  ): Promise<CartInventorySnapshot> {
    const pricing = await this.resolvedStorefrontPriceService.resolveForCurrentRequest(inventory);

    if (!pricing) {
      throw new InternalServerErrorException(
        `Cart inventory ${inventory.id} is missing resolved pricing`,
      );
    }

    return {
      inventoryId: inventory.id,
      productId: inventory.product.id,
      productSlug: productSlug ?? inventory.product.slug,
      shopId: inventory.shop.id,
      shopName: shopName ?? inventory.shop.shopName,
      shopSlug: shopSlug ?? inventory.shop.slug,
      title: title ?? inventory.product.title,
      variantType: variantType ?? inventory.product.variantType ?? ProductVariantType.NONE,
      variantGroupName: variantGroupName ?? inventory.product.variantGroupName,
      variantSubGroupName: variantSubGroupName ?? inventory.product.variantSubGroupName,
      imageUrl: image ? this.storageService.getPublicUrl(image.storageKey) : undefined,
      variantName: inventory.productVariant?.name,
      stock: inventory.stock,
      currency: pricing.currency,
      pricing: {
        amountMinor: pricing.amountMinor,
        currency: pricing.currency,
        sourceCurrency: pricing.sourceCurrency,
        sourceUnitAmountMinor: pricing.sourceUnitAmountMinor,
        sourcePriceId: pricing.sourcePriceId,
        sourceType: pricing.sourceType,
        marketCode: pricing.marketCode,
        fxRate: pricing.fxRate,
        fxSource: pricing.fxSource,
        fxEffectiveAt: pricing.fxEffectiveAt,
        fxSourceTimestamp: pricing.fxSourceTimestamp,
      },
      sku: inventory.sku,
      productState: inventory.product.state,
    };
  }

  private actorFilter(actor: CartActor) {
    if (actor.type === 'user') {
      return { user: actor.userId };
    }

    return { guestSessionId: actor.guestSessionId };
  }

  private createCartOwner(
    actor: CartActor,
    entityManager: EntityManager,
    kind: CartKind,
  ) {
    if (actor.type === 'user') {
      return {
        user: entityManager.getReference(UserEntity, actor.userId),
        kind,
      };
    }

    return {
      guestSessionId: actor.guestSessionId,
      kind,
      expiresAt: new Date(Date.now() + this.cartConfig.guestCartSessionTtlMs),
    };
  }
}
