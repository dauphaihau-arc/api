import {
  Controller, Get, Header, UseGuards, 
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import {
  missingRequiredPermissionsErrorExample,
  unauthorizedErrorExamples,
} from '~/domains/auth/api/rest/errors/auth-error-examples';
import {
  CarrierListResponseDto,
  toCarrierListResponse,
} from './responses/carrier.response';

/**
 * The carriers a seller may record on a shipment. Catalogue data is
 * code-defined, so the response needs no request context beyond the seller's
 * shop-management permission.
 */
@Controller('carriers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Carriers')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses({
  401: unauthorizedErrorExamples,
  403: [missingRequiredPermissionsErrorExample],
})
export class CarriersController {
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'List carriers',
    description: 'Lists the carriers available for shipment tracking and labels.',
  })
  @ApiOkResponse({ description: 'Carrier catalogue.', type: CarrierListResponseDto })
  list(): CarrierListResponseDto {
    return toCarrierListResponse();
  }
}
