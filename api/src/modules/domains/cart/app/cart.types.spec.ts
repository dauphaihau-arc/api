import { buildCartResponse, type CartSnapshot } from './cart.types';

describe('buildCartResponse', () => {
  it('groups items by shop and computes summary from selected items', () => {
    const cart: CartSnapshot = {
      id: 'cart-1',
      userId: 'user-1',
      isTemp: false,
      items: [
        {
          id: 'item-1',
          quantity: 2,
          isSelectOrder: true,
          updatedAt: new Date('2026-05-14T10:00:00.000Z'),
          inventory: {
            inventoryId: 'inventory-1',
            productId: 'product-1',
            shopId: 'shop-1',
            shopName: 'Clay House',
            title: 'Mug',
            variantType: 'none',
            stock: 9,
            price: 20,
            salePrice: 15,
            productState: 'active',
            imageStorageKey: 'dev/public/mug.jpg',
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
            shopId: 'shop-1',
            shopName: 'Clay House',
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
        userId: 'user-1',
        isTemp: false,
        shopGroups: [
          {
            shop: {
              id: 'shop-1',
              name: 'Clay House',
            },
            items: [
              {
                id: 'item-1',
                quantity: 2,
                isSelected: true,
                unitPrice: 15,
                product: {
                  id: 'product-1',
                  title: 'Mug',
                  variantType: 'none',
                  variantGroupName: undefined,
                  variantSubGroupName: undefined,
                  imageUrl: 'dev/public/mug.jpg',
                },
                inventory: {
                  id: 'inventory-1',
                  price: 20,
                  salePrice: 15,
                  stock: 9,
                  sku: undefined,
                  variantName: undefined,
                },
              },
              {
                id: 'item-2',
                quantity: 1,
                isSelected: false,
                unitPrice: 18,
                product: {
                  id: 'product-2',
                  title: 'Bowl',
                  variantType: 'single',
                  variantGroupName: undefined,
                  variantSubGroupName: undefined,
                  imageUrl: undefined,
                },
                inventory: {
                  id: 'inventory-2',
                  price: 18,
                  salePrice: undefined,
                  stock: 4,
                  sku: undefined,
                  variantName: 'Large',
                },
              },
            ],
            totalPrice: 30,
            totalShippingFee: 0,
          },
        ],
        recentItems: [
          {
            itemId: 'item-1',
            product: {
              id: 'product-1',
              title: 'Mug',
              imageUrl: 'dev/public/mug.jpg',
            },
            inventory: {
              variantName: undefined,
            },
            quantity: 2,
          },
          {
            itemId: 'item-2',
            product: {
              id: 'product-2',
              title: 'Bowl',
              imageUrl: undefined,
            },
            inventory: {
              variantName: 'Large',
            },
            quantity: 1,
          },
        ],
        totalQuantity: 3,
      },
      summary: {
        subtotalPrice: 30,
        totalDiscount: 0,
        subtotalAfterDiscount: 30,
        totalShippingFee: 0,
        totalPrice: 30,
        totalSelectedQuantity: 2,
        totalQuantity: 3,
      },
    });
  });

  it('falls back to price when sale price is absent', () => {
    const cart: CartSnapshot = {
      id: 'cart-2',
      userId: 'user-2',
      isTemp: false,
      items: [
        {
          id: 'item-3',
          quantity: 1,
          isSelectOrder: true,
          updatedAt: new Date('2026-05-15T08:00:00.000Z'),
          inventory: {
            inventoryId: 'inventory-3',
            productId: 'product-3',
            shopId: 'shop-2',
            shopName: 'Reed Workshop',
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

    expect(response.cart?.shopGroups[0]?.totalPrice).toBe(42);
    expect(response.summary.subtotalPrice).toBe(42);
    expect(response.summary.totalPrice).toBe(42);
  });
});
