import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { LocationReferenceRepository } from '~/domains/location/app/ports/location-reference.repository';
import { resolveCreateAddressLocation } from '~/domains/location/app/address-location.resolver';
import { resolveCreateAddressContact } from '~/domains/location/app/address-contact.resolver';
import { UserAddressRepository } from '../../ports/user-address.repository';
import type {
  CreateMyAddressCommand,
  UserAddressSummary,
} from '../../user-address.types';

@Injectable()
export class CreateMyAddressUseCase {
  constructor(
    private readonly userAddressRepository: UserAddressRepository,
    private readonly locationReferenceRepository: LocationReferenceRepository,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    command: CreateMyAddressCommand,
  ): Promise<UserAddressSummary> {
    const location = await resolveCreateAddressLocation(
      this.locationReferenceRepository,
      command,
    );

    const contact = await resolveCreateAddressContact(
      this.locationReferenceRepository,
      location.countryCode,
      { phone: command.phone, zip: command.zip },
    );

    const ownedAddressCount =
      await this.userAddressRepository.countOwnedByUserId(actor.userId);

    const shouldBePrimary = command.isPrimary === true || ownedAddressCount === 0;

    if (shouldBePrimary) {
      await this.userAddressRepository.clearPrimaryForUser(actor.userId);
    }

    return this.userAddressRepository.create({
      userId: actor.userId,
      fullName: command.fullName,
      address1: command.address1,
      address2: command.address2,
      city: command.city,
      zip: contact.zip,
      phone: contact.phone,
      isPrimary: shouldBePrimary,
      countryCode: location.countryCode,
      stateCode: location.stateCode,
      stateText: location.stateText,
    });
  }
}
