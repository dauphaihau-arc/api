import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class AssignUserRolesDto {
  @ApiProperty({
    type: [String],
    description: 'Role keys to assign. An empty array removes all roles.',
  })
  @IsArray()
  @IsString({ each: true })
  roles!: string[];
}
