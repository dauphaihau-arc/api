import {
  Body,
  Controller,
  Delete,
  Header,
  Param,
  Patch,
  Post,
  UseFilters,
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
import { Idempotent } from '~/platform/idempotency/idempotent.decorator';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { IdempotencyKeyInterceptor } from '~/platform/idempotency/idempotency-key.interceptor';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';

import { FulfillmentTargetResolver } from '../../app/services/fulfillment-target-resolver.service';
import { AmendFulfillmentShipmentUseCase } from '../../app/use-cases/amend-fulfillment-shipment/amend-fulfillment-shipment.use-case';
import { PrepareFulfillmentShipmentUseCase } from '../../app/use-cases/prepare-fulfillment-shipment/prepare-fulfillment-shipment.use-case';
import { ReconcileOrderFulfillmentUseCase } from '../../app/use-cases/reconcile-order-fulfillment/reconcile-order-fulfillment.use-case';
import { UpdateShipmentJourneyUseCase } from '../../app/use-cases/update-shipment-journey/update-shipment-journey.use-case';
import { VoidFulfillmentShipmentUseCase } from '../../app/use-cases/void-fulfillment-shipment/void-fulfillment-shipment.use-case';
import { AmendFulfillmentShipmentDto } from './dto/amend-fulfillment-shipment.dto';
import { PrepareFulfillmentShipmentDto } from './dto/prepare-fulfillment-shipment.dto';
import { ReconcileOrderFulfillmentDto } from './dto/reconcile-order-fulfillment.dto';
import { UpdateShipmentJourneyDto } from './dto/update-shipment-journey.dto';
import { FulfillmentExceptionsFilter } from './errors/fulfillment-exceptions.filter';
import { shopOrderFulfillmentControllerErrorResponses } from './errors/fulfillment-error-responses';
import { toFulfillmentOrderResponse } from './responses/fulfillment.response';
import type { FulfillmentCommandResult } from '../../app/services/fulfillment-command.runner';

@Controller('shops/:shop_id/orders')
@UseFilters(FulfillmentExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Order Fulfillment')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses(shopOrderFulfillmentControllerErrorResponses.common)
export class ShopOrderFulfillmentController {
  constructor(
    private readonly fulfillmentTargetResolver: FulfillmentTargetResolver,
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
  @ApiErrorResponses(shopOrderFulfillmentControllerErrorResponses.prepare)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment.', schema: { type: 'object' } })
  async prepareShipment(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('order_id') orderPublicId: string,
    @Body() body: PrepareFulfillmentShipmentDto,
  ) {
    const { shopId, orderId } = await this.fulfillmentTargetResolver.resolve(
      currentUser,
      shopPublicId,
      orderPublicId,
    );

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

  @Patch(':order_id/fulfillment/shipments/:shipment_id')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'fulfillment:amend-shipment' })
  @ApiOperation({ summary: 'Amend a prepared shipment' })
  @ApiErrorResponses(shopOrderFulfillmentControllerErrorResponses.amend)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiParam({ name: 'shipment_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment.', schema: { type: 'object' } })
  async amendShipment(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('order_id') orderPublicId: string,
    @Param('shipment_id') shipmentPublicId: string,
    @Body() body: AmendFulfillmentShipmentDto,
  ) {
    const { shopId, orderId, shipmentId } = await this.fulfillmentTargetResolver.resolve(
      currentUser,
      shopPublicId,
      orderPublicId,
      shipmentPublicId,
    );

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

  @Delete(':order_id/fulfillment/shipments/:shipment_id')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'fulfillment:void-shipment' })
  @ApiOperation({ summary: 'Void a prepared shipment' })
  @ApiErrorResponses(shopOrderFulfillmentControllerErrorResponses.void)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiParam({ name: 'shipment_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment.', schema: { type: 'object' } })
  async voidShipment(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('order_id') orderPublicId: string,
    @Param('shipment_id') shipmentPublicId: string,
  ) {
    const { shopId, orderId, shipmentId } = await this.fulfillmentTargetResolver.resolve(
      currentUser,
      shopPublicId,
      orderPublicId,
      shipmentPublicId,
    );

    return this.respond(await this.voidFulfillmentShipmentUseCase.execute(
      shopId,
      orderId,
      shipmentId,
      currentUser.userId,
    ));
  }

  @Post(':order_id/fulfillment/shipments/:shipment_id/journey')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'fulfillment:update-shipment-journey' })
  @ApiOperation({ summary: 'Record a shipment journey transition' })
  @ApiErrorResponses(shopOrderFulfillmentControllerErrorResponses.journey)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiParam({ name: 'shipment_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment.', schema: { type: 'object' } })
  async recordShipmentJourney(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('order_id') orderPublicId: string,
    @Param('shipment_id') shipmentPublicId: string,
    @Body() body: UpdateShipmentJourneyDto,
  ) {
    const { shopId, orderId, shipmentId } = await this.fulfillmentTargetResolver.resolve(
      currentUser,
      shopPublicId,
      orderPublicId,
      shipmentPublicId,
    );

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

  @Post(':order_id/fulfillment/reconciliation')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'fulfillment:reconcile-order' })
  @ApiOperation({ summary: 'Reconcile legacy order fulfillment quantities' })
  @ApiErrorResponses(shopOrderFulfillmentControllerErrorResponses.reconcile)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment.', schema: { type: 'object' } })
  async reconcileOrder(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('order_id') orderPublicId: string,
    @Body() body: ReconcileOrderFulfillmentDto,
  ) {
    const { shopId, orderId } = await this.fulfillmentTargetResolver.resolve(
      currentUser,
      shopPublicId,
      orderPublicId,
    );

    return this.respond(await this.reconcileOrderFulfillmentUseCase.execute(
      shopId,
      orderId,
      currentUser.userId,
      { items: body.items },
    ));
  }

  /**
   * Transport serialization of a fulfillment command result. The application
   * layer returns the authoritative view; only this controller turns it into the
   * external snake_case contract.
   */
  private respond(result: FulfillmentCommandResult) {
    return { fulfillment: toFulfillmentOrderResponse(result) };
  }
}
