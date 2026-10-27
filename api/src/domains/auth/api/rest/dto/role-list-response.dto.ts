import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type { RoleSummary } from '../../../app/use-cases/list-roles/list-roles.use-case';

export class RoleResponseDto {
  @ApiProperty({ description: 'Stable role key.' })
  key!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ required: false })
  description?: string;
}

export class RoleListResponseDto {
  @ApiProperty({ type: [RoleResponseDto] })
  @Type(() => RoleResponseDto)
  roles!: RoleResponseDto[];
}

export type RoleListResponse = {
  roles: RoleSummary[];
};

export function toRoleListResponse(roles: RoleSummary[]): RoleListResponse {
  return { roles };
}
