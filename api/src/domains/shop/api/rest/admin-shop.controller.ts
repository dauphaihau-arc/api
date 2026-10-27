import {
  Controller, Get, Header, Query, UseGuards, 
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { ListAdminShopsUseCase } from '../../app/use-cases/list-admin-shops/list-admin-shops.use-case';
import { ListAdminShopsQueryDto } from './dto/list-admin-shops.query.dto';
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
@ApiExcludeController()
@ApiTags('Admin Shops')
@ApiCookieAuth('accessCookie')
export class AdminShopController {
  constructor(private readonly listAdminShopsUseCase: ListAdminShopsUseCase) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List admin shops' })
  @ApiOkResponse({
    description: 'Paginated admin shop directory.',
    type: AdminShopListResponseDto,
  })
  async list(@Query() query: ListAdminShopsQueryDto) {
    return toAdminShopListResponse(
      await this.listAdminShopsUseCase.execute(query),
    );
  }
}
