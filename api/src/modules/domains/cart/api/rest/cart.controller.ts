import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { resolveOrThrow } from '~/common/application/result';
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { AddCartItemUseCase } from '../../app/use-cases/add-cart-item/add-cart-item.use-case';
import { GetCartUseCase } from '../../app/use-cases/get-cart/get-cart.use-case';
import { RemoveCartItemUseCase } from '../../app/use-cases/remove-cart-item/remove-cart-item.use-case';
import { UpdateCartItemUseCase } from '../../app/use-cases/update-cart-item/update-cart-item.use-case';
import {
  buildCartResponse,
  type CartResponse
} from '../../app/cart.types';
import { mapCartAppErrorToHttpException } from './cart-http-error-mapper';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { DeleteCartItemQueryDto } from './dto/delete-cart-item.query.dto';
import { GetCartQueryDto } from './dto/get-cart.query.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Controller('user/cart')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CartController {
  constructor(
    private readonly getCartUseCase: GetCartUseCase,
    private readonly addCartItemUseCase: AddCartItemUseCase,
    private readonly updateCartItemUseCase: UpdateCartItemUseCase,
    private readonly removeCartItemUseCase: RemoveCartItemUseCase
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  async cart(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: GetCartQueryDto
  ): Promise<CartResponse> {
    const cart = await this.getCartUseCase.execute(currentUser, query.cartId);
    return buildCartResponse(cart);
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  async addItem(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: AddCartItemDto
  ): Promise<CartResponse> {
    const cart = resolveOrThrow(
      await this.addCartItemUseCase.execute(currentUser, {
        inventoryId: body.inventoryId,
        quantity: body.quantity,
        isTemp: body.isTemp,
      }),
      mapCartAppErrorToHttpException
    );

    return buildCartResponse(cart);
  }

  @Patch()
  @Header('Cache-Control', 'private, no-store')
  async updateItem(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: UpdateCartItemDto
  ): Promise<CartResponse> {
    if (!body.inventoryId) {
      const cart = await this.getCartUseCase.execute(currentUser, body.cartId);
      return buildCartResponse(cart);
    }

    const cart = resolveOrThrow(
      await this.updateCartItemUseCase.execute(currentUser, {
        cartId: body.cartId,
        inventoryId: body.inventoryId,
        quantity: body.quantity,
        isSelectOrder: body.isSelected,
      }),
      mapCartAppErrorToHttpException
    );

    return buildCartResponse(cart);
  }

  @Delete()
  @Header('Cache-Control', 'private, no-store')
  async deleteItem(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: DeleteCartItemQueryDto
  ): Promise<CartResponse> {
    const cart = resolveOrThrow(
      await this.removeCartItemUseCase.execute(
        currentUser,
        query.inventoryId,
        query.cartId
      ),
      mapCartAppErrorToHttpException
    );

    return buildCartResponse(cart);
  }
}
