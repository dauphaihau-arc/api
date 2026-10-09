import {
  Inject,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { resolveOrThrow } from '~/platform/application/result';
import { toMinorUnits } from '~/platform/money/money';
import {
  CHECKOUT_CONFIG,
  getMaxOrderTotalMinor,
  type CheckoutConfig,
} from '~/platform/config/checkout.config';
import { OptionalJwtAuthGuard } from '~/domains/auth/api/guard/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type { PricedCartSummary } from '~/domains/order/app/order.types';
import { CartUpdatePricingService } from '../../app/services/cart-update-pricing.service';
import { CartPublicShopResolver } from '../../app/services/cart-public-shop-resolver.service';
import { AddCartItemUseCase } from '../../app/use-cases/add-cart-item/add-cart-item.use-case';
import { ApplyPromoCodeUseCase } from '../../app/use-cases/apply-promo-code/apply-promo-code.use-case';
import { GetCartUseCase } from '../../app/use-cases/get-cart/get-cart.use-case';
import { ListDiscoverablePromoCodesUseCase } from '../../app/use-cases/list-discoverable-promo-codes/list-discoverable-promo-codes.use-case';
import { MergeGuestCartUseCase } from '../../app/use-cases/merge-guest-cart/merge-guest-cart.use-case';
import { RemoveCartItemUseCase } from '../../app/use-cases/remove-cart-item/remove-cart-item.use-case';
import { UpdateCartItemUseCase } from '../../app/use-cases/update-cart-item/update-cart-item.use-case';
import type {
  CartActor,
  CartResponse,
  CartSnapshot,
} from '../../app/cart.types';
import { buildCartResponse } from './presenters/cart-response.mapper';
import { mapCartAppErrorToHttpException } from './errors/cart-http-error-mapper';
import { CartExceptionsFilter } from './errors/cart-exceptions.filter';
import { cartControllerErrorResponses } from './errors/cart-error-responses';
import {
  toCartPromoCodeListResponse,
  toCartPromoCodeApplyResponse,
} from './responses/cart-promo-code.response';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { ApplyCartPromoCodeDto } from './dto/apply-cart-promo-code.dto';
import { DeleteCartItemQueryDto } from './dto/delete-cart-item.query.dto';
import { GetCartPromoCodesQueryDto } from './dto/get-cart-promo-codes.query.dto';
import { GetCartQueryDto } from './dto/get-cart.query.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { GuestCartSessionService } from './cookies/guest-cart-session.service';

type CartRequest = Request & { user?: AuthenticatedUser | null };

@Controller('cart')
@UseFilters(CartExceptionsFilter)
@UseGuards(OptionalJwtAuthGuard)
@ApiTags('Cart')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses(cartControllerErrorResponses.controller)
export class CartController {
  constructor(
    @Inject(CHECKOUT_CONFIG)
    private readonly checkoutConfig: CheckoutConfig,
    private readonly cartUpdatePricingService: CartUpdatePricingService,
    private readonly guestCartSessionService: GuestCartSessionService,
    private readonly cartPublicShopResolver: CartPublicShopResolver,
    private readonly getCartUseCase: GetCartUseCase,
    private readonly mergeGuestCartUseCase: MergeGuestCartUseCase,
    private readonly addCartItemUseCase: AddCartItemUseCase,
    private readonly updateCartItemUseCase: UpdateCartItemUseCase,
    private readonly removeCartItemUseCase: RemoveCartItemUseCase,
    private readonly listDiscoverablePromoCodesUseCase: ListDiscoverablePromoCodesUseCase,
    private readonly applyPromoCodeUseCase: ApplyPromoCodeUseCase,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({
    summary: 'Get cart',
    description: 'Returns the current guest or user cart.',
  })
  @ApiOkResponse({
    description: 'Cart state.',
    schema: { type: 'object' },
  })
  @ApiErrorResponses(cartControllerErrorResponses.cart)
  async cart(
    @Req() request: CartRequest,
    @Query() query: GetCartQueryDto,
  ): Promise<CartResponse> {
    const actor = this.resolveReadActor(request);

    if (!actor) {
      return this.buildResponse(null, undefined, { ownerType: 'guest' });
    }

    const cart = await this.getCartUseCase.execute(actor, query.cartId);
    return this.buildResponse(cart);
  }

  @Get('promo-codes')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({
    summary: 'List eligible promo codes',
    description: 'Returns promo codes eligible for the selected shop items.',
  })
  @ApiOkResponse({
    description: 'Eligible public promo codes for the selected shop items.',
    schema: { type: 'object' },
  })
  @ApiErrorResponses(cartControllerErrorResponses.promoCodes)
  async promoCodes(
    @Req() request: CartRequest,
    @Query() query: GetCartPromoCodesQueryDto,
  ) {
    const actor = this.resolveReadActor(request);

    if (!actor) {
      return toCartPromoCodeListResponse([]);
    }

    const shopId = await this.cartPublicShopResolver.resolveShopId(query.shopId);

    const promoCodes = await this.listDiscoverablePromoCodesUseCase.execute({
      actor,
      cartId: query.cartId,
      shopId,
    });

    return toCartPromoCodeListResponse(promoCodes);
  }

  @Post('promo-codes/apply')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Apply promo code',
    description: 'Applies the selected promo code to the cart.',
  })
  @ApiOkResponse({
    description: 'Promo codes the cart holds after the selection.',
    schema: { type: 'object' },
  })
  @ApiErrorResponses(cartControllerErrorResponses.applyPromoCode)
  async applyPromoCode(
    @Req() request: CartRequest,
    @Body() body: ApplyCartPromoCodeDto,
  ) {
    const actor = this.resolveReadActor(request);

    if (!actor) {
      throw new NotFoundException({
        code: 'CART_NOT_FOUND',
        message: 'Cart not found',
      });
    }

    const shopId = await this.cartPublicShopResolver.resolveShopId(body.shopId);

    const { promoCodes, appliedPromoCodes } = await this.applyPromoCodeUseCase.execute({
      actor,
      cartId: body.cartId,
      shopId,
      code: body.code,
      promoCodes: body.promoCodes ?? [],
    });

    return toCartPromoCodeApplyResponse(promoCodes, appliedPromoCodes);
  }

  @Post('items')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Add cart item',
    description: 'Adds an inventory item to the current cart.',
  })
  @ApiOkResponse({
    description: 'Updated cart state.',
    schema: { type: 'object' },
  })
  @ApiErrorResponses(cartControllerErrorResponses.addItem)
  async addItem(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: AddCartItemDto,
  ): Promise<CartResponse> {
    const actor = this.resolveWriteActor(request, response);
    const cart = resolveOrThrow(
      await this.addCartItemUseCase.execute(actor, {
        inventoryId: body.inventoryId,
        quantity: body.quantity,
        isTemp: body.isTemp,
      }),
      mapCartAppErrorToHttpException,
    );

    return this.buildResponse(cart);
  }

  @Post('merge')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Merge carts',
    description: 'Merges the guest cart into the signed-in user’s cart.',
  })
  @ApiOkResponse({
    description: 'Merged cart state.',
    schema: { type: 'object' },
  })
  async merge(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartResponse> {
    if (!request.user?.userId) {
      return this.buildResponse(null, undefined, { ownerType: 'guest' });
    }

    const guestSessionId = this.guestCartSessionService.extractSessionId(request);

    if (!guestSessionId) {
      const cart = await this.getCartUseCase.execute({
        type: 'user',
        userId: request.user.userId,
      });

      return this.buildResponse(cart, undefined, {
        ownerType: 'user',
        requiresSignInForCheckout: false,
      });
    }

    const cart = await this.mergeGuestCartUseCase.execute(
      guestSessionId,
      request.user.userId,
    );

    this.guestCartSessionService.clearSession(response);

    return this.buildResponse(cart, undefined, {
      ownerType: 'user',
      requiresSignInForCheckout: false,
    });
  }

  @Patch('items')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Update cart item',
    description: 'Updates an item’s quantity or selection in the cart.',
  })
  @ApiOkResponse({
    description: 'Updated cart state.',
    schema: { type: 'object' },
  })
  @ApiErrorResponses(cartControllerErrorResponses.updateItem)
  async updateItem(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: UpdateCartItemDto,
  ): Promise<CartResponse> {
    const actor = this.resolveWriteActor(request, response);

    if (!body.inventoryId) {
      const cart = await this.getCartUseCase.execute(actor, body.cartId);

      const priced = cart
        ? await this.buildPricedCartSummary(actor, cart, body)
        : null;

      return this.buildResponse(
        cart,
        priced ? this.toPricedSummary(priced) : undefined,
        priced ? { shopDiscounts: this.toShopDiscounts(priced) } : undefined,
      );
    }

    const cart = resolveOrThrow(
      await this.updateCartItemUseCase.execute(actor, {
        cartId: body.cartId,
        inventoryId: body.inventoryId,
        quantity: body.quantity,
        isSelectOrder: body.isSelected,
        replaceWithInventoryId: body.replaceWithInventoryId,
      }),
      mapCartAppErrorToHttpException,
    );

    if (!cart) {
      return this.buildResponse(null, undefined, {
        ownerType: actor.type,
        requiresSignInForCheckout: false,
      });
    }

    const priced = await this.buildPricedCartSummary(actor, cart, body);

    return this.buildResponse(cart, this.toPricedSummary(priced), {
      shopDiscounts: this.toShopDiscounts(priced),
    });
  }

  @Delete('items')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Remove cart item',
    description: 'Removes an inventory item from the cart.',
  })
  @ApiOkResponse({
    description: 'Updated cart state.',
    schema: { type: 'object' },
  })
  @ApiErrorResponses(cartControllerErrorResponses.deleteItem)
  async deleteItem(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
    @Query() query: DeleteCartItemQueryDto,
  ): Promise<CartResponse> {
    const actor = this.resolveWriteActor(request, response);
    const cart = resolveOrThrow(
      await this.removeCartItemUseCase.execute(actor, query.inventoryId, query.cartId),
      mapCartAppErrorToHttpException,
    );

    return this.buildResponse(cart, undefined, {
      ownerType: actor.type,
      requiresSignInForCheckout: false,
    });
  }

  private toPricedSummary(priced: PricedCartSummary) {
    return {
      currency: priced.currency,
      subtotalPrice: priced.subtotalPrice,
      totalDiscount: priced.totalDiscount,
      subtotalAfterDiscount: priced.subtotalAfterDiscount,
      totalShippingFee: priced.totalShippingFee,
      totalPrice: priced.totalPrice,
      totalSelectedQuantity: priced.totalSelectedQuantity,
      totalQuantity: priced.totalQuantity,
    };
  }

  private toShopDiscounts(priced: PricedCartSummary) {
    return priced.shops.map((shop) => ({
      shopId: shop.shopId,
      discountMinor: toMinorUnits(shop.totalDiscount, priced.currency),
      saleDiscountMinor: toMinorUnits(shop.saleDiscount, priced.currency),
    }));
  }

  private buildResponse(
    cart: Parameters<typeof buildCartResponse>[0],
    summaryOverride?: Parameters<typeof buildCartResponse>[1],
    options?: Parameters<typeof buildCartResponse>[2],
  ): CartResponse {
    const currency = summaryOverride?.currency ??
      cart?.items[0]?.inventory.pricing.currency ??
      'USD';

    return buildCartResponse(cart, summaryOverride, {
      ...options,
      maxOrderTotalMinor: getMaxOrderTotalMinor(this.checkoutConfig, currency),
    });
  }

  private async buildPricedCartSummary(
    actor: CartActor,
    cart: CartSnapshot,
    body: UpdateCartItemDto,
  ): Promise<PricedCartSummary> {
    const additionInfoShopCarts = body.additionInfoShopCarts
      ? await this.cartPublicShopResolver.resolveShopAdjustments(body.additionInfoShopCarts)
      : undefined;

    return await this.cartUpdatePricingService.buildPricedCartSummary({
      actor,
      cart,
      additionInfoTempCart: body.additionInfoTempCart
        ? {
          promoCodes: body.additionInfoTempCart.promo_codes,
          note: body.additionInfoTempCart.note,
        }
        : undefined,
      additionInfoShopCarts,
    });
  }


  private resolveReadActor(request: CartRequest): CartActor | null {
    if (request.user?.userId) {
      return {
        type: 'user',
        userId: request.user.userId,
      };
    }

    const guestSessionId = this.guestCartSessionService.extractSessionId(request);

    if (!guestSessionId) {
      return null;
    }

    return {
      type: 'guest',
      guestSessionId,
    };
  }

  private resolveWriteActor(request: CartRequest, response: Response): CartActor {
    if (request.user?.userId) {
      return {
        type: 'user',
        userId: request.user.userId,
      };
    }

    return {
      type: 'guest',
      guestSessionId: this.guestCartSessionService.ensureSessionId(request, response),
    };
  }
}
