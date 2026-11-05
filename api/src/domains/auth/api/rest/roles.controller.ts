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
import { JwtAuthGuard } from '../guard/jwt-auth.guard';
import { PermissionsGuard } from '../guard/permissions.guard';
import { ListRolesUseCase } from '../../app/use-cases/list-roles/list-roles.use-case';
import { adminRolesControllerErrorResponses } from './errors/role-error-responses';
import {
  RoleListResponseDto,
  toRoleListResponse,
} from './dto/role-list-response.dto';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('roles.read')
@ApiTags('Admin Roles')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses(adminRolesControllerErrorResponses.controller)
export class RolesController {
  constructor(private readonly listRolesUseCase: ListRolesUseCase) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({
    summary: 'List assignable roles',
    description:
      'Returns every role key an operator may assign to a user, sorted by key.',
  })
  @ApiOkResponse({
    description: 'Roles sorted by key.',
    type: RoleListResponseDto,
  })
  async list(): Promise<RoleListResponseDto> {
    return toRoleListResponse(await this.listRolesUseCase.execute());
  }
}
