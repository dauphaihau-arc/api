import type {
  CreateOrderResult,
  OrderListResult
} from '../../app/order.types';

export function toCreateOrderResponse(result: CreateOrderResult) {
  return {
    checkout_session_url: result.checkoutSessionUrl,
    order_shops: result.orderShops.map((orderShop) => ({
      id: orderShop.id,
      shop: {
        id: orderShop.shopId,
        shop_name: orderShop.shopName,
        slug: orderShop.shopSlug,
      },
    })),
  };
}

export function toCheckoutSessionOrderResponse(result: CreateOrderResult) {
  return {
    order_shops: result.orderShops.map((orderShop) => ({
      shop: {
        shop_name: orderShop.shopName,
        slug: orderShop.shopSlug,
      },
    })),
  };
}

export function toOrderListResponse(result: OrderListResult) {
  return {
    order_shops: result.orderShops.map((orderShop) => ({
      id: orderShop.id,
      shop: {
        id: orderShop.shopId,
        shop_name: orderShop.shopName,
        slug: orderShop.shopSlug,
      },
      payment: {
        type: orderShop.paymentType,
      },
      products: orderShop.products.map((product) => ({
        product: {
          id: product.productId,
          slug: product.slug,
          shop: {
            slug: product.shopSlug,
          },
          variant_group_name: product.variantGroupName,
          variant_sub_group_name: product.variantSubGroupName,
          shipping: {},
        },
        inventory: {
          variant: product.variantName,
        },
        percent_coupon: product.percentCouponPercent
          ? { percent_off: product.percentCouponPercent }
          : null,
        id: product.id,
        title: product.title,
        image_url: product.imageUrl,
        quantity: product.quantity,
        price: product.price,
        sale_price: product.salePrice,
      })),
      promo_coupons: orderShop.promoCodes.map((code) => ({
        id: code,
        code,
      })),
      shipping: {
        shipping_status: orderShop.shippingStatus,
        updated_at: orderShop.shippingUpdatedAt,
        to_country: orderShop.shippingToCountry,
        from_countries: orderShop.shippingFromCountries,
        estimated_delivery: orderShop.shippingEstimatedDelivery,
      },
      subtotal: orderShop.subtotal,
      total_shipping_fee: orderShop.totalShippingFee,
      total_discount: orderShop.totalDiscount,
      total: orderShop.total,
      note: orderShop.note,
      created_at: orderShop.createdAt,
    })),
  };
}
