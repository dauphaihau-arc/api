import {
  Controller, Get, Header, Query, UseGuards, 
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { ListAdminShopsUseCase } from '../../app/use-cases/list-admin-shops/list-admin-shops.use-case';
import { ListAdminShopsQueryDto } from './dto/list-admin-shops.query.dto';
import { adminShopControllerErrorResponses } from './errors/shop-error-responses';
import {
  AdminShopListResponseDto,
  toAdminShopListResponse,
} from './responses/admin-shop.response';

/**
 * Operators list every shop. Gated by `orders.manage`, not `shops.manage`:
 * sellers hold `shops.manage` for their own shop, and using it here would
 * expose the whole directory to them.
 */
@Controller('admin/shops')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('orders.manage')
@ApiTags('Admin Shops')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses(adminShopControllerErrorResponses.controller)
export class AdminShopController {
  constructor(private readonly listAdminShopsUseCase: ListAdminShopsUseCase) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List admin shops' })
  @ApiOkResponse({
    description: 'Paginated admin shop directory.',
    type: AdminShopListResponseDto,
  })
  @ApiErrorResponses(adminShopControllerErrorResponses.list)
  async list(@Query() query: ListAdminShopsQueryDto) {
    return toAdminShopListResponse(
      await this.listAdminShopsUseCase.execute(query),
    );
  }
}
