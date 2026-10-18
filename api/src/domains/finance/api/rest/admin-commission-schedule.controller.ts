import {
  Body,
  Controller,
  Param,
  Put,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import { RecordCommissionScheduleUseCase } from '../../app/use-cases/record-commission-schedule/record-commission-schedule.use-case';
import { RecordCommissionScheduleDto } from './dto/record-commission-schedule.dto';
import { adminCommissionScheduleControllerErrorResponses } from './errors/finance-error-responses';
import { FinanceExceptionsFilter } from './errors/finance-exceptions.filter';
import {
  CommissionScheduleResponseDto,
  toCommissionScheduleResponse,
} from './responses/commission-schedule.response';

@Controller('admin/shops/:shop_id/commission-schedule')
@UseFilters(FinanceExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('finance.manage')
@ApiExcludeController()
@ApiTags('Admin Finance')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses(adminCommissionScheduleControllerErrorResponses.controller)
export class AdminCommissionScheduleController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly recordCommissionScheduleUseCase: RecordCommissionScheduleUseCase,
  ) {}

  @Put()
  @ApiOperation({ summary: 'Record or replace a shop commission schedule' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({ type: CommissionScheduleResponseDto })
  @ApiErrorResponses(adminCommissionScheduleControllerErrorResponses.record)
  async record(
    @Param('shop_id') shopPublicId: string,
    @Body() body: RecordCommissionScheduleDto,
  ): Promise<CommissionScheduleResponseDto> {
    const shopId = await this.shopAccessService.resolveShopPublicId(shopPublicId);

    const schedule = await this.recordCommissionScheduleUseCase.execute({
      shopId,
      shopPublicId,
      // The DTO validates the ISO date string; the use case takes an instant.
      effectiveFrom: new Date(body.effectiveFrom),
      rateBasisPoints: body.rateBasisPoints,
    });

    return toCommissionScheduleResponse(schedule, shopPublicId);
  }
}
