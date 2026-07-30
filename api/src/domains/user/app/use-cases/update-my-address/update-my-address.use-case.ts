import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { UserAddressRepository } from '../../ports/user-address.repository';
import type {
  UpdateMyAddressInput,
  UserAddressSummary,
} from '../../user-address.types';

@Injectable()
export class UpdateMyAddressUseCase {
  constructor(
    private readonly userAddressRepository: UserAddressRepository,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    addressId: string,
    input: UpdateMyAddressInput,
  ): Promise<UserAddressSummary> {
    if (input.isPrimary === true) {
      await this.userAddressRepository.clearPrimaryForUser(
        actor.userId,
        addressId,
      );
    }

    const updatedAddress = await this.userAddressRepository.updateOwnedById(
      actor.userId,
      addressId,
      input,
    );

    if (!updatedAddress) {
      throw new NotFoundException('Address not found');
    }

    return updatedAddress;
  }
}
