import type { EntityManager } from '@mikro-orm/postgresql';

export type OrderFulfillmentItemContext = {
  orderItemId: string;
  quantity: number;
};

export type OrderLegacyShippingEvidence = {
  status: string;
  updatedAt: Date;
  toCountry: string;
  fromCountries: string[];
  /** The accepted seller estimate's latest delivery date, when the Order has one. */
  estimatedDelivery?: Date;
  trackingNumber?: string;
  carrier?: string;
  note?: string;
  shippedAt?: Date;
  deliveredAt?: Date;
};

export type OrderFulfillmentContext = {
  id: string;
  orderNumber: string;
  shopId: string;
  status: string;
  customerUserId?: string;
  fulfillmentStatus: string;
  originCountries: string[];
  items: OrderFulfillmentItemContext[];
  legacyShipping: OrderLegacyShippingEvidence;
};

export abstract class OrderFulfillmentContextPort {
  /**
   * Loads the shop-scoped Order snapshot. Pass the transaction's EntityManager
   * with `lock: true` to serialize against commercial state changes: fulfillment
   * commands lock the Order row before their group rows, and cancellation locks
   * the same Order row so a cancellation cannot race a preparation.
   */
  abstract findForFulfillment(
    shopId: string,
    orderIdentifier: string,
    options?: {
      entityManager?: EntityManager;
      lock?: boolean;
    },
  ): Promise<OrderFulfillmentContext | null>;
}
