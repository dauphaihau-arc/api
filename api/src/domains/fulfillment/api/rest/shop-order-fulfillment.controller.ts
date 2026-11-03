import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiCookieAuth,
  ApiProduces,
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
import { DeclareFulfillmentHandoverUseCase } from '../../app/use-cases/declare-fulfillment-handover/declare-fulfillment-handover.use-case';
import { DownloadShipmentLabelUseCase } from '../../app/use-cases/download-shipment-label/download-shipment-label.use-case';
import { PrepareFulfillmentShipmentUseCase } from '../../app/use-cases/prepare-fulfillment-shipment/prepare-fulfillment-shipment.use-case';
import { PurchaseFulfillmentLabelUseCase } from '../../app/use-cases/purchase-fulfillment-label/purchase-fulfillment-label.use-case';
import { QuoteShipmentRatesUseCase } from '../../app/use-cases/quote-shipment-rates/quote-shipment-rates.use-case';
import { ReconcileOrderFulfillmentUseCase } from '../../app/use-cases/reconcile-order-fulfillment/reconcile-order-fulfillment.use-case';
import { RefundShipmentLabelUseCase } from '../../app/use-cases/refund-shipment-label/refund-shipment-label.use-case';
import { VoidFulfillmentShipmentUseCase } from '../../app/use-cases/void-fulfillment-shipment/void-fulfillment-shipment.use-case';
import { AmendFulfillmentShipmentDto } from './dto/amend-fulfillment-shipment.dto';
import { PrepareFulfillmentShipmentDto } from './dto/prepare-fulfillment-shipment.dto';
import { PurchaseFulfillmentLabelDto } from './dto/purchase-fulfillment-label.dto';
import { QuoteShipmentRatesDto } from './dto/quote-shipment-rates.dto';
import { ReconcileOrderFulfillmentDto } from './dto/reconcile-order-fulfillment.dto';
import { FulfillmentExceptionsFilter } from './errors/fulfillment-exceptions.filter';
import { shopOrderFulfillmentControllerErrorResponses } from './errors/fulfillment-error-responses';
import {
  ShopOrderFulfillmentResponseDto,
  toFulfillmentOrderResponse,
} from './responses/fulfillment.response';
import { ShipmentRatesResponseDto, toShipmentRatesResponse } from './responses/shipment-rates.response';
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
    private readonly purchaseFulfillmentLabelUseCase: PurchaseFulfillmentLabelUseCase,
    private readonly downloadShipmentLabelUseCase: DownloadShipmentLabelUseCase,
    private readonly amendFulfillmentShipmentUseCase: AmendFulfillmentShipmentUseCase,
    private readonly voidFulfillmentShipmentUseCase: VoidFulfillmentShipmentUseCase,
    private readonly refundShipmentLabelUseCase: RefundShipmentLabelUseCase,
    private readonly declareFulfillmentHandoverUseCase: DeclareFulfillmentHandoverUseCase,
    private readonly reconcileOrderFulfillmentUseCase: ReconcileOrderFulfillmentUseCase,
    private readonly quoteShipmentRatesUseCase: QuoteShipmentRatesUseCase,
  ) {}

  @Post(':order_id/fulfillment/shipments')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'fulfillment:prepare-shipment' })
  @ApiOperation({
    summary: 'Prepare shipment',
    description: 'Prepares a fulfillment shipment for the specified shop order.',
  })
  @ApiErrorResponses(shopOrderFulfillmentControllerErrorResponses.prepare)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment.', type: ShopOrderFulfillmentResponseDto })
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

  @Post(':order_id/fulfillment/shipments/label')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'fulfillment:purchase-label' })
  @ApiOperation({
    summary: 'Purchase shipment label',
    description: 'Buys the carrier label for a quoted rate and prepares the shipment it belongs to. The shipment is not dispatched.',
  })
  @ApiErrorResponses(shopOrderFulfillmentControllerErrorResponses.purchaseLabel)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment, including the purchased label.', type: ShopOrderFulfillmentResponseDto })
  async purchaseShipmentLabel(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('order_id') orderPublicId: string,
    @Body() body: PurchaseFulfillmentLabelDto,
  ) {
    const { shopId, orderId } = await this.fulfillmentTargetResolver.resolve(
      currentUser,
      shopPublicId,
      orderPublicId,
    );

    return this.respond(await this.purchaseFulfillmentLabelUseCase.execute(
      shopId,
      orderId,
      currentUser.userId,
      {
        quoteId: body.quoteId,
        groupId: body.groupId,
        items: body.items,
      },
    ));
  }

  @Get(':order_id/fulfillment/shipments/:shipment_id/label.pdf')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Download shipment label PDF',
    description: 'Streams the carrier PDF bought for the shipment.',
  })
  @ApiErrorResponses(shopOrderFulfillmentControllerErrorResponses.downloadLabel)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiParam({ name: 'shipment_id', type: String })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'Stored carrier label PDF.',
    schema: { type: 'string', format: 'binary' },
  })
  async downloadShipmentLabel(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('order_id') orderPublicId: string,
    @Param('shipment_id') shipmentPublicId: string,
    @Res() response: Response,
  ) {
    const { shopId, orderId, shipmentId } = await this.fulfillmentTargetResolver.resolve(
      currentUser,
      shopPublicId,
      orderPublicId,
      shipmentPublicId,
    );

    const label = await this.downloadShipmentLabelUseCase.execute(
      shopId,
      orderId,
      shipmentId,
    );

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${label.filename}"`);
    response.send(label.body);
  }

  @Patch(':order_id/fulfillment/shipments/:shipment_id')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'fulfillment:amend-shipment' })
  @ApiOperation({
    summary: 'Amend shipment',
    description: 'Updates the items or shipping details of a prepared shipment.',
  })
  @ApiErrorResponses(shopOrderFulfillmentControllerErrorResponses.amend)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiParam({ name: 'shipment_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment.', type: ShopOrderFulfillmentResponseDto })
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
  @ApiOperation({
    summary: 'Void shipment',
    description: 'Voids the specified prepared shipment.',
  })
  @ApiErrorResponses(shopOrderFulfillmentControllerErrorResponses.void)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiParam({ name: 'shipment_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment.', type: ShopOrderFulfillmentResponseDto })
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

  @Delete(':order_id/fulfillment/shipments/:shipment_id/label')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'fulfillment:refund-label' })
  @ApiOperation({
    summary: 'Refund shipment label',
    description: 'Refunds the purchased carrier label, voids its shipment, and releases its quantities while the parcel has not been scanned.',
  })
  @ApiErrorResponses(shopOrderFulfillmentControllerErrorResponses.refundLabel)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiParam({ name: 'shipment_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment.', type: ShopOrderFulfillmentResponseDto })
  async refundShipmentLabel(
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

    return this.respond(await this.refundShipmentLabelUseCase.execute(
      shopId,
      orderId,
      shipmentId,
      currentUser.userId,
    ));
  }

  @Post(':order_id/fulfillment/shipments/:shipment_id/handover')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'fulfillment:declare-handover' })
  @ApiOperation({
    summary: 'Declare shipment handover',
    description: 'Records that the prepared shipment was handed to its carrier.',
  })
  @ApiErrorResponses(shopOrderFulfillmentControllerErrorResponses.handover)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiParam({ name: 'shipment_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment.', type: ShopOrderFulfillmentResponseDto })
  async declareShipmentHandover(
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

    return this.respond(await this.declareFulfillmentHandoverUseCase.execute(
      shopId,
      orderId,
      shipmentId,
      currentUser.userId,
    ));
  }

  @Post(':order_id/fulfillment/shipment-rates')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Quote shipment rates',
    description: 'Prices carrier options for a package in the shop Settlement Currency. Quoting creates no shipment or label.',
  })
  @ApiErrorResponses(shopOrderFulfillmentControllerErrorResponses.quoteRates)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({ description: 'Carrier rate options for the package.', type: ShipmentRatesResponseDto })
  async quoteShipmentRates(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('order_id') orderPublicId: string,
    @Body() body: QuoteShipmentRatesDto,
  ) {
    const { shopId } = await this.fulfillmentTargetResolver.resolve(
      currentUser,
      shopPublicId,
      orderPublicId,
    );

    const result = await this.quoteShipmentRatesUseCase.execute(shopId, {
      weightGrams: body.weightGrams,
      lengthCm: body.lengthCm,
      widthCm: body.widthCm,
      heightCm: body.heightCm,
    });

    return toShipmentRatesResponse(result);
  }

  @Post(':order_id/fulfillment/reconciliation')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'fulfillment:reconcile-order' })
  @ApiOperation({
    summary: 'Reconcile fulfillment',
    description: 'Reconciles fulfillment quantities for a legacy order.',
  })
  @ApiErrorResponses(shopOrderFulfillmentControllerErrorResponses.reconcile)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({ description: 'Updated order fulfillment.', type: ShopOrderFulfillmentResponseDto })
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
