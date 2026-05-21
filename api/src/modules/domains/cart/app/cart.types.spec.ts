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
            price: 20,
            salePrice: 15,
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
            variantName: 'Large',
            stock: 4,
            price: 18,
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
                unit_price: 15,
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
                  price: 20,
                  sale_price: 15,
                  stock: 9,
                  sku: undefined,
                  variant_name: undefined,
                },
              },
              {
                id: 'item-2',
                quantity: 1,
                is_selected: false,
                unit_price: 18,
                product: {
                  id: 'product-2',
                  slug: 'bowl',
                  shop: {
                    slug: 'clay-house',
                  },
                  title: 'Bowl',
                  variant_type: 'single',
                  variant_group_name: undefined,
                  variant_sub_group_name: undefined,
                  image_url: undefined,
                },
                inventory: {
                  id: 'inventory-2',
                  price: 18,
                  sale_price: undefined,
                  stock: 4,
                  sku: undefined,
                  variant_name: 'Large',
                },
              },
            ],
            total_price: 30,
            total_shipping_fee: 0,
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
              variant_name: 'Large',
            },
            quantity: 1,
          },
        ],
        total_quantity: 3,
      },
      cart_owner_type: 'user',
      requires_sign_in_for_checkout: false,
      summary: {
        subtotal_price: 30,
        total_discount: 0,
        subtotal_after_discount: 30,
        total_shipping_fee: 0,
        total_price: 30,
        total_selected_quantity: 2,
        total_quantity: 3,
      },
    });
  });

  it('falls back to price when sale price is absent', () => {
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
            price: 42,
            salePrice: undefined,
            productState: 'active',
          },
        },
      ],
    };

    const response = buildCartResponse(cart);

    expect(response.cart?.shop_groups[0]?.total_price).toBe(42);
    expect(response.summary.subtotal_price).toBe(42);
    expect(response.summary.total_price).toBe(42);
  });
});
