import { Expose, Type } from 'class-transformer';
import type { UserStatus } from '../../../domain/enums/user-status.enum';
import type { UserProfile } from '../../../app/auth.types';

class MePreferencesResponseDto {
  @Expose()
  region!: string;

  @Expose()
  language!: string;

  @Expose()
  currency!: string;
}

class MeShopResponseDto {
  @Expose()
  id!: string;

  @Expose({ name: 'public_id' })
  publicId?: string;

  @Expose({ name: 'owner_user_id' })
  ownerUserId!: string;

  @Expose({ name: 'shop_name' })
  shopName!: string;

  @Expose()
  status!: string;
}

export class MeResponseDto {
  @Expose()
  id!: string;

  @Expose()
  email!: string;

  @Expose({ name: 'display_name' })
  displayName?: string;

  @Expose()
  status!: UserStatus;

  @Expose({ name: 'session_id' })
  sessionId!: string;

  @Expose()
  roles!: string[];

  @Expose()
  permissions!: string[];

  @Expose()
  preferences?: MePreferencesResponseDto;

  @Expose()
  shop?: MeShopResponseDto;

  static fromUserProfile(userProfile: UserProfile): MeResponseDto {
    const dto = new MeResponseDto();
    dto.id = userProfile.id;
    dto.email = userProfile.email;
    dto.displayName = userProfile.displayName;
    dto.status = userProfile.status;
    dto.sessionId = userProfile.sessionId;
    dto.roles = userProfile.roles;
    dto.permissions = userProfile.permissions;
    if (userProfile.preferences) {
      dto.preferences = Object.assign(new MePreferencesResponseDto(), userProfile.preferences);
    }
    if (userProfile.shop) {
      dto.shop = Object.assign(new MeShopResponseDto(), userProfile.shop);
    }
    return dto;
  }
}

export class AuthUserResponseDto {
  @Expose()
  @Type(() => MeResponseDto)
  user!: MeResponseDto;

  static fromUserProfile(userProfile: UserProfile): AuthUserResponseDto {
    const dto = new AuthUserResponseDto();
    dto.user = MeResponseDto.fromUserProfile(userProfile);
    return dto;
  }
}
