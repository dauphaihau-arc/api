import { buildCartResponse, type CartSnapshot } from './cart.types';
import { CartKind } from '../domain/enums/cart-kind.enum';

describe('buildCartResponse', () => {
  it('groups items by shop and computes summary from selected items', () => {
    const cart: CartSnapshot = {
      id: 'cart-1',
      userId: 'user-1',
      guestSessionId: null,
      kind: CartKind.ACTIVE,
      items: [
        {
          id: 'item-1',
          quantity: 2,
          isSelectOrder: true,
          updatedAt: new Date('2026-05-14T10:00:00.000Z'),
          inventory: {
            inventoryId: 'inventory-1',
            productId: 'product-1',
            productSlug: 'mug',
            shopId: 'shop-1',
            shopName: 'Clay House',
            shopSlug: 'clay-house',
            title: 'Mug',
            variantType: 'none',
            stock: 9,
            currency: 'USD',
            pricing: {
              amountMinor: 1500,
              originalAmountMinor: 2000,
              currency: 'USD',
              sourceCurrency: 'USD',
              sourceUnitAmountMinor: 1500,
            },
            productState: 'active',
            imageUrl: 'https://cdn.example.com/dev/public/mug.jpg',
          },
        },
        {
          id: 'item-2',
          quantity: 1,
          isSelectOrder: false,
          updatedAt: new Date('2026-05-14T09:00:00.000Z'),
          inventory: {
            inventoryId: 'inventory-2',
            productId: 'product-2',
            productSlug: 'bowl',
            shopId: 'shop-1',
            shopName: 'Clay House',
            shopSlug: 'clay-house',
            title: 'Bowl',
            variantType: 'single',
            variantGroupName: 'Size',
            variantName: 'Large',
            stock: 4,
            currency: 'USD',
            pricing: {
              amountMinor: 1800,
              currency: 'USD',
              sourceCurrency: 'USD',
              sourceUnitAmountMinor: 1800,
            },
            productState: 'active',
          },
        },
      ],
    };

    expect(buildCartResponse(cart)).toEqual({
      cart: {
        id: 'cart-1',
        user_id: 'user-1',
        is_temp: false,
        shop_groups: [
          {
            shop: {
              id: 'shop-1',
              name: 'Clay House',
            },
            items: [
              {
                id: 'item-1',
                quantity: 2,
                is_selected: true,
                unit_price_minor: 1500,
                product: {
                  id: 'product-1',
                  slug: 'mug',
                  shop: {
                    slug: 'clay-house',
                  },
                  title: 'Mug',
                  variant_type: 'none',
                  variant_group_name: undefined,
                  variant_sub_group_name: undefined,
                  image_url: 'https://cdn.example.com/dev/public/mug.jpg',
                },
                inventory: {
                  id: 'inventory-1',
                  amount_minor: 1500,
                  original_amount_minor: 2000,
                  currency: 'USD',
                  stock: 9,
                  sku: undefined,
                  variant_name: undefined,
                },
              },
              {
                id: 'item-2',
                quantity: 1,
                is_selected: false,
                unit_price_minor: 1800,
                product: {
                  id: 'product-2',
                  slug: 'bowl',
                  shop: {
                    slug: 'clay-house',
                  },
                  title: 'Bowl',
                  variant_type: 'single',
                  variant_group_name: 'Size',
                  variant_sub_group_name: undefined,
                  image_url: undefined,
                },
                inventory: {
                  id: 'inventory-2',
                  amount_minor: 1800,
                  currency: 'USD',
                  stock: 4,
                  sku: undefined,
                  variant_name: 'Size: Large',
                },
              },
            ],
            currency: 'USD',
            total_minor: 3000,
            shipping_minor: 0,
          },
        ],
        recent_items: [
          {
            item_id: 'item-1',
            product: {
              id: 'product-1',
              slug: 'mug',
              shop: {
                slug: 'clay-house',
              },
              title: 'Mug',
              image_url: 'https://cdn.example.com/dev/public/mug.jpg',
            },
            inventory: {
              variant_name: undefined,
            },
            quantity: 2,
          },
          {
            item_id: 'item-2',
            product: {
              id: 'product-2',
              slug: 'bowl',
              shop: {
                slug: 'clay-house',
              },
              title: 'Bowl',
              image_url: undefined,
            },
            inventory: {
              variant_name: 'Size: Large',
            },
            quantity: 1,
          },
        ],
        total_quantity: 3,
      },
      cart_owner_type: 'user',
      requires_sign_in_for_checkout: false,
      summary: {
        currency: 'USD',
        subtotal_minor: 3000,
        discount_minor: 0,
        subtotal_after_discount_minor: 3000,
        shipping_minor: 0,
        total_minor: 3000,
        total_selected_quantity: 2,
        total_quantity: 3,
      },
    });
  });

  it('uses base-native resolved pricing when compare-at pricing is absent', () => {
    const cart: CartSnapshot = {
      id: 'cart-2',
      userId: 'user-2',
      guestSessionId: null,
      kind: CartKind.ACTIVE,
      items: [
        {
          id: 'item-3',
          quantity: 1,
          isSelectOrder: true,
          updatedAt: new Date('2026-05-15T08:00:00.000Z'),
          inventory: {
            inventoryId: 'inventory-3',
            productId: 'product-3',
            productSlug: 'studio-pullover-hoodie',
            shopId: 'shop-2',
            shopName: 'Reed Workshop',
            shopSlug: 'reed-workshop',
            title: 'Studio Pullover Hoodie',
            variantType: 'single',
            stock: 2,
            currency: 'USD',
            pricing: {
              amountMinor: 4200,
              currency: 'USD',
              sourceCurrency: 'USD',
              sourceUnitAmountMinor: 4200,
            },
            productState: 'active',
          },
        },
      ],
    };

    const response = buildCartResponse(cart);

    expect(response.cart?.shop_groups[0]?.total_minor).toBe(4200);
    expect(response.summary.subtotal_minor).toBe(4200);
    expect(response.summary.total_minor).toBe(4200);
  });

  it('uses resolved pricing metadata as the authoritative cart money source', () => {
    const cart: CartSnapshot = {
      id: 'cart-3',
      userId: 'user-3',
      guestSessionId: null,
      kind: CartKind.ACTIVE,
      items: [
        {
          id: 'item-4',
          quantity: 3,
          isSelectOrder: true,
          updatedAt: new Date('2026-05-15T09:00:00.000Z'),
          inventory: {
            inventoryId: 'inventory-4',
            productId: 'product-4',
            productSlug: 'travel-mug',
            shopId: 'shop-3',
            shopName: 'North Studio',
            shopSlug: 'north-studio',
            title: 'Travel Mug',
            variantType: 'single',
            stock: 7,
            currency: 'USD',
            pricing: {
              amountMinor: 1250,
              originalAmountMinor: 1500,
              currency: 'USD',
              sourceCurrency: 'USD',
              sourceUnitAmountMinor: 1000,
              sourceType: 'base_fx',
            },
            productState: 'active',
          },
        },
      ],
    };

    const response = buildCartResponse(cart);

    expect(response.cart?.shop_groups[0]?.items[0]?.unit_price_minor).toBe(1250);
    expect(response.cart?.shop_groups[0]?.items[0]?.inventory.amount_minor).toBe(1250);
    expect(response.cart?.shop_groups[0]?.items[0]?.inventory.original_amount_minor).toBe(1500);
    expect(response.cart?.shop_groups[0]?.total_minor).toBe(3750);
    expect(response.summary.subtotal_minor).toBe(3750);
    expect(response.summary.total_minor).toBe(3750);
  });

  it('formats multi-attribute variant names with their attribute titles', () => {
    const cart: CartSnapshot = {
      id: 'cart-4',
      userId: 'user-4',
      guestSessionId: null,
      kind: CartKind.ACTIVE,
      items: [
        {
          id: 'item-5',
          quantity: 1,
          isSelectOrder: true,
          updatedAt: new Date('2026-05-15T10:00:00.000Z'),
          inventory: {
            inventoryId: 'inventory-5',
            productId: 'product-5',
            productSlug: 'linen-shirt',
            shopId: 'shop-4',
            shopName: 'South Studio',
            shopSlug: 'south-studio',
            title: 'Linen Shirt',
            variantType: 'double',
            variantGroupName: 'Color',
            variantSubGroupName: 'Size',
            variantName: 'Blue / Large',
            stock: 5,
            currency: 'USD',
            pricing: {
              amountMinor: 2500,
              currency: 'USD',
              sourceCurrency: 'USD',
              sourceUnitAmountMinor: 2500,
            },
            productState: 'active',
          },
        },
      ],
    };

    const response = buildCartResponse(cart);

    expect(response.cart?.shop_groups[0]?.items[0]?.inventory.variant_name).toBe(
      'Color: Blue / Size: Large',
    );
    expect(response.cart?.recent_items[0]?.inventory.variant_name).toBe(
      'Color: Blue / Size: Large',
    );
  });

  it('uses card images for cart rows and thumbnails for recent items', () => {
    const cart: CartSnapshot = {
      id: 'cart-5',
      userId: 'user-5',
      guestSessionId: null,
      kind: CartKind.ACTIVE,
      items: [
        {
          id: 'item-6',
          quantity: 1,
          isSelectOrder: true,
          updatedAt: new Date('2026-05-15T11:00:00.000Z'),
          inventory: {
            inventoryId: 'inventory-6',
            productId: 'product-6',
            productSlug: 'canvas-tote',
            shopId: 'shop-5',
            shopName: 'West Studio',
            shopSlug: 'west-studio',
            title: 'Canvas Tote',
            variantType: 'none',
            stock: 3,
            currency: 'USD',
            pricing: {
              amountMinor: 3200,
              currency: 'USD',
              sourceCurrency: 'USD',
              sourceUnitAmountMinor: 3200,
            },
            productState: 'active',
            imageUrl: 'https://cdn.example.com/products/canvas-tote/card_1x1.webp',
            thumbnailImageUrl: 'https://cdn.example.com/products/canvas-tote/thumb_1x1.webp',
          },
        },
      ],
    };

    const response = buildCartResponse(cart);

    expect(response.cart?.shop_groups[0]?.items[0]?.product.image_url).toBe(
      'https://cdn.example.com/products/canvas-tote/card_1x1.webp',
    );
    expect(response.cart?.recent_items[0]?.product.image_url).toBe(
      'https://cdn.example.com/products/canvas-tote/thumb_1x1.webp',
    );
  });
});
