import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { OrderPublicIdLookup } from '~/domains/order/app/services/order-public-id-lookup.service';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import { ShipmentPublicIdLookup } from './shipment-public-id-lookup.service';

/**
 * Resolves the internal identifiers a shop-scoped fulfillment command targets.
 * Authorization runs first; the order and shipment public-id lookups already
 * throw `NotFoundException` when unresolved, so this resolver adds no guards.
 */
@Injectable()
export class FulfillmentTargetResolver {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly orderPublicIdLookup: OrderPublicIdLookup,
    private readonly shipmentPublicIdLookup: ShipmentPublicIdLookup,
  ) {}

  resolve(
    actor: AuthenticatedUser,
    shopPublicId: string,
    orderPublicId: string,
  ): Promise<{ shopId: string; orderId: string }>;

  resolve(
    actor: AuthenticatedUser,
    shopPublicId: string,
    orderPublicId: string,
    shipmentPublicId: string,
  ): Promise<{ shopId: string; orderId: string; shipmentId: string }>;

  async resolve(
    actor: AuthenticatedUser,
    shopPublicId: string,
    orderPublicId: string,
    shipmentPublicId?: string,
  ): Promise<{ shopId: string; orderId: string; shipmentId?: string }> {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(actor, shopPublicId)).id;
    const orderId = await this.orderPublicIdLookup.resolveOrderPublicId(orderPublicId);
    const shipmentId = shipmentPublicId
      ? await this.shipmentPublicIdLookup.resolveShipmentPublicId(shipmentPublicId)
      : undefined;

    return { shopId, orderId, shipmentId };
  }
}
