import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { ProductImageEntity } from '~/modules/domains/product/infra/persistence/entities/product-image.entity';
import { ProductInventoryEntity } from '~/modules/domains/product/infra/persistence/entities/product-inventory.entity';
import { ProductVariantType } from '~/modules/domains/product/domain/enums/product-variant-type.enum';
import { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { CartRepository, type DeleteOwnedCartItemInput, type UpdateOwnedCartItemInput } from '../app/ports/cart.repository';
import type {
  CartInventoryCandidate,
  CartItemSnapshot,
  CartSnapshot
} from '../app/cart.types';
import { CartEntity } from './persistence/entities/cart.entity';
import { CartItemEntity } from './persistence/entities/cart-item.entity';

@Injectable()
export class MikroOrmCartRepository implements CartRepository {
  private static readonly cartPopulate = [
    'items.shop',
    'items.product',
    'items.product.images',
    'items.productInventory',
    'items.productInventory.productVariant',
  ] as const;

  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService
  ) {}

  async findInventoryCandidateById(
    inventoryId: string
  ): Promise<CartInventoryCandidate | null> {
    const repository = this.entityManager.fork().getRepository(ProductInventoryEntity);
    const inventory = await repository.findOne(
      { id: inventoryId },
      {
        populate: ['shop', 'product', 'product.images', 'productVariant'],
      }
    );

    return inventory ? this.toInventoryCandidate(inventory) : null;
  }

  async findOwnedCartById(
    userId: string,
    cartId: string
  ): Promise<CartSnapshot | null> {
    const repository = this.entityManager.fork().getRepository(CartEntity);
    const cart = await repository.findOne(
      { id: cartId, user: userId },
      {
        populate: [...MikroOrmCartRepository.cartPopulate],
      }
    );

    return cart ? this.toCartSnapshot(cart) : null;
  }

  async findActiveCartByUserId(userId: string): Promise<CartSnapshot | null> {
    const repository = this.entityManager.fork().getRepository(CartEntity);
    const cart = await repository.findOne(
      { user: userId, isTemp: false },
      {
        populate: [...MikroOrmCartRepository.cartPopulate],
        orderBy: {
          updatedAt: 'desc',
        },
      }
    );

    return cart ? this.toCartSnapshot(cart) : null;
  }

  async addItemToActiveCart(
    userId: string,
    inventoryId: string,
    quantity: number
  ): Promise<CartSnapshot> {
    const entityManager = this.entityManager.fork();
    const cartRepository = entityManager.getRepository(CartEntity);
    const itemRepository = entityManager.getRepository(CartItemEntity);
    const inventoryRepository = entityManager.getRepository(ProductInventoryEntity);

    const inventory = await inventoryRepository.findOneOrFail(
      { id: inventoryId },
      {
        populate: ['shop', 'product'],
      }
    );

    const existingCart = await cartRepository.findOne(
      { user: userId, isTemp: false },
      {
        populate: ['items'],
      }
    );
    const cart = existingCart ?? cartRepository.create({
      user: entityManager.getReference(CurrentUserEntity, userId),
      isTemp: false,
    });

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
      }
    );

    return this.toCartSnapshot(hydratedCart);
  }

  async createTempCart(
    userId: string,
    inventoryId: string,
    quantity: number
  ): Promise<CartSnapshot> {
    const entityManager = this.entityManager.fork();
    const cartRepository = entityManager.getRepository(CartEntity);
    const itemRepository = entityManager.getRepository(CartItemEntity);
    const inventoryRepository = entityManager.getRepository(ProductInventoryEntity);
    const inventory = await inventoryRepository.findOneOrFail(
      { id: inventoryId },
      {
        populate: ['shop', 'product'],
      }
    );

    const cart = cartRepository.create({
      user: entityManager.getReference(CurrentUserEntity, userId),
      isTemp: true,
    });
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
      }
    );

    return this.toCartSnapshot(hydratedCart);
  }

  async updateOwnedCartItem(
    input: UpdateOwnedCartItemInput
  ): Promise<CartSnapshot | null> {
    const entityManager = this.entityManager.fork();
    const cartRepository = entityManager.getRepository(CartEntity);
    const itemRepository = entityManager.getRepository(CartItemEntity);

    const cart = await this.findCartForMutation(entityManager, input.userId, input.cartId);

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
          { populate: [...MikroOrmCartRepository.cartPopulate] }
        )
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
      }
    );

    return this.toCartSnapshot(hydratedCart);
  }

  async deleteOwnedCartItem(
    input: DeleteOwnedCartItemInput
  ): Promise<CartSnapshot | null> {
    const entityManager = this.entityManager.fork();
    const cartRepository = entityManager.getRepository(CartEntity);
    const itemRepository = entityManager.getRepository(CartItemEntity);
    const cart = await this.findCartForMutation(entityManager, input.userId, input.cartId);

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
          { populate: [...MikroOrmCartRepository.cartPopulate] }
        )
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
      }
    );

    return this.toCartSnapshot(hydratedCart);
  }

  private async findCartForMutation(
    entityManager: EntityManager,
    userId: string,
    cartId?: string
  ): Promise<CartEntity | null> {
    const cartRepository = entityManager.getRepository(CartEntity);

    if (cartId) {
      return cartRepository.findOne({ id: cartId, user: userId }, { populate: ['items'] });
    }

    return cartRepository.findOne({ user: userId, isTemp: false }, { populate: ['items'] });
  }

  private toCartSnapshot(cart: CartEntity): CartSnapshot {
    return {
      id: cart.id,
      userId: cart.user.id,
      isTemp: cart.isTemp,
      items: cart.items
        .getItems()
        .map((item) => this.toCartItemSnapshot(item))
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()),
    };
  }

  private toCartItemSnapshot(item: CartItemEntity): CartItemSnapshot {
    return {
      id: item.id,
      quantity: item.quantity,
      isSelectOrder: item.isSelectOrder,
      updatedAt: item.updatedAt,
      inventory: this.toInventoryCandidate(
        item.productInventory,
        item.product.images.getItems()[0],
        item.product.title,
        item.product.variantType ?? ProductVariantType.NONE,
        item.product.variantGroupName,
        item.product.variantSubGroupName,
        item.shop.shopName,
        item.product.slug,
        item.shop.slug
      ),
    };
  }

  private toInventoryCandidate(
    inventory: ProductInventoryEntity,
    image?: ProductImageEntity,
    title?: string,
    variantType?: string,
    variantGroupName?: string,
    variantSubGroupName?: string,
    shopName?: string,
    productSlug?: string,
    shopSlug?: string
  ): CartInventoryCandidate {
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
      imageUrl: image?.storageKey
        ? this.storageService.getPublicUrl(image.storageKey)
        : undefined,
      variantName: inventory.productVariant?.name,
      stock: inventory.stock,
      price: Number(inventory.price),
      salePrice: inventory.salePrice != null
        ? Number(inventory.salePrice)
        : undefined,
      sku: inventory.sku,
      productState: inventory.product.state,
    };
  }
}
