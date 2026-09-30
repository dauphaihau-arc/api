import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { CreateShopSaleUseCase } from '../../app/use-cases/create-shop-sale/create-shop-sale.use-case';
import { ListShopSalesUseCase } from '../../app/use-cases/list-shop-sales/list-shop-sales.use-case';
import { CreateShopSaleDto } from './dto/create-shop-sale.dto';
import { ListShopSalesQueryDto } from './dto/list-shop-sales.query.dto';
import {
  isShopAppError,
  mapShopAppErrorToHttpException,
} from './shop-http-error-mapper';
import {
  toShopSaleListResponse,
  toShopSaleResponse,
} from './shop-sale.response';

@Controller('shops/:shop_id/sales')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Sales')
@ApiCookieAuth('accessCookie')
export class ShopSalesController {
  constructor(
    private readonly createShopSaleUseCase: CreateShopSaleUseCase,
    private readonly listShopSalesUseCase: ListShopSalesUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a percentage shop sale' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Created sale.',
    schema: { type: 'object' },
  })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Body() body: CreateShopSaleDto,
  ) {
    try {
      const sale = await this.createShopSaleUseCase.execute(
        currentUser,
        shopId,
        body,
      );

      return { sale: toShopSaleResponse(sale) };
    }
    catch (error) {
      this.throwMappedShopError(error);
    }
  }

  @Get()
  @ApiOperation({ summary: 'List shop sales' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Paginated sale list.',
    schema: { type: 'object' },
  })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Query() query: ListShopSalesQueryDto,
  ) {
    try {
      return toShopSaleListResponse(
        await this.listShopSalesUseCase.execute(currentUser, shopId, query),
      );
    }
    catch (error) {
      this.throwMappedShopError(error);
    }
  }

  private throwMappedShopError(error: unknown): never {
    if (isShopAppError(error)) {
      throw mapShopAppErrorToHttpException(error);
    }

    throw error;
  }
}
