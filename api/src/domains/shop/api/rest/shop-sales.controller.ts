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
import { BulkStopShopSalesUseCase } from '../../app/use-cases/bulk-stop-shop-sales/bulk-stop-shop-sales.use-case';
import { ShopSaleStopAction, StopShopSaleUseCase } from '../../app/use-cases/stop-shop-sale/stop-shop-sale.use-case';
import { BulkStopShopSalesDto } from './dto/bulk-stop-shop-sales.dto';
import { CreateShopSaleDto } from './dto/create-shop-sale.dto';
import { ListShopSalesQueryDto } from './dto/list-shop-sales.query.dto';
import {
  isShopAppError,
  mapShopAppErrorToHttpException,
} from './shop-http-error-mapper';
import {
  toShopSaleListResponse,
  toShopSaleResponse,
  toShopSaleStopListResponse,
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
    private readonly stopShopSaleUseCase: StopShopSaleUseCase,
    private readonly bulkStopShopSalesUseCase: BulkStopShopSalesUseCase,
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

  @Post(':sale_id/cancel')
  @ApiOperation({ summary: 'Irreversibly cancel a scheduled sale' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'sale_id', type: String })
  @ApiOkResponse({
    description: 'Cancelled sale.',
    schema: { type: 'object' },
  })
  async cancel(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('sale_id') saleId: string,
  ) {
    try {
      const sale = await this.stopShopSaleUseCase.execute(
        currentUser,
        shopId,
        saleId,
        ShopSaleStopAction.CANCEL,
      );

      return { sale: toShopSaleResponse(sale) };
    }
    catch (error) {
      this.throwMappedShopError(error);
    }
  }

  @Post(':sale_id/end')
  @ApiOperation({ summary: 'Irreversibly end an active sale early' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'sale_id', type: String })
  @ApiOkResponse({
    description: 'Ended sale.',
    schema: { type: 'object' },
  })
  async end(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('sale_id') saleId: string,
  ) {
    try {
      const sale = await this.stopShopSaleUseCase.execute(
        currentUser,
        shopId,
        saleId,
        ShopSaleStopAction.END,
      );

      return { sale: toShopSaleResponse(sale) };
    }
    catch (error) {
      this.throwMappedShopError(error);
    }
  }

  @Post('bulk-stop')
  @ApiOperation({
    summary: 'Cancel scheduled sales and end active sales in one request',
  })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Per-sale stop outcome.',
    schema: { type: 'object' },
  })
  async bulkStop(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Body() body: BulkStopShopSalesDto,
  ) {
    try {
      return toShopSaleStopListResponse(
        await this.bulkStopShopSalesUseCase.execute(currentUser, shopId, body.ids),
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
