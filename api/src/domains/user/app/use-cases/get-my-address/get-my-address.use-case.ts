import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { UserAddressRepository } from '../../ports/user-address.repository';
import type { UserAddressSummary } from '../../user-address.types';

@Injectable()
export class GetMyAddressUseCase {
  constructor(
    private readonly userAddressRepository: UserAddressRepository,
  ) {}

  execute(
    actor: AuthenticatedUser,
    addressId: string,
  ): Promise<UserAddressSummary | null> {
    return this.userAddressRepository.findOwnedById(actor.userId, addressId);
  }
}
