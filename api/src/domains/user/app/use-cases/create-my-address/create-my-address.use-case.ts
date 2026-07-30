import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { UserAddressRepository } from '../../ports/user-address.repository';
import type {
  CreateMyAddressInput,
  UserAddressSummary,
} from '../../user-address.types';

@Injectable()
export class CreateMyAddressUseCase {
  constructor(
    private readonly userAddressRepository: UserAddressRepository,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    input: Omit<CreateMyAddressInput, 'userId'>,
  ): Promise<UserAddressSummary> {
    const ownedAddressCount = await this.userAddressRepository.countOwnedByUserId(
      actor.userId,
    );
    const shouldBePrimary = input.isPrimary === true || ownedAddressCount === 0;

    if (shouldBePrimary) {
      await this.userAddressRepository.clearPrimaryForUser(actor.userId);
    }

    return this.userAddressRepository.create({
      ...input,
      userId: actor.userId,
      isPrimary: shouldBePrimary,
    });
  }
}
