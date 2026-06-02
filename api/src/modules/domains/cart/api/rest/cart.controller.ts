import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { resolveOrThrow } from '~/common/application/result';
import { OptionalJwtAuthGuard } from '~/modules/domains/auth/api/guard/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CouponPricingService } from '~/modules/domains/coupon/app/coupon-pricing.service';
import { AddCartItemUseCase } from '../../app/use-cases/add-cart-item/add-cart-item.use-case';
import { GetCartUseCase } from '../../app/use-cases/get-cart/get-cart.use-case';
import { MergeGuestCartUseCase } from '../../app/use-cases/merge-guest-cart/merge-guest-cart.use-case';
import { RemoveCartItemUseCase } from '../../app/use-cases/remove-cart-item/remove-cart-item.use-case';
import { UpdateCartItemUseCase } from '../../app/use-cases/update-cart-item/update-cart-item.use-case';
import {
  buildCartResponse,
  type CartActor,
  type CartResponse,
} from '../../app/cart.types';
import { mapCartAppErrorToHttpException } from './cart-http-error-mapper';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { DeleteCartItemQueryDto } from './dto/delete-cart-item.query.dto';
import { GetCartQueryDto } from './dto/get-cart.query.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { GuestCartSessionService } from './guest-cart-session.service';

type CartRequest = Request & { user?: AuthenticatedUser | null };

@Controller('cart')
@UseGuards(OptionalJwtAuthGuard)
@ApiTags('Cart')
@ApiCookieAuth('accessCookie')
export class CartController {
  constructor(
    private readonly couponPricingService: CouponPricingService,
    private readonly guestCartSessionService: GuestCartSessionService,
    private readonly getCartUseCase: GetCartUseCase,
    private readonly mergeGuestCartUseCase: MergeGuestCartUseCase,
    private readonly addCartItemUseCase: AddCartItemUseCase,
    private readonly updateCartItemUseCase: UpdateCartItemUseCase,
    private readonly removeCartItemUseCase: RemoveCartItemUseCase
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get the current cart' })
  @ApiOkResponse({
    description: 'Cart state.',
    schema: { type: 'object' },
  })
  async cart(
    @Req() request: CartRequest,
    @Query() query: GetCartQueryDto
  ): Promise<CartResponse> {
    const actor = this.resolveReadActor(request);

    if (!actor) {
      return buildCartResponse(null, undefined, { ownerType: 'guest' });
    }

    const cart = await this.getCartUseCase.execute(actor, query.cartId);
    return buildCartResponse(cart);
  }

  @Post('items')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Add an item to the current cart' })
  @ApiOkResponse({
    description: 'Updated cart state.',
    schema: { type: 'object' },
  })
  async addItem(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: AddCartItemDto
  ): Promise<CartResponse> {
    const actor = this.resolveWriteActor(request, response);
    const cart = resolveOrThrow(
      await this.addCartItemUseCase.execute(actor, {
        inventoryId: body.inventoryId,
        quantity: body.quantity,
        isTemp: body.isTemp,
      }),
      mapCartAppErrorToHttpException
    );

    return buildCartResponse(cart);
  }

  @Post('merge')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Merge a guest cart into the signed-in user cart' })
  @ApiOkResponse({
    description: 'Merged cart state.',
    schema: { type: 'object' },
  })
  async merge(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response
  ): Promise<CartResponse> {
    if (!request.user?.userId) {
      return buildCartResponse(null, undefined, { ownerType: 'guest' });
    }

    const guestSessionId = this.guestCartSessionService.extractSessionId(request);

    if (!guestSessionId) {
      const cart = await this.getCartUseCase.execute({
        type: 'user',
        userId: request.user.userId,
      });

      return buildCartResponse(cart, undefined, {
        ownerType: 'user',
        requiresSignInForCheckout: false,
      });
    }

    const cart = await this.mergeGuestCartUseCase.execute(
      guestSessionId,
      request.user.userId
    );

    this.guestCartSessionService.clearSession(response);

    return buildCartResponse(cart, undefined, {
      ownerType: 'user',
      requiresSignInForCheckout: false,
    });
  }

  @Patch('items')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Update an item in the current cart' })
  @ApiOkResponse({
    description: 'Updated cart state.',
    schema: { type: 'object' },
  })
  async updateItem(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: UpdateCartItemDto
  ): Promise<CartResponse> {
    const actor = this.resolveWriteActor(request, response);

    if (!body.inventoryId) {
      const cart = await this.getCartUseCase.execute(actor, body.cartId);
      const priced = cart
        ? await this.couponPricingService.priceCart({
          userId: actor.type === 'user' ? actor.userId : undefined,
          cart,
          shopAdjustments: body.additionInfoShopCarts,
        })
        : null;

      return buildCartResponse(
        cart,
        priced
          ? {
            currency: priced.currency,
            subtotalPrice: priced.subtotalPrice,
            totalDiscount: priced.totalDiscount,
            subtotalAfterDiscount: priced.subtotalAfterDiscount,
            totalShippingFee: priced.totalShippingFee,
            totalPrice: priced.totalPrice,
            totalSelectedQuantity: priced.totalSelectedQuantity,
            totalQuantity: priced.totalQuantity,
          }
          : undefined
      );
    }

    const cart = resolveOrThrow(
      await this.updateCartItemUseCase.execute(actor, {
        cartId: body.cartId,
        inventoryId: body.inventoryId,
        quantity: body.quantity,
        isSelectOrder: body.isSelected,
      }),
      mapCartAppErrorToHttpException
    );

    if (!cart) {
      return buildCartResponse(null, undefined, {
        ownerType: actor.type,
        requiresSignInForCheckout: false,
      });
    }

    const priced = await this.couponPricingService.priceCart({
      userId: actor.type === 'user' ? actor.userId : undefined,
      cart,
      shopAdjustments: body.additionInfoShopCarts,
    });

    return buildCartResponse(cart, {
      currency: priced.currency,
      subtotalPrice: priced.subtotalPrice,
      totalDiscount: priced.totalDiscount,
      subtotalAfterDiscount: priced.subtotalAfterDiscount,
      totalShippingFee: priced.totalShippingFee,
      totalPrice: priced.totalPrice,
      totalSelectedQuantity: priced.totalSelectedQuantity,
      totalQuantity: priced.totalQuantity,
    });
  }

  @Delete('items')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Delete an item from the current cart' })
  @ApiOkResponse({
    description: 'Updated cart state.',
    schema: { type: 'object' },
  })
  async deleteItem(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
    @Query() query: DeleteCartItemQueryDto
  ): Promise<CartResponse> {
    const actor = this.resolveWriteActor(request, response);
    const cart = resolveOrThrow(
      await this.removeCartItemUseCase.execute(actor, query.inventoryId, query.cartId),
      mapCartAppErrorToHttpException
    );

    return buildCartResponse(cart, undefined, {
      ownerType: actor.type,
      requiresSignInForCheckout: false,
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
