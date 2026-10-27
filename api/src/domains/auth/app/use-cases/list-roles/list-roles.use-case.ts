import { Injectable } from '@nestjs/common';
import { AuthUserRepository } from '../../ports/auth-user.repository';

export interface RoleSummary {
  key: string;
  name: string;
  description?: string;
}

@Injectable()
export class ListRolesUseCase {
  constructor(private readonly authUserRepository: AuthUserRepository) {}

  async execute(): Promise<RoleSummary[]> {
    const roles = await this.authUserRepository.findAllRoles();

    return roles.map((role) => ({
      key: role.key.toString(),
      name: role.name,
      ...(role.description !== undefined
        ? { description: role.description }
        : {}),
    })).sort((left, right) => left.key.localeCompare(right.key));
  }
}
