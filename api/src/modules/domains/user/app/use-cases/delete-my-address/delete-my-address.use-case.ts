import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserAddressRepository } from '../../ports/user-address.repository';

@Injectable()
export class DeleteMyAddressUseCase {
  constructor(
    private readonly userAddressRepository: UserAddressRepository,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    addressId: string,
  ): Promise<void> {
    const deleted = await this.userAddressRepository.deleteOwnedById(
      actor.userId,
      addressId,
    );

    if (!deleted) {
      throw new NotFoundException('Address not found');
    }
  }
}
