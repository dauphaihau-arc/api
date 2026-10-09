import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type {
  UserAddressListResult,
  UserAddressSummary,
} from '../../../app/user-address.types';

export class MyAddressResponseDto {
  @ApiProperty({ description: 'Internal address id.' })
  id!: string;

  @ApiProperty({ description: 'Owning user internal id.' })
  user!: string;

  @ApiProperty()
  full_name!: string;

  @ApiProperty()
  address_1!: string;

  @ApiProperty({ required: false })
  address_2?: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  state!: string;

  @ApiProperty()
  zip!: string;

  @ApiProperty()
  country!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty()
  is_primary!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: Date;
}

export class MyAddressEnvelopeResponseDto {
  @ApiProperty({ type: MyAddressResponseDto })
  @Type(() => MyAddressResponseDto)
  address!: MyAddressResponseDto;
}

export class MyAddressListResponseDto {
  @ApiProperty({ type: [MyAddressResponseDto] })
  @Type(() => MyAddressResponseDto)
  results!: MyAddressResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total_pages!: number;

  @ApiProperty()
  total_results!: number;
}

export function toMyAddressResponse(address: UserAddressSummary) {
  return {
    id: address.id,
    user: address.userId,
    full_name: address.fullName,
    address_1: address.address1,
    ...(address.address2 ? { address_2: address.address2 } : {}),
    city: address.city,
    state: address.state,
    zip: address.zip,
    country: address.country,
    phone: address.phone,
    is_primary: address.isPrimary,
    created_at: address.createdAt,
    updated_at: address.updatedAt,
  };
}

export function toMyAddressListResponse(result: UserAddressListResult) {
  return {
    results: result.results.map(toMyAddressResponse),
    page: result.page,
    limit: result.limit,
    total_pages: result.totalPages,
    total_results: result.totalResults,
  };
}
