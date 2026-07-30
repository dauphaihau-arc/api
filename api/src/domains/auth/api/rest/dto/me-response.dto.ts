import { Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import type { UserStatus } from '../../../domain/enums/user-status.enum';
import type { UserProfile } from '../../../app/auth.types';

class MePreferencesResponseDto {
  @ApiProperty()
  @Expose()
  region!: string;

  @ApiProperty()
  @Expose()
  language!: string;

  @ApiProperty()
  @Expose()
  currency!: string;
}

class CurrentUserShopResponseDto {
  @ApiProperty({ name: 'shop_name' })
  @Expose({ name: 'shop_name' })
  shopName!: string;
}

export class CurrentUserResponseDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  email!: string;

  @ApiProperty({ name: 'display_name', required: false })
  @Expose({ name: 'display_name' })
  displayName?: string;

  @ApiProperty({
    type: [String],
  })
  @Expose()
  permissions!: string[];

  @ApiProperty({
    required: false,
    type: () => MePreferencesResponseDto,
  })
  @Expose()
  preferences?: MePreferencesResponseDto;

  @ApiProperty({
    required: false,
    type: () => CurrentUserShopResponseDto,
  })
  @Expose()
  shop?: CurrentUserShopResponseDto;

  static fromUserProfile(userProfile: UserProfile): CurrentUserResponseDto {
    const dto = new CurrentUserResponseDto();
    dto.id = userProfile.id;
    dto.email = userProfile.email;
    dto.displayName = userProfile.displayName;
    dto.permissions = userProfile.permissions;
    if (userProfile.preferences) {
      dto.preferences = Object.assign(new MePreferencesResponseDto(), userProfile.preferences);
    }
    if (userProfile.shop) {
      dto.shop = Object.assign(new CurrentUserShopResponseDto(), {
        shopName: userProfile.shop.shopName,
      });
    }
    return dto;
  }
}

class MeShopResponseDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty({ name: 'public_id', required: false })
  @Expose({ name: 'public_id' })
  publicId?: string;

  @ApiProperty({ name: 'owner_user_id' })
  @Expose({ name: 'owner_user_id' })
  ownerUserId!: string;

  @ApiProperty({ name: 'shop_name' })
  @Expose({ name: 'shop_name' })
  shopName!: string;

  @ApiProperty()
  @Expose()
  status!: string;
}

export class MeResponseDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  email!: string;

  @ApiProperty({ name: 'display_name', required: false })
  @Expose({ name: 'display_name' })
  displayName?: string;

  @ApiProperty()
  @Expose()
  status!: UserStatus;

  @ApiProperty({ name: 'session_id' })
  @Expose({ name: 'session_id' })
  sessionId!: string;

  @ApiProperty({
    type: [String],
  })
  @Expose()
  roles!: string[];

  @ApiProperty({
    type: [String],
  })
  @Expose()
  permissions!: string[];

  @ApiProperty({
    required: false,
    type: () => MePreferencesResponseDto,
  })
  @Expose()
  preferences?: MePreferencesResponseDto;

  @ApiProperty({
    required: false,
    type: () => MeShopResponseDto,
  })
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
  @ApiProperty({
    type: () => MeResponseDto,
  })
  @Expose()
  @Type(() => MeResponseDto)
  user!: MeResponseDto;

  static fromUserProfile(userProfile: UserProfile): AuthUserResponseDto {
    const dto = new AuthUserResponseDto();
    dto.user = MeResponseDto.fromUserProfile(userProfile);
    return dto;
  }
}
