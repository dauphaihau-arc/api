import {
  Body,
  Controller,
  Delete,
  Header,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { Idempotent } from '~/platform/decorators/idempotent.decorator';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { IdempotencyKeyInterceptor } from '~/platform/interceptors/idempotency-key.interceptor';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import { AmendFulfillmentShipmentUseCase } from '../../app/use-cases/amend-fulfillment-shipment/amend-fulfillment-shipment.use-case';
import { PrepareFulfillmentShipmentUseCase } from '../../app/use-cases/prepare-fulfillment-shipment/prepare-fulfillment-shipment.use-case';
import { ReconcileOrderFulfillmentUseCase } from '../../app/use-cases/reconcile-order-fulfillment/reconcile-order-fulfillment.use-case';
import { UpdateShipmentJourneyUseCase } from '../../app/use-cases/update-shipment-journey/update-shipment-journey.use-case';
import { VoidFulfillmentShipmentUseCase } from '../../app/use-cases/void-fulfillment-shipment/void-fulfillment-shipment.use-case';
import { AmendFulfillmentShipmentDto } from './dto/amend-fulfillment-shipment.dto';
import { PrepareFulfillmentShipmentDto } from './dto/prepare-fulfillment-shipment.dto';
import { ReconcileOrderFulfillmentDto } from './dto/reconcile-order-fulfillment.dto';
import { UpdateShipmentJourneyDto } from './dto/update-shipment-journey.dto';
import {
  isFulfillmentError,
  mapFulfillmentErrorToHttpException,
} from './fulfillment-http-error-mapper';
import { toFulfillmentOrderResponse } from './fulfillment.response';
import type { FulfillmentCommandResult } from '../../app/services/fulfillment-command.runner';

@Controller('shops/:shop_id/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Order Fulfillment')
@ApiCookieAuth('accessCookie')
export class ShopOrderFulfillmentController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly prepareFulfillmentShipmentUseCase: PrepareFulfillmentShipmentUseCase,
    private readonly amendFulfillmentShipmentUseCase: AmendFulfillmentShipmentUseCase,
    private readonly voidFulfillmentShipmentUseCase: VoidFulfillmentShipmentUseCase,
    private readonly updateShipmentJourneyUseCase: UpdateShipmentJourneyUseCase,
    private readonly reconcileOrderFulfillmentUseCase: ReconcileOrderFulfillmentUseCase,
  ) {}

  @Post(':order_id/fulfillment/shipments')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'fulfillment:prepare-shipment' })
  @ApiOperation({ summary: 'Prepare a seller fulfillment shipment' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment.', schema: { type: 'object' } })
  async prepareShipment(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('order_id') orderId: string,
    @Body() body: PrepareFulfillmentShipmentDto,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      return this.respond(await this.prepareFulfillmentShipmentUseCase.execute(
        shopId,
        orderId,
        currentUser.userId,
        {
          groupId: body.groupId,
          items: body.items,
          carrier: body.carrier,
          trackingNumber: body.trackingNumber,
          note: body.shipmentNote,
        },
      ));
    }
    catch (error) {
      this.throwMappedFulfillmentError(error);
    }
  }

  @Patch(':order_id/fulfillment/shipments/:shipment_id')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'fulfillment:amend-shipment' })
  @ApiOperation({ summary: 'Amend a prepared shipment' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiParam({ name: 'shipment_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment.', schema: { type: 'object' } })
  async amendShipment(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('order_id') orderId: string,
    @Param('shipment_id') shipmentId: string,
    @Body() body: AmendFulfillmentShipmentDto,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      return this.respond(await this.amendFulfillmentShipmentUseCase.execute(
        shopId,
        orderId,
        shipmentId,
        currentUser.userId,
        {
          items: body.items,
          carrier: body.carrier,
          trackingNumber: body.trackingNumber,
          note: body.shipmentNote,
        },
      ));
    }
    catch (error) {
      this.throwMappedFulfillmentError(error);
    }
  }

  @Delete(':order_id/fulfillment/shipments/:shipment_id')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'fulfillment:void-shipment' })
  @ApiOperation({ summary: 'Void a prepared shipment' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiParam({ name: 'shipment_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment.', schema: { type: 'object' } })
  async voidShipment(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('order_id') orderId: string,
    @Param('shipment_id') shipmentId: string,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      return this.respond(await this.voidFulfillmentShipmentUseCase.execute(
        shopId,
        orderId,
        shipmentId,
        currentUser.userId,
      ));
    }
    catch (error) {
      this.throwMappedFulfillmentError(error);
    }
  }

  @Post(':order_id/fulfillment/shipments/:shipment_id/journey')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'fulfillment:update-shipment-journey' })
  @ApiOperation({ summary: 'Record a shipment journey transition' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiParam({ name: 'shipment_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment.', schema: { type: 'object' } })
  async recordShipmentJourney(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('order_id') orderId: string,
    @Param('shipment_id') shipmentId: string,
    @Body() body: UpdateShipmentJourneyDto,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      return this.respond(await this.updateShipmentJourneyUseCase.execute(
        shopId,
        orderId,
        shipmentId,
        currentUser.userId,
        {
          status: body.status,
          carrier: body.carrier,
          trackingNumber: body.trackingNumber,
          note: body.shipmentNote,
        },
      ));
    }
    catch (error) {
      this.throwMappedFulfillmentError(error);
    }
  }

  @Post(':order_id/fulfillment/reconciliation')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'fulfillment:reconcile-order' })
  @ApiOperation({ summary: 'Reconcile legacy order fulfillment quantities' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment.', schema: { type: 'object' } })
  async reconcileOrder(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('order_id') orderId: string,
    @Body() body: ReconcileOrderFulfillmentDto,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      return this.respond(await this.reconcileOrderFulfillmentUseCase.execute(
        shopId,
        orderId,
        currentUser.userId,
        { items: body.items },
      ));
    }
    catch (error) {
      this.throwMappedFulfillmentError(error);
    }
  }

  /**
   * Transport serialization of a fulfillment command result. The application
   * layer returns the authoritative view; only this controller turns it into the
   * external snake_case contract.
   */
  private respond(result: FulfillmentCommandResult) {
    return { fulfillment: toFulfillmentOrderResponse(result) };
  }

  private throwMappedFulfillmentError(error: unknown): never {
    if (isFulfillmentError(error)) {
      throw mapFulfillmentErrorToHttpException(error);
    }

    throw error;
  }
}
