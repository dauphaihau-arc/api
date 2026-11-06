import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { LocationReferenceRepository } from '~/domains/location/app/ports/location-reference.repository';
import { resolveUpdateAddressLocation } from '~/domains/location/app/address-location.resolver';
import { UserAddressRepository } from '../../ports/user-address.repository';
import type {
  UpdateMyAddressCommand,
  UserAddressSummary,
} from '../../user-address.types';

@Injectable()
export class UpdateMyAddressUseCase {
  constructor(
    private readonly userAddressRepository: UserAddressRepository,
    private readonly locationReferenceRepository: LocationReferenceRepository,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    addressId: string,
    command: UpdateMyAddressCommand,
  ): Promise<UserAddressSummary> {
    const existingLocation =
      await this.userAddressRepository.findOwnedLocationById(
        actor.userId,
        addressId,
      );

    if (!existingLocation) {
      throw new NotFoundException('Address not found');
    }

    const locationUpdate = await resolveUpdateAddressLocation(
      this.locationReferenceRepository,
      existingLocation,
      command,
    );

    if (command.isPrimary === true) {
      await this.userAddressRepository.clearPrimaryForUser(
        actor.userId,
        addressId,
      );
    }

    const updatedAddress = await this.userAddressRepository.updateOwnedById(
      actor.userId,
      addressId,
      {
        fullName: command.fullName,
        address1: command.address1,
        address2: command.address2,
        city: command.city,
        zip: command.zip,
        phone: command.phone,
        isPrimary: command.isPrimary,
        ...(locationUpdate ?? {}),
      },
    );

    if (!updatedAddress) {
      throw new NotFoundException('Address not found');
    }

    return updatedAddress;
  }
}
