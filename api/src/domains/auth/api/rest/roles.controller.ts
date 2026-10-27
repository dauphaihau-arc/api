import {
  Controller, Get, Header, UseGuards, 
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../guard/jwt-auth.guard';
import { PermissionsGuard } from '../guard/permissions.guard';
import { ListRolesUseCase } from '../../app/use-cases/list-roles/list-roles.use-case';
import {
  RoleListResponseDto,
  type RoleListResponse,
  toRoleListResponse,
} from './dto/role-list-response.dto';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('roles.read')
@ApiExcludeController()
@ApiTags('Roles')
@ApiCookieAuth('accessCookie')
export class RolesController {
  constructor(private readonly listRolesUseCase: ListRolesUseCase) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List assignable roles' })
  @ApiOkResponse({
    description: 'Roles sorted by key.',
    type: RoleListResponseDto,
  })
  async list(): Promise<RoleListResponse> {
    return toRoleListResponse(await this.listRolesUseCase.execute());
  }
}
