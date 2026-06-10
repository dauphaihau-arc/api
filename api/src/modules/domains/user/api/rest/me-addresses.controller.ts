import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags
} from '@nestjs/swagger';
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import {
  buildListMyAddressesQuery,
  DEFAULT_USER_ADDRESS_LIST_SORT
} from '../../app/user-address.types';
import { CreateMyAddressUseCase } from '../../app/use-cases/create-my-address/create-my-address.use-case';
import { DeleteMyAddressUseCase } from '../../app/use-cases/delete-my-address/delete-my-address.use-case';
import { GetMyAddressUseCase } from '../../app/use-cases/get-my-address/get-my-address.use-case';
import { ListMyAddressesUseCase } from '../../app/use-cases/list-my-addresses/list-my-addresses.use-case';
import { UpdateMyAddressUseCase } from '../../app/use-cases/update-my-address/update-my-address.use-case';
import { CreateMyAddressDto } from './dto/create-my-address.dto';
import { ListMyAddressesQueryDto } from './dto/list-my-addresses.query.dto';
import { UpdateMyAddressDto } from './dto/update-my-address.dto';
import {
  toMyAddressListResponse,
  toMyAddressResponse
} from './me-address.response';

@Controller('me/addresses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('My Addresses')
@ApiCookieAuth('accessCookie')
export class MeAddressesController {
  constructor(
    private readonly listMyAddressesUseCase: ListMyAddressesUseCase,
    private readonly createMyAddressUseCase: CreateMyAddressUseCase,
    private readonly getMyAddressUseCase: GetMyAddressUseCase,
    private readonly updateMyAddressUseCase: UpdateMyAddressUseCase,
    private readonly deleteMyAddressUseCase: DeleteMyAddressUseCase
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List my addresses' })
  @ApiOkResponse({
    description: 'Paginated address list.',
    schema: { type: 'object' },
  })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListMyAddressesQueryDto
  ) {
    const result = await this.listMyAddressesUseCase.execute(
      currentUser,
      buildListMyAddressesQuery({
        page: query.page,
        limit: query.limit,
        sort: DEFAULT_USER_ADDRESS_LIST_SORT,
      })
    );

    return toMyAddressListResponse(result);
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Create my address' })
  @ApiOkResponse({
    description: 'Created address.',
    schema: { type: 'object' },
  })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateMyAddressDto
  ) {
    const address = await this.createMyAddressUseCase.execute(currentUser, {
      fullName: body.full_name,
      address1: body.address_1,
      address2: body.address_2,
      city: body.city,
      state: body.state,
      zip: body.zip,
      country: body.country,
      phone: body.phone,
      isPrimary: body.is_primary,
    });

    return { address: toMyAddressResponse(address) };
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get my address by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({
    description: 'Address detail.',
    schema: { type: 'object' },
  })
  @ApiNotFoundResponse({ description: 'Address not found.' })
  async detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string
  ) {
    const address = await this.getMyAddressUseCase.execute(currentUser, id);

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    return { address: toMyAddressResponse(address) };
  }

  @Patch(':id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Update my address' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({
    description: 'Updated address.',
    schema: { type: 'object' },
  })
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateMyAddressDto
  ) {
    const address = await this.updateMyAddressUseCase.execute(currentUser, id, {
      fullName: body.full_name,
      address1: body.address_1,
      address2: body.address_2,
      city: body.city,
      state: body.state,
      zip: body.zip,
      country: body.country,
      phone: body.phone,
      isPrimary: body.is_primary,
    });

    return { address: toMyAddressResponse(address) };
  }

  @Delete(':id')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete my address' })
  @ApiParam({ name: 'id', type: String })
  @ApiNoContentResponse({ description: 'Address deleted.' })
  async delete(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string
  ): Promise<void> {
    await this.deleteMyAddressUseCase.execute(currentUser, id);
  }
}
