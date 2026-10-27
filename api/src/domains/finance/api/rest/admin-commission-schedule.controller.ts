import {
  Body,
  Controller,
  Get,
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
import { GetCommissionScheduleUseCase } from '../../app/use-cases/get-commission-schedule/get-commission-schedule.use-case';
import { RecordCommissionScheduleUseCase } from '../../app/use-cases/record-commission-schedule/record-commission-schedule.use-case';
import { RecordCommissionScheduleDto } from './dto/record-commission-schedule.dto';
import { adminCommissionScheduleControllerErrorResponses } from './errors/finance-error-responses';
import { FinanceExceptionsFilter } from './errors/finance-exceptions.filter';
import {
  CommissionScheduleResponseDto,
  toCommissionScheduleResponse,
} from './responses/commission-schedule.response';
import {
  AdminShopCommissionScheduleResponseDto,
  toAdminShopCommissionScheduleResponse,
} from './responses/current-commission-schedule.response';

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
    private readonly getCommissionScheduleUseCase: GetCommissionScheduleUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the Commission Schedule in force for a shop' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({ type: AdminShopCommissionScheduleResponseDto })
  @ApiErrorResponses(adminCommissionScheduleControllerErrorResponses.read)
  async read(
    @Param('shop_id') shopPublicId: string,
  ): Promise<AdminShopCommissionScheduleResponseDto> {
    const shopId = await this.shopAccessService.resolveShopPublicId(shopPublicId);

    return toAdminShopCommissionScheduleResponse(
      await this.getCommissionScheduleUseCase.execute({ shopId }),
      shopPublicId,
    );
  }

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
